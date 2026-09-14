import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AisDecoder } from './ais.decoder.js';
import { VesselStoreService } from './vessel-store.service.js';
import { AisIngressService } from './ais.ingress.service.js';
import { AisController } from './ais.controller.js';
import { AIS_TRANSPORT_TOKEN } from './ais.transport.token.js';
import { AisMockTransport } from './transports/ais-mock.transport.js';
import { AisSerialTransport } from './transports/ais-serial.transport.js';

@Module({
  imports: [ConfigModule],
  controllers: [AisController],
  providers: [
    AisDecoder,
    AisIngressService,
    {
      provide: VesselStoreService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new VesselStoreService({
          staleAfterMs: Number(config.get('AIS_STALE_MS', '300000')),
          evictAfterMs: Number(config.get('AIS_EVICT_MS', '1800000')),
          scanIntervalMs: Number(config.get('AIS_SCAN_MS', '15000')),
        }),
    },
    {
      provide: AIS_TRANSPORT_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const useMock = config
          .get<string>('AIS_USE_MOCK', 'true')
          .toLowerCase();

        if (useMock === 'true') {
          return new AisMockTransport({
            centerLat: Number(config.get('RECEIVER_LAT', '52')),
            centerLon: Number(config.get('RECEIVER_LON', '4')),
            tickMs: Number(config.get('AIS_MOCK_TICK_MS', '2000')),
          });
        }

        return new AisSerialTransport({
          path:
            config.get<string>('AIS_SERIAL_PORT') ??
            (process.platform === 'win32' ? 'COM4' : '/dev/ttyUSB1'),
          baudRate: Number(config.get('AIS_SERIAL_BAUD', '38400')),
        });
      },
    },
  ],
  exports: [VesselStoreService, AisIngressService, AIS_TRANSPORT_TOKEN],
})
export class AisModule {}
