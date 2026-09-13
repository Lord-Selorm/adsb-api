import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TimescaleService } from './timescale.service.js';

@ApiTags('flights')
@Controller('flights')
export class TimescaleController {
  constructor(private readonly timescale: TimescaleService) {}

  @Get('positions/:icao')
  @ApiOperation({
    summary: 'Position history for one aircraft within a time range',
  })
  @ApiOkResponse({ description: 'Array of stored position rows' })
  positions(
    @Param('icao') icao: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const now = Date.now();
    const toDate = to ? new Date(to) : new Date(now);
    const fromDate = from ? new Date(from) : new Date(now - 3600_000);
    return this.timescale.queryPositions(icao.toLowerCase(), fromDate, toDate);
  }

  @Get('list')
  @ApiOperation({ summary: 'Distinct aircraft seen within a time range' })
  @ApiOkResponse({ description: 'Flight summary list' })
  list(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const now = Date.now();
    const toDate = to ? new Date(to) : new Date(now);
    const fromDate = from ? new Date(from) : new Date(now - 3600_000);
    return this.timescale.queryFlights(
      fromDate,
      toDate,
      limit ? Number(limit) : 100,
    );
  }

  @Get('count')
  @ApiOperation({ summary: 'Total rows stored in aircraft_positions' })
  @ApiOkResponse({ description: 'Row count' })
  count() {
    return this.timescale.queryPositionCount();
  }
}
