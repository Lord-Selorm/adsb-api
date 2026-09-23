// src/ingress/ingress.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IngressService } from './ingress.service.js';
import { DecodeModule } from '../decode/decode.module.js';
import { AircraftModule } from '../aircraft/aircraft.module.js';
import {
  AircraftStoreService,
  type AircraftState,
} from '../aircraft/aircraft-store.service.js';
import type { DataSource } from '../common/data-source.interface.js';
import {
  AIRCRAFT_SOURCE,
  type SensorSourceDescriptor,
} from '../sensors/sensor-source.js';
import { createAircraftSource } from '../sensors/source-meta.js';
import { TRANSPORT_TOKEN } from './transport.token.js';
import { SerialTransport } from './transports/serial.transport.js';
import { TcpTransport } from './transports/tcp.transport.js';

@Module({
  imports: [ConfigModule, AircraftModule, DecodeModule],
  providers: [
    IngressService,
    {
      provide: TRANSPORT_TOKEN,
      useFactory: (config: ConfigService) => {
        // TCP serial bridge (e.g. USR-TCP232-ED2) when a port is configured.
        if (Number(config.get<string>('TCP_PORT', '0')) > 0) {
          return new TcpTransport(config);
        }
        return new SerialTransport(config);
      },
      inject: [ConfigService],
    },
    {
      provide: AIRCRAFT_SOURCE,
      inject: [AircraftStoreService, TRANSPORT_TOKEN],
      useFactory: (
        store: AircraftStoreService,
        transport: DataSource,
      ): SensorSourceDescriptor<AircraftState> =>
        createAircraftSource(store, transport),
    },
  ],
  exports: [IngressService, TRANSPORT_TOKEN, AIRCRAFT_SOURCE],
})
export class IngressModule {}