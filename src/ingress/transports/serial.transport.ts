import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SerialBridge,
  type SerialBridgeConfig,
} from '../../common/serial-bridge.js';
import type { DataSourceKind } from '../../common/data-source.interface.js';

export interface SerialTransportOptions {
  path: string;
  baudRate: number;
  /** Plain-text commands sent after open (e.g. ADSR-800 `SetOutput=1`). */
  initCommands: string[];
}

/**
 * ADSR-800 module over RS-232 (DB9 male, pins: TXD=2, RXD=3, GND=5).
 * Default wire config: 460800 baud, 8 data bits, 1 stop bit, no parity,
 * no flow control.
 */
@Injectable()
export class SerialTransport extends SerialBridge {
  readonly kind: DataSourceKind = 'serial';

  constructor(config: ConfigService) {
    const opts: SerialBridgeConfig = {
      label: 'SerialTransport',
      path:
        config.get<string>('SERIAL_PORT') ??
        (process.platform === 'win32' ? 'COM3' : '/dev/ttyUSB0'),
      baudRate: Number(config.get<string>('SERIAL_BAUD') ?? '460800'),
      initCommands: (config.get<string>('SERIAL_INIT_COMMANDS', '') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      // ADSR-800 silence watchdog (default 90s, configurable for tests).
      silenceThresholdMs: Number(
        process.env.SERIAL_SILENCE_THRESHOLD ?? '90000',
      ),
      maxReconnectAttempts: 10,
      exponentialBackoff: false,
    };
    super(opts);
  }
}