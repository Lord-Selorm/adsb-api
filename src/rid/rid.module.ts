import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { DataSource } from '../common/data-source.interface.js';
import {
  DRONE_SOURCE,
  type SensorSourceDescriptor,
} from '../sensors/sensor-source.js';
import { createDroneSource } from '../sensors/source-meta.js';
import { RidUdpTransport } from './transports/rid-udp.transport.js';
import { RidSerialTransport } from './transports/rid-serial.transport.js';
import { RidDualTransport } from './transports/rid-dual.transport.js';
import { DroneRidStoreService, type DroneRidState } from './drone-rid-store.service.js';
import { RidController } from './rid.controller.js';
import { RidDecoder } from './rid.decoder.js';
import { RidIngressService } from './rid.ingress.service.js';
import { RID_TRANSPORT_TOKEN } from './rid.transport.token.js';

@Module({
  imports: [ConfigModule],
  controllers: [RidController],
  providers: [
    RidDecoder,
    RidIngressService,
    {
      provide: DroneRidStoreService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new DroneRidStoreService({
          staleAfterMs: Number(config.get('RID_STALE_MS', '15000')),
          evictAfterMs: Number(config.get('RID_EVICT_MS', '60000')),
          scanIntervalMs: Number(config.get('RID_SCAN_MS', '10000')),
        }),
    },
    {
      provide: RID_TRANSPORT_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const transportMode = config
          .get<string>('RID_TRANSPORT', 'dual')
          .toLowerCase();

        const createUdp = () =>
          new RidUdpTransport({
            host: config.get<string>('RID_UDP_HOST', '0.0.0.0'),
            port: Number(config.get('RID_UDP_PORT', '65100')),
          });

        const createSerial = () =>
          new RidSerialTransport({
            path:
              config.get<string>('RID_SERIAL_PORT') ??
              (process.platform === 'win32' ? 'COM5' : '/dev/ttyUSB0'),
            baudRate: Number(config.get('RID_SERIAL_BAUD', '115200')),
          });

        if (transportMode === 'udp') {
          return createUdp();
        }
        if (transportMode === 'serial') {
          return createSerial();
        }
        return new RidDualTransport(createUdp(), createSerial());
      },
    },
    {
      provide: DRONE_SOURCE,
      inject: [DroneRidStoreService, RID_TRANSPORT_TOKEN],
      useFactory: (
        store: DroneRidStoreService,
        transport: DataSource,
      ): SensorSourceDescriptor<DroneRidState> =>
        createDroneSource(store, transport),
    },
  ],
  exports: [
    DroneRidStoreService,
    RidIngressService,
    RID_TRANSPORT_TOKEN,
    DRONE_SOURCE,
  ],
})
export class RidModule {}
