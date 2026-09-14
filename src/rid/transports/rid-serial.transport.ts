import { Injectable } from '@nestjs/common';
import { SerialBridge } from '../../common/serial-bridge.js';
import type { DataSourceKind } from '../../common/data-source.interface.js';

export interface RidSerialTransportOptions {
  path: string;
  baudRate: number;
}

/**
 * Physical URM-01/02 Drone RID receiver over USB-serial (e.g. CH340 on COM5).
 * The module streams newline-delimited JSON envelopes across the serial link
 * at 115200 baud (8N1) whenever drones or GNSS heartbeats are active.
 */
@Injectable()
export class RidSerialTransport extends SerialBridge {
  readonly kind: DataSourceKind = 'rid_serial';

  constructor(opts: RidSerialTransportOptions) {
    super({
      label: 'RidSerialTransport',
      path: opts.path,
      baudRate: opts.baudRate,
      maxReconnectAttempts: 15,
      exponentialBackoff: true,
    });
  }
}