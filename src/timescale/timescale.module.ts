import { Module, OnModuleInit } from '@nestjs/common';
import { AircraftModule } from '../aircraft/aircraft.module.js';
import { AircraftStoreService } from '../aircraft/aircraft-store.service.js';
import { TimescaleController } from './timescale.controller.js';
import { TimescaleService } from './timescale.service.js';

@Module({
  imports: [AircraftModule],
  providers: [TimescaleService],
  controllers: [TimescaleController],
  exports: [TimescaleService],
})
export class TimescaleModule implements OnModuleInit {
  constructor(
    private readonly store: AircraftStoreService,
    private readonly timescale: TimescaleService,
  ) {}

  onModuleInit(): void {
    this.store.events.on('update', (state) => {
      this.timescale.enqueue(state);
    });
  }
}
