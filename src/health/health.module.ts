import { Module } from '@nestjs/common';
import { DecodeModule } from '../decode/decode.module.js';
import { IngressModule } from '../ingress/ingress.module.js';
import { RidModule } from '../rid/rid.module.js';
import { TracksModule } from '../tracks/tracks.module.js';
import { HealthController } from './health.controller.js';

/**
 * Health domain: liveness + live status of every sensor feed, assembled from
 * the same tokens the rest of the app uses (transports, decode, track store).
 * Own module keeps AppModule a pure assembly point.
 */
@Module({
  imports: [DecodeModule, IngressModule, RidModule, TracksModule],
  controllers: [HealthController],
})
export class HealthModule {}