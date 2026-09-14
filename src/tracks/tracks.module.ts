import { Module } from '@nestjs/common';
import { AircraftModule } from '../aircraft/aircraft.module.js';
import { RidModule } from '../rid/rid.module.js';
import { AisModule } from '../ais/ais.module.js';
import { TrackStoreService } from './track-store.service.js';
import { TracksController } from './tracks.controller.js';
import { TracksGateway } from './tracks.gateway.js';

@Module({
  imports: [AircraftModule, RidModule, AisModule],
  controllers: [TracksController],
  providers: [TrackStoreService, TracksGateway],
  exports: [TrackStoreService, TracksGateway],
})
export class TracksModule {}
