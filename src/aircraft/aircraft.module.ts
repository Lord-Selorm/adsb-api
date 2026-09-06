import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AircraftController } from './aircraft.controller.js';
import { AircraftGateway } from './aircraft.gateway.js';
import { AircraftStoreService } from './aircraft-store.service.js';

@Module({
  imports: [ConfigModule],
  controllers: [AircraftController],
  providers: [
    AircraftGateway,
    {
      provide: AircraftStoreService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new AircraftStoreService({
          staleAfterMs: Number(config.get('AIR_STALE_MS', '15000')),
          evictAfterMs: Number(config.get('AIR_EVICT_MS', '60000')),
          scanIntervalMs: Number(config.get('AIR_SCAN_MS', '10000')),
          receiverLat: Number(config.get('RECEIVER_LAT', '52')),
          receiverLon: Number(config.get('RECEIVER_LON', '4')),
        }),
    },
  ],
  exports: [AircraftStoreService, AircraftGateway],
})
export class AircraftModule {}