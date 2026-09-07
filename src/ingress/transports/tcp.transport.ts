import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import net from 'node:net';
import type { DataSource, DataSourceKind } from '../data-source.interface.js';

/**
 * Streams data from a USR-TCP232-ED2 (or any TCP serial bridge) that has the
 * ADSR-800 on its UART and listens in TCP-Server mode. The bridge relays the
 * receiver's AVR ASCII frames (`*8D...;`) transparently over the socket.
 */
@Injectable()
export class TcpTransport implements DataSource {
  readonly kind: DataSourceKind = 'tcp';
  isConnected = false;

  private readonly logger = new Logger(TcpTransport.name);
  private dataListeners: Array<(chunk: Buffer) => void> = [];
  private errorListeners: Array<(err: Error) => void> = [];
  private socket: net.Socket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private lastMessageAt: number = Date.now();
  private readonly host: string;
  private readonly port: number;
  private readonly reconnectDelayMs: number;

  constructor(config: ConfigService) {
    this.host = config.get<string>('TCP_HOST') ?? '192.168.0.7';
    this.port = Number(config.get<string>('TCP_PORT') ?? '8235');
    this.reconnectDelayMs = Number(config.get<string>('TCP_RECONNECT_MS') ?? '1000');
  }

  onData(listener: (chunk: Buffer) => void): void {
    this.dataListeners.push(listener);
  }

  onError(listener: (err: Error) => void): void {
    this.errorListeners.push(listener);
  }

  async connect(): Promise<void> {
    if (this.socket) return;
    this.logger.log(`Connecting TCP ${this.host}:${this.port}...`);
    this.socket = net.createConnection({ host: this.host, port: this.port });

    this.socket.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.logger.log(`TCP connected: ${this.host}:${this.port}`);
    });

    this.socket.on('data', (chunk: Buffer) => {
      this.lastMessageAt = Date.now();
      for (const cb of this.dataListeners) cb(chunk);
    });

    this.socket.on('error', (err: Error) => {
      this.logger.error(`TCP error: ${err.message}`);
      this.errorListeners.forEach((cb) => cb(err));
      this.handleDisconnect();
    });

    this.socket.on('close', () => {
      this.logger.warn(`TCP connection closed (${this.host}:${this.port})`);
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
      this.logger.warn('Maximum TCP reconnect attempts reached; giving up.');
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