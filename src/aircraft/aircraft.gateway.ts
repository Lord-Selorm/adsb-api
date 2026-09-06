import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Injectable } from '@nestjs/common';
import { AircraftStoreService, AircraftState } from './aircraft-store.service.js';

/**
 * Live position + state feed. Clients connect over Socket.IO at /socket.io.
 * Every aircraft update is broadcast as `aircraft:update`; evictions as
 * `aircraft:remove`. A client can request a full snapshot via `aircraft:list`.
 */
@WebSocketGateway({
  cors: { origin: true },
  transports: ['websocket', 'polling'],
})
@Injectable()
export class AircraftGateway {
  @WebSocketServer()
  private readonly server!: Server;

  constructor(private readonly store: AircraftStoreService) {
    this.store.events.on('update', (s: AircraftState) => {
      this.server?.emit('aircraft:update', s);
    });
    this.store.events.on('remove', (icao: string) => {
      this.server?.emit('aircraft:remove', { icao, at: Date.now() });
    });
  }

  @SubscribeMessage('aircraft:list')
  handleList(): { count: number; aircraft: AircraftState[] } {
    const aircraft = this.store.getAll();
    return { count: aircraft.length, aircraft };
  }
}