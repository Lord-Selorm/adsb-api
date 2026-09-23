import { Module } from '@nestjs/common';
import { IngressModule } from '../ingress/ingress.module.js';
import { RidModule } from '../rid/rid.module.js';
import { AisModule } from '../ais/ais.module.js';
import {
  AIRCRAFT_SOURCE,
  DRONE_SOURCE,
  VESSEL_SOURCE,
  SENSOR_SOURCES,
  type SensorSourceDescriptor,
} from './sensor-source.js';

/**
 * Collects every registered sensor's descriptor into one `SENSOR_SOURCES`
 * array. Sensor modules stay the single owner of their descriptor; the
 * registry is only the aggregator so consumers (tracks/health/flights) loop
 * one list instead of knowing each sensor by name.
 */
@Module({
  imports: [IngressModule, RidModule, AisModule],
  providers: [
    {
      provide: SENSOR_SOURCES,
      inject: [AIRCRAFT_SOURCE, DRONE_SOURCE, VESSEL_SOURCE],
      useFactory: (
        aircraft: SensorSourceDescriptor | null,
        drone: SensorSourceDescriptor | null,
        vessel: SensorSourceDescriptor | null,
      ): Array<SensorSourceDescriptor<unknown>> =>
        [aircraft, drone, vessel].filter(
          (src): src is SensorSourceDescriptor<unknown> => src != null,
        ),
    },
  ],
  exports: [SENSOR_SOURCES],
})
export class SensorsModule {}