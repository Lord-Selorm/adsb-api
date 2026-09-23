import { Module } from '@nestjs/common';
import { DecodeModule } from '../decode/decode.module.js';
import { SensorsModule } from '../sensors/sensors.module.js';
import { HealthController } from './health.controller.js';

/**
 * Health domain: liveness + live status of every sensor feed, assembled from
 * the sensor registry (SENSOR_SOURCES) + the decode module for malformed-count.
 * Own module keeps AppModule a pure assembly point.
 */
@Module({
  imports: [DecodeModule, SensorsModule],
  controllers: [HealthController],
})
export class HealthModule {}