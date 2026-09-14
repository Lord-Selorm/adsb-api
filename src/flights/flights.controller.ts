import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  DroneFlightSummaryDto,
  DronePositionDto,
  FlightSummaryDto,
  PositionDto,
} from './flights.dto.js';
import { FlightsService } from './flights.service.js';

@ApiTags('flights')
@Controller('flights')
export class FlightsController {
  constructor(private readonly flights: FlightsService) {}

  @Get('positions/:icao')
  @ApiOperation({
    summary: 'Position history for one aircraft within a time range',
  })
  @ApiOkResponse({ type: [PositionDto], description: 'Stored position rows' })
  positions(
    @Param('icao') icao: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<PositionDto[]> {
    const now = Date.now();
    const toDate = to ? new Date(to) : new Date(now);
    const fromDate = from ? new Date(from) : new Date(now - 3600_000);
    return this.flights.queryPositions(icao.toLowerCase(), fromDate, toDate);
  }

  @Get('list')
  @ApiOperation({ summary: 'Distinct aircraft seen within a time range' })
  @ApiOkResponse({ type: [FlightSummaryDto], description: 'Flight summary list' })
  list(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ): Promise<FlightSummaryDto[]> {
    const now = Date.now();
    const toDate = to ? new Date(to) : new Date(now);
    const fromDate = from ? new Date(from) : new Date(now - 3600_000);
    return this.flights.queryFlights(
      fromDate,
      toDate,
      limit ? Number(limit) : 100,
    );
  }

  @Get('count')
  @ApiOperation({ summary: 'Total rows stored in aircraft_positions' })
  @ApiOkResponse({ schema: { type: 'number' }, description: 'Row count' })
  count(): Promise<number> {
    return this.flights.queryPositionCount();
  }

  @Get('drones/positions/:serial')
  @ApiOperation({ summary: 'Position history for one drone within a time range' })
  @ApiOkResponse({
    type: [DronePositionDto],
    description: 'Stored drone position rows',
  })
  dronePositions(
    @Param('serial') serial: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<DronePositionDto[]> {
    const now = Date.now();
    const toDate = to ? new Date(to) : new Date(now);
    const fromDate = from ? new Date(from) : new Date(now - 3600_000);
    return this.flights.queryDronePositions(serial, fromDate, toDate);
  }

  @Get('drones/list')
  @ApiOperation({ summary: 'Distinct drones seen within a time range' })
  @ApiOkResponse({
    type: [DroneFlightSummaryDto],
    description: 'Drone flight summary list',
  })
  droneList(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ): Promise<DroneFlightSummaryDto[]> {
    const now = Date.now();
    const toDate = to ? new Date(to) : new Date(now);
    const fromDate = from ? new Date(from) : new Date(now - 3600_000);
    return this.flights.queryDroneFlights(
      fromDate,
      toDate,
      limit ? Number(limit) : 100,
    );
  }

  @Get('drones/count')
  @ApiOperation({ summary: 'Total rows stored in drone_positions' })
  @ApiOkResponse({ schema: { type: 'number' }, description: 'Drone row count' })
  droneCount(): Promise<number> {
    return this.flights.queryDronePositionCount();
  }
}