import { Logger } from '@nestjs/common';
import { SerialPort } from 'serialport';
import type { DataSource, DataSourceKind } from './data-source.interface.js';

export interface SerialBridgeConfig {
  path: string;
  baudRate: number;
  /** Plain-text commands sent right after open (e.g. ADSR-800 SetOutput=1). */
  initCommands?: string[];
  /** Maximum reconnect attempts before giving up (default 15). */
  maxReconnectAttempts?: number;
  /**
   * When true the reconnect delay grows 1s → 2s → 4s … capped at 15s; when
   * false every retry waits a fixed 1s (default true).
   */
  exponentialBackoff?: boolean;
  /** When set, logs a warning if no data arrives for this long (ms). */
  silenceThresholdMs?: number;
  /** Logger name (default: 'SerialBridge'). */
  label?: string;
}

/**
 * Shared physical serial lifecycle used by every NDDS-style hardware feed
 * (ADS-B ADSR-800, URM-01/02 over USB Type-C, AIS VHF receivers). Owns the
 * SerialPort lifecycle, listener fan-out, silence warning, and reconnect
 * back-off so the concrete transports only declare their kind/options.
 */
export abstract class SerialBridge implements DataSource {
  abstract readonly kind: DataSourceKind;
  isConnected = false;

  protected readonly logger: Logger;
  private readonly path: string;
  private readonly baudRate: number;
  private readonly initCommands: string[];
  private readonly maxReconnectAttempts: number;
  private readonly exponentialBackoff: boolean;
  private readonly silenceThresholdMs?: number;

  private dataListeners: Array<(chunk: Buffer) => void> = [];
  private errorListeners: Array<(err: Error) => void> = [];
  private port: SerialPort | null = null;
  private lastMessageAt: number = Date.now();
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private silenceTimer?: NodeJS.Timeout;

  constructor(config: SerialBridgeConfig) {
    this.logger = new Logger(config.label ?? 'SerialBridge');
    this.path = config.path;
    this.baudRate = config.baudRate;
    this.initCommands = config.initCommands ?? [];
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 15;
    this.exponentialBackoff = config.exponentialBackoff ?? true;
    this.silenceThresholdMs = config.silenceThresholdMs;
  }

  onData(listener: (chunk: Buffer) => void): void {
    this.dataListeners.push(listener);
  }

  onError(listener: (err: Error) => void): void {
    this.errorListeners.push(listener);
  }

  async connect(): Promise<void> {
    if (this.port) return;
    this.logger.log(`Opening ${this.path} @ ${this.baudRate} baud (8N1)...`);

    try {
      this.port = new SerialPort({
        path: this.path,
        baudRate: this.baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        autoOpen: false,
      });

      await new Promise<void>((resolve, reject) => {
        this.port!.open((err) => (err ? reject(err) : resolve()));
      });

      this.port.on('data', (chunk: Buffer) => {
        this.lastMessageAt = Date.now();
        this.startSilenceWatcher();
        for (const cb of this.dataListeners) cb(chunk);
      });

      this.port.on('error', (err) => {
        this.logger.error(`Serial port error: ${err.message}`);
        for (const cb of this.errorListeners) cb(err);
        this.handleDisconnect();
      });

      this.port.on('close', () => {
        this.logger.warn(`Serial port ${this.path} closed`);
        this.stopSilenceWatcher();
        this.handleDisconnect();
      });

      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.logger.log(`Serial connected: ${this.path}`);

      for (const cmd of this.initCommands) {
        try {
          await this.write(cmd + '\r\n');
          this.logger.log(`Sent serial init command: ${cmd}`);
        } catch (err) {
          this.logger.error(
            `Failed to send serial init command '${cmd}': ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.port = null;
      this.isConnected = false;
      this.logger.error(
        `Failed to open serial port ${this.path}: ${(err as Error).message}`,
      );
      for (const cb of this.errorListeners) cb(err as Error);
      this.handleDisconnect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.stopSilenceWatcher();
    const p = this.port;
    this.port = null;
    this.isConnected = false;
    if (!p) return;
    p.removeAllListeners();
    await new Promise<void>((resolve) => {
      if (p.isOpen) {
        p.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  getLastMessageAt(): number {
    return this.lastMessageAt;
  }

  getConnectionStatus(): string {
    return this.isConnected ? 'connected' : 'disconnected';
  }

  async write(data: string | Buffer): Promise<void> {
    if (!this.port?.isOpen) throw new Error('Serial port is not open');
    await new Promise<void>((resolve, reject) => {
      this.port!.write(data, (err) => (err ? reject(err) : resolve()));
    });
  }

  private handleDisconnect(): void {
    this.isConnected = false;
    this.reconnectAttempts++;
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      this.logger.warn('Maximum reconnection attempts reached; giving up.');
      return;
    }
    const delay = this.exponentialBackoff
      ? Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 15000)
      : 1000;
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {});
    }, delay);
  }

  private startSilenceWatcher(): void {
    if (this.silenceThresholdMs === undefined || this.silenceTimer) return;
    this.silenceTimer = setInterval(() => {
      const elapsed = Date.now() - this.lastMessageAt;
      if (elapsed > this.silenceThresholdMs!) {
        this.logger.warn(
          `No data received from serial port for ${Math.round(elapsed / 1000)}s`,
        );
      }
    }, Math.min(this.silenceThresholdMs / 3, 30000));
  }

  private stopSilenceWatcher(): void {
    if (this.silenceTimer) {
      clearInterval(this.silenceTimer);
      this.silenceTimer = undefined;
    }
  }
}