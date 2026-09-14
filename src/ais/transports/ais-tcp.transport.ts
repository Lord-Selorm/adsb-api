import { Injectable, Logger } from '@nestjs/common';
import net from 'node:net';
import type { DataSource, DataSourceKind } from '../../common/data-source.interface.js';

/**
 * AIS maritime receiver over TCP (e.g. AIS112E behind a serial-to-Ethernet
 * bridge, or an AIS112E-A ground station pushing to a server over TCP/IP).
 *
 * Connects as a TCP client and relays the receiver's NMEA-0183 AIVDM sentences
 * transparently over the socket, mirroring the ADS-B TcpTransport.
 */
@Injectable()
export class AisTcpTransport implements DataSource {
  readonly kind: DataSourceKind = 'ais_tcp';
  isConnected = false;

  private readonly logger = new Logger(AisTcpTransport.name);
  private dataListeners: Array<(chunk: Buffer) => void> = [];
  private errorListeners: Array<(err: Error) => void> = [];
  private socket: net.Socket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private lastMessageAt: number = 0;
  private readonly host: string;
  private readonly port: number;
  private readonly reconnectDelayMs: number;

  constructor(config: { host: string; port: number; reconnectDelayMs?: number }) {
    this.host = config.host;
    this.port = config.port;
    this.reconnectDelayMs = config.reconnectDelayMs ?? 1000;
  }

  onData(listener: (chunk: Buffer) => void): void {
    this.dataListeners.push(listener);
  }

  onError(listener: (err: Error) => void): void {
    this.errorListeners.push(listener);
  }

  async connect(): Promise<void> {
    if (this.socket) return;
    this.logger.log(`Connecting AIS TCP ${this.host}:${this.port}...`);
    this.socket = net.createConnection({ host: this.host, port: this.port });

    this.socket.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.logger.log(`AIS TCP connected: ${this.host}:${this.port}`);
    });

    this.socket.on('data', (chunk: Buffer) => {
      this.lastMessageAt = Date.now();
      for (const cb of this.dataListeners) cb(chunk);
    });

    this.socket.on('error', (err: Error) => {
      this.logger.error(`AIS TCP error: ${err.message}`);
      this.errorListeners.forEach((cb) => cb(err));
      this.handleDisconnect();
    });

    this.socket.on('close', () => {
      this.logger.warn(`AIS TCP connection closed (${this.host}:${this.port})`);
      this.handleDisconnect();
    });
  }

  private handleDisconnect(): void {
    this.isConnected = false;
    this.socket = null;
    this.reconnectAttempts++;
    if (this.reconnectAttempts <= this.maxReconnectAttempts) {
      setTimeout(() => {
        this.connect().catch(() => {});
      }, this.reconnectDelayMs);
    } else {
      this.logger.warn('Maximum AIS TCP reconnect attempts reached; giving up.');
    }
  }

  /** Return timestamp of last received message */
  getLastMessageAt(): number {
    return this.lastMessageAt;
  }

  /** Return connection status as string */
  getConnectionStatus(): string {
    return this.isConnected ? 'connected' : 'disconnected';
  }

  async disconnect(): Promise<void> {
    if (!this.socket) return;
    this.socket.removeAllListeners();
    this.socket.destroy();
    this.socket = null;
    this.isConnected = false;
  }
}