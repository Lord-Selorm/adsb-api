import { Module } from '@nestjs/common';
import { SensorsModule } from '../sensors/sensors.module.js';
import { TrackStoreService } from './track-store.service.js';
import { TracksController } from './tracks.controller.js';
import { TracksGateway } from './tracks.gateway.js';

@Module({
  imports: [SensorsModule],
  controllers: [TracksController],
  providers: [TrackStoreService, TracksGateway],
  exports: [TrackStoreService, TracksGateway],
})
export class TracksModule {}
