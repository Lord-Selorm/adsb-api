import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';
import { TrackStoreService, type Track } from './track-store.service.js';

/**
 * Live position + state feed for every sensor source. Clients connect over
 * Socket.IO at /socket.io. Updates broadcast as `track:update`; evictions as
 * `track:remove`. Legacy `aircraft:update` / `aircraft:remove` (ADS-B only)
 * keep old clients working. Connect with `?source=drone_rid`, `?source=adsb`,
 * or `?source=ais` to receive only that source, otherwise all updates arrive.
 */
@WebSocketGateway({
  cors: { origin: true },
  transports: ['websocket', 'polling'],
})
@Injectable()
export class TracksGateway {
  @WebSocketServer()
  private readonly server!: Server;

  constructor(private readonly tracks: TrackStoreService) {
    this.tracks.events.on('update', (t: Track) => {
      this.server?.emit('track:update', t);
      this.server?.to(this.room(t.source)).emit('track:update', t);
      if (t.source === 'adsb') this.server?.emit('aircraft:update', t);
    });
    this.tracks.events.on(
      'remove',
      (r: { source: 'adsb' | 'drone_rid' | 'ais'; id: string; at: number }) => {
        this.server?.emit('track:remove', r);
        this.server?.to(this.room(r.source)).emit('track:remove', r);
        if (r.source === 'adsb') {
          this.server?.emit('aircraft:remove', { icao: r.id, at: r.at });
        }
      },
    );
  }

  handleConnection(client: Socket): void {
    const source = client.handshake.query.source as string | undefined;
    if (source === 'adsb' || source === 'drone_rid' || source === 'ais') {
      client.join(this.room(source));
    }
  }

  @SubscribeMessage('track:list')
  handleList(@MessageBody() payload?: { source?: string }): {
    count: number;
    tracks: Track[];
  } {
    const source =
      payload?.source === 'adsb' ||
      payload?.source === 'drone_rid' ||
      payload?.source === 'ais'
        ? payload.source
        : undefined;
    const tracks = this.tracks.getAll(source);
    return { count: tracks.length, tracks };
  }

  /** Legacy ADS-B snapshot for old clients (same shape as GET /api/aircraft). */
  @SubscribeMessage('aircraft:list')
  handleAircraftList(): { count: number; aircraft: Track[] } {
    const aircraft = this.tracks.getAll('adsb');
    return { count: aircraft.length, aircraft };
  }

  private room(source: string): string {
    return `source:${source}`;
  }
}
