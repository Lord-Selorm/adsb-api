import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SerialPort } from 'serialport';
import type { DataSource, DataSourceKind } from '../data-source.interface.js';

export interface SerialTransportOptions {
  path: string;
  baudRate: number;
}

/**
 * ADSR-800 module over RS-232 (DB9 male, pins: TXD=2, RXD=3, GND=5).
 * Default wire config: 460800 baud, 8 data bits, 1 stop bit, no parity,
 * no flow control.
 */
@Injectable()
export class SerialTransport implements DataSource {
  readonly kind: DataSourceKind = 'serial';
  isConnected = false;

  private readonly logger = new Logger(SerialTransport.name);
  private dataListeners: Array<(chunk: Buffer) => void> = [];
  private errorListeners: Array<(err: Error) => void> = [];
  private port: SerialPort | null = null;
  // Reconnection back‑off state
  private reconnectAttempts = 0;
  // Maximum number of reconnection attempts before giving up
  private readonly maxReconnectAttempts = 10;
  // Silence detection fields
  private lastMessageAt: number = Date.now();
  private silenceTimer?: NodeJS.Timeout;
  private readonly silenceThresholdMs: number = Number(process.env.SERIAL_SILENCE_THRESHOLD ?? '90000');
  // Checks for silence and logs a warning if threshold exceeded
  public checkSilence(): void {
    const now = Date.now();
    const elapsed = now - this.lastMessageAt;
    if (elapsed > this.silenceThresholdMs) {
      this.logger.warn(`No data received from serial port for ${Math.round(elapsed / 1000)}s`);
    }
  }


  constructor(config: ConfigService) {
    this.opts = {
      path:
        config.get<string>('SERIAL_PORT') ??
        (process.platform === 'win32' ? 'COM3' : '/dev/ttyUSB0'),
      baudRate: Number(config.get<string>('SERIAL_BAUD') ?? '460800'),
    };
  }

  private readonly opts: SerialTransportOptions;

  onData(listener: (chunk: Buffer) => void): void {
    this.dataListeners.push(listener);
  }

  onError(listener: (err: Error) => void): void {
    this.errorListeners.push(listener);
  }

  async connect(): Promise<void> {
    if (this.port) return;
    this.logger.log(`Opening ${this.opts.path} @ ${this.opts.baudRate} baud (8N1)...`);
    try {
      this.port = new SerialPort({
        path: this.opts.path,
        baudRate: this.opts.baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        autoOpen: false,
      });

      await new Promise<void>((resolve, reject) => {
        this.port!.open((err) => (err ? reject(err) : resolve()));
      });

      // Register listeners for data, errors, and close events.
      // Register listeners for data, errors, and close events.
      this.port.on('data', (chunk: Buffer) => {
        // Update last message timestamp for silence detection
        this.lastMessageAt = Date.now();
        // Start silence detection timer if not already running
        if (!this.silenceTimer) {
          this.silenceTimer = setInterval(() => {
            const now = Date.now();
            const elapsed = now - this.lastMessageAt;
            if (elapsed > this.silenceThresholdMs) {
              this.logger.warn(`No data received from serial port for ${Math.round(elapsed / 1000)}s`);
            }
          }, Math.min(this.silenceThresholdMs / 3, 30000)); // check more frequently than threshold, max 30s
        }
        for (const cb of this.dataListeners) cb(chunk);
      });

      this.port.on('error', (err: Error) => {
        this.logger.error(`Serial port error: ${err.message}`);
        this.errorListeners.forEach((cb) => cb(err));
        this.handleDisconnect();
      });

      this.port.on('close', () => {
        this.logger.warn('Serial port closed');
        // Clean up silence detection timer on close
        if (this.silenceTimer) {
          clearInterval(this.silenceTimer);
          this.silenceTimer = undefined;
        }
        this.handleDisconnect();
      });

      this.isConnected = true;
      this.reconnectAttempts = 0; // reset backoff state on successful connect
      this.logger.log(`Serial connected: ${this.opts.path}`);
    } catch (err) {
      this.port = null;
      this.isConnected = false;
      this.logger.error(`Failed to open serial port: ${(err as Error).message}`);
      // Propagate error to listeners and start reconnection attempts.
      this.errorListeners.forEach((cb) => cb(err as Error));
      this.handleDisconnect();
    }
  }

  private handleDisconnect(): void {
    this.isConnected = false;
    this.reconnectAttempts++;
    if (this.reconnectAttempts <= this.maxReconnectAttempts) {
      setTimeout(() => {
        this.connect().catch(() => {});
      }, 1000);
    } else {
      this.logger.warn('Maximum reconnection attempts reached; giving up.');
    }
  }

  /** Return timestamp of last received message */
  public getLastMessageAt(): number {
    return this.lastMessageAt;
  }

  /** Return connection status as string */
  public getConnectionStatus(): string {
    return this.isConnected ? 'connected' : 'disconnected';
  }

  async disconnect(): Promise<void> {
    if (!this.port) return;
    this.port.removeAllListeners();
    await new Promise<void>((resolve) => this.port!.close(() => resolve()));
    this.port = null;
    this.isConnected = false;
  }

  async write(data: string | Buffer): Promise<void> {
    if (!this.port?.isOpen) {
      throw new Error('Serial port is not open');
    }
    await new Promise<void>((resolve, reject) => {
      this.port!.write(typeof data === 'string' ? data : data, (err) =>
        err ? reject(err) : resolve(),
      );
    });
  }
}