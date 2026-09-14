import { Module, OnModuleInit } from '@nestjs/common';
import { AircraftModule } from '../aircraft/aircraft.module.js';
import { AircraftStoreService } from '../aircraft/aircraft-store.service.js';
import { RidModule } from '../rid/rid.module.js';
import { DroneRidStoreService } from '../rid/drone-rid-store.service.js';
import { FlightsController } from './flights.controller.js';
import { FlightsService } from './flights.service.js';

@Module({
  imports: [AircraftModule, RidModule],
  providers: [FlightsService],
  controllers: [FlightsController],
  exports: [FlightsService],
})
export class FlightsModule implements OnModuleInit {
  constructor(
    private readonly store: AircraftStoreService,
    private readonly droneStore: DroneRidStoreService,
    private readonly flights: FlightsService,
  ) {}

  onModuleInit(): void {
    this.store.events.on('update', (state) => {
      this.flights.enqueue(state);
    });
    this.droneStore.events.on('update', (state) => {
      this.flights.enqueueDrone(state);
    });
  }
}