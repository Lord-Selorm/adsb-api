import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AircraftStoreService } from './aircraft-store.service.js';

@ApiTags('aircraft')
@Controller('aircraft')
export class AircraftController {
  constructor(private readonly store: AircraftStoreService) {}

  @Get()
  @ApiOperation({ summary: 'Live snapshot of every tracked aircraft' })
  @ApiOkResponse({ description: 'Live aircraft list' })
  @ApiNotFoundResponse({ description: 'No aircraft are being tracked' })
  list(): {
    count: number;
    aircraft: ReturnType<AircraftStoreService['getAll']>;
  } {
    const aircraft = this.store.getAll();
    return { count: aircraft.length, aircraft };
  }

  @Get(':icao')
  @ApiOperation({
    summary: 'Detail for a single aircraft (ICAO in lowercase hex)',
  })
  @ApiOkResponse({ description: 'Aircraft state' })
  @ApiNotFoundResponse({ description: 'Unknown ICAO address' })
  findOne(@Param('icao') icao: string) {
    const aircraft = this.store.get(icao);
    if (!aircraft) {
      throw new NotFoundException(`Unknown ICAO address: ${icao}`);
    }
    return aircraft;
  }
}
