import { Controller, Get, Param, Query } from '@nestjs/common';
import { TimescaleService } from './timescale.service.js';

@Controller('flights')
export class TimescaleController {
  constructor(private readonly timescale: TimescaleService) {}

  @Get('positions/:icao')
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
  list(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const now = Date.now();
    const toDate = to ? new Date(to) : new Date(now);
    const fromDate = from ? new Date(from) : new Date(now - 3600_000);
    return this.timescale.queryFlights(fromDate, toDate, limit ? Number(limit) : 100);
  }

  @Get('count')
  count() {
    return this.timescale.queryPositionCount();
  }
}
