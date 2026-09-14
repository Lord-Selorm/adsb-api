import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RidMockTransport } from './transports/rid-mock.transport.js';
import { RidUdpTransport } from './transports/rid-udp.transport.js';
import { RidSerialTransport } from './transports/rid-serial.transport.js';
import { RidDualTransport } from './transports/rid-dual.transport.js';
import { DroneRidStoreService } from './drone-rid-store.service.js';
import { RidDecoder } from './rid.decoder.js';
import { RidIngressService } from './rid.ingress.service.js';
import { RID_TRANSPORT_TOKEN } from './rid.transport.token.js';

@Module({
  imports: [ConfigModule],
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
        const useMock = config
          .get<string>('RID_USE_MOCK', 'true')
          .toLowerCase();
        if (useMock === 'true') {
          return new RidMockTransport({
            receiverLat: Number(config.get('RECEIVER_LAT', '52')),
            receiverLon: Number(config.get('RECEIVER_LON', '4')),
            droneCount: Number(config.get('RID_MOCK_DRONES', '3')),
            tickMs: Number(config.get('RID_MOCK_TICK_MS', '1000')),
          });
        }

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
  ],
  exports: [DroneRidStoreService, RidIngressService, RID_TRANSPORT_TOKEN],
})
export class RidModule {}
