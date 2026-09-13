import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AircraftStoreService } from './aircraft-store.service.js';
import { AircraftDto, AircraftListResponseDto } from './aircraft.dto.js';

@ApiTags('aircraft')
@Controller('aircraft')
export class AircraftController {
  constructor(private readonly store: AircraftStoreService) {}

  @Get()
  @ApiOperation({
    summary: 'Live snapshot of every tracked aircraft',
    deprecated: true,
    description:
      'Deprecated: use GET /api/tracks?source=adsb for the same data under the unified API.',
  })
  @ApiOkResponse({
    type: AircraftListResponseDto,
    description: 'Live aircraft list',
  })
  @ApiNotFoundResponse({ description: 'No aircraft are being tracked' })
  list(): AircraftListResponseDto {
    const aircraft = this.store.getAll();
    return { count: aircraft.length, aircraft };
  }

  @Get(':icao')
  @ApiOperation({
    summary: 'Detail for a single aircraft (ICAO in lowercase hex)',
    deprecated: true,
    description: 'Deprecated: use GET /api/tracks?source=adsb instead.',
  })
  @ApiOkResponse({ type: AircraftDto, description: 'Aircraft state' })
  @ApiNotFoundResponse({ description: 'Unknown ICAO address' })
  findOne(@Param('icao') icao: string): AircraftDto {
    const aircraft = this.store.get(icao);
    if (!aircraft) {
      throw new NotFoundException(`Unknown ICAO address: ${icao}`);
    }
    return aircraft;
  }
}
