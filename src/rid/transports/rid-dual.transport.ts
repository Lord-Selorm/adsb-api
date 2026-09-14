import { Injectable, Logger } from '@nestjs/common';
import type { DataSource, DataSourceKind } from '../../common/data-source.interface.js';
import type { RidUdpTransport } from './rid-udp.transport.js';
import type { RidSerialTransport } from './rid-serial.transport.js';

/**
 * Composite transport running both RidUdpTransport and RidSerialTransport in
 * parallel. This allows the URM-01/02 receiver to feed data via Ethernet
 * (UDP 65100) or USB Type-C (COM port) without manual reconfiguration.
 */
@Injectable()
export class RidDualTransport implements DataSource {
  readonly kind: DataSourceKind = 'rid_dual';

  private readonly logger = new Logger(RidDualTransport.name);
  private dataListeners: Array<(chunk: Buffer) => void> = [];
  private errorListeners: Array<(err: Error) => void> = [];

  constructor(
    readonly udp: RidUdpTransport,
    readonly serial: RidSerialTransport,
  ) {
    this.udp.onData((chunk) => this.fanInData(chunk));
    this.serial.onData((chunk) => this.fanInData(chunk));

    this.udp.onError((err) => this.fanInError(err));
    this.serial.onError((err) => this.fanInError(err));
  }

  get isConnected(): boolean {
    return this.udp.isConnected || this.serial.isConnected;
  }

  onData(listener: (chunk: Buffer) => void): void {
    this.dataListeners.push(listener);
  }

  onError(listener: (err: Error) => void): void {
    this.errorListeners.push(listener);
  }

  async connect(): Promise<void> {
    this.logger.log('Starting RID Dual Transport (UDP + Serial)...');
    await Promise.allSettled([
      this.udp.connect().catch((err) => {
        this.logger.warn(`RID UDP failed to start in dual mode: ${err.message}`);
      }),
      this.serial.connect().catch((err) => {
        this.logger.warn(`RID Serial failed to start in dual mode: ${err.message}`);
      }),
    ]);
  }

  async disconnect(): Promise<void> {
    await Promise.allSettled([
      this.udp.disconnect(),
      this.serial.disconnect(),
    ]);
  }

  getLastMessageAt(): number {
    return Math.max(this.udp.getLastMessageAt(), this.serial.getLastMessageAt());
  }

  getConnectionStatus(): string {
    const u = this.udp.isConnected;
    const s = this.serial.isConnected;
    if (u && s) return 'connected (udp+serial)';
    if (u) return 'connected (udp)';
    if (s) return 'connected (serial)';
    return 'disconnected';
  }

  private fanInData(chunk: Buffer): void {
    this.dataListeners.forEach((cb) => cb(chunk));
  }

  private fanInError(err: Error): void {
    this.errorListeners.forEach((cb) => cb(err));
  }
}
