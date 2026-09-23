import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { SensorsModule } from '../sensors/sensors.module.js';
import {
  SENSOR_SOURCES,
  type SensorSourceDescriptor,
} from '../sensors/sensor-source.js';
import { FlightsController } from './flights.controller.js';
import { FlightsService } from './flights.service.js';

@Module({
  imports: [SensorsModule],
  providers: [FlightsService],
  controllers: [FlightsController],
  exports: [FlightsService],
})
export class FlightsModule implements OnModuleInit {
  constructor(
    @Inject(SENSOR_SOURCES)
    private readonly sources: Array<SensorSourceDescriptor<unknown>>,
    private readonly flights: FlightsService,
  ) {}

  onModuleInit(): void {
    for (const src of this.sources) {
      if (!src.flights) continue;
      src.store.events.on('update', (state) => {
        this.flights.enqueueSource(src.source, state);
      });
    }
  }
}