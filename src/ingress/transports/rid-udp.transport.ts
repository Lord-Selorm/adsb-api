import { Injectable, Logger } from '@nestjs/common';
import type { Socket } from 'node:dgram';
import { createSocket } from 'node:dgram';
import type { DataSource, DataSourceKind } from '../data-source.interface.js';

/**
 * Physical URM-01/02 Drone RID receiver over UDP (default 0.0.0.0:65100).
 *
 * The module is a passive sender: it streams newline-delimited JSON envelopes
 * to the host on UDP port 65100 —
 *   {"frame_type":7,"dev_sn":"...","frame_info":{datetime,longitude,latitude}}  device GNSS heartbeat (no drone)
 *   {"frame_type":3,"frame_info":{...}}                                          drone alarm
 * This transport binds the local socket and fans each datagram out as a raw
 * chunk to the ingress pipeline, mirroring the AdsB TCP/serial transports.
 */
@Injectable()
export class RidUdpTransport implements DataSource {
  readonly kind: DataSourceKind = 'rid_udp';
  isConnected = false;

  private readonly logger = new Logger(RidUdpTransport.name);
  private socket: Socket | null = null;
  private lastMessageAt: number = 0;
  private dataListeners: Array<(chunk: Buffer) => void> = [];
  private errorListeners: Array<(err: Error) => void> = [];

  constructor(
    private readonly config: {
      host: string;
      port: number;
    },
  ) {}

  onData(listener: (chunk: Buffer) => void): void {
    this.dataListeners.push(listener);
  }

  onError(listener: (err: Error) => void): void {
    this.errorListeners.push(listener);
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    const socket = createSocket('udp4');
    this.socket = socket;

    socket.on('message', (msg) => this.onMessage(msg));
    socket.on('error', (err) => {
      this.logger.error(`RID UDP transport error: ${err.message}`);
      this.errorListeners.forEach((cb) => cb(err));
    });

    await new Promise<void>((resolve, reject) => {
      socket.once('listening', resolve);
      socket.once('error', reject);
      socket.bind(this.config.port, this.config.host);
    });

    const addr = socket.address();
    this.isConnected = true;
    this.logger.log(
      `RID UDP transport listening on udp://${this.config.host}:${this.config.port} (bound ${addr.address}:${addr.port})`,
    );
  }

  async disconnect(): Promise<void> {
    if (!this.socket) return;
    this.socket.close();
    this.socket = null;
    this.isConnected = false;
  }

  getLastMessageAt(): number {
    return this.lastMessageAt;
  }

  getConnectionStatus(): string {
    return this.isConnected ? 'connected' : 'disconnected';
  }

  /** Actual bound local port (useful when configured with port 0 / tests). */
  getLocalPort(): number | undefined {
    if (!this.socket) return undefined;
    try {
      return this.socket.address().port;
    } catch {
      return undefined;
    }
  }

  private onMessage(msg: Buffer): void {
    this.lastMessageAt = Date.now();
    this.dataListeners.forEach((cb) => cb(msg));
  }
}