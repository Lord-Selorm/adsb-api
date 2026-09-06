import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { AircraftStoreService } from './aircraft-store.service.js';

@Controller('aircraft')
export class AircraftController {
  constructor(private readonly store: AircraftStoreService) {}

  @Get()
  list(): { count: number; aircraft: ReturnType<AircraftStoreService['getAll']> } {
    const aircraft = this.store.getAll();
    return { count: aircraft.length, aircraft };
  }

  @Get(':icao')
  findOne(@Param('icao') icao: string) {
    const aircraft = this.store.get(icao);
    if (!aircraft) {
      throw new NotFoundException(`Unknown ICAO address: ${icao}`);
    }
    return aircraft;
  }
}