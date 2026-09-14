import { Injectable } from '@nestjs/common';
import { SerialBridge } from '../../common/serial-bridge.js';
import type { DataSourceKind } from '../../common/data-source.interface.js';

export interface AisSerialTransportOptions {
  path: string;
  baudRate: number;
}

/**
 * Ingests marine AIS NMEA 0183 sentences (!AIVDM / !AIVDO) from a VHF AIS
 * receiver connected via RS-232 / USB serial (standard 38400 baud, 8N1).
 */
@Injectable()
export class AisSerialTransport extends SerialBridge {
  readonly kind: DataSourceKind = 'ais_serial';

  constructor(opts: AisSerialTransportOptions) {
    super({
      label: 'AisSerialTransport',
      path: opts.path,
      baudRate: opts.baudRate,
      maxReconnectAttempts: 15,
      exponentialBackoff: true,
    });
  }
}