import { Module, OnModuleInit } from '@nestjs/common';
import { AircraftModule } from '../aircraft/aircraft.module.js';
import { AircraftStoreService } from '../aircraft/aircraft-store.service.js';
import { FlightsController } from './flights.controller.js';
import { FlightsService } from './flights.service.js';

@Module({
  imports: [AircraftModule],
  providers: [FlightsService],
  controllers: [FlightsController],
  exports: [FlightsService],
})
export class FlightsModule implements OnModuleInit {
  constructor(
    private readonly store: AircraftStoreService,
    private readonly flights: FlightsService,
  ) {}

  onModuleInit(): void {
    this.store.events.on('update', (state) => {
      this.flights.enqueue(state);
    });
  }
}