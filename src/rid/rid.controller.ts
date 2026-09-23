import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DroneRidStoreService } from './drone-rid-store.service.js';
import { RidIngressService } from './rid.ingress.service.js';

@ApiTags('rid')
@Controller('rid')
export class RidController {
  constructor(
    private readonly store: DroneRidStoreService,
    private readonly ingress: RidIngressService,
  ) {}

  @Get('drones')
  @ApiOperation({
    summary: 'Live Remote ID drones currently tracked in memory',
  })
  @ApiOkResponse({
    schema: { type: 'array', description: 'Live drone tracks' },
    description: 'Live Remote ID drone list',
  })
  drones() {
    return this.store.getAll();
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Remote ID ingress pipeline counters and last raw lines',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      description:
        'rawBytes, rawChunks, jsonLines, nonJsonLines, droneFrames, ignoredFrames, lastRawLine, lastIgnoredLine, dronesTracked',
    },
    description: 'Remote ID ingress statistics',
  })
  stats() {
    return this.ingress.getStats();
  }
}