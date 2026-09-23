import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ModeSDecoder } from '../decode/mode-s.decoder.js';
import {
  SENSOR_SOURCES,
  type SensorSourceDescriptor,
} from '../sensors/sensor-source.js';
import { HealthStatusDto } from './health.dto.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly decoder: ModeSDecoder,
    @Inject(SENSOR_SOURCES)
    private readonly sources: Array<SensorSourceDescriptor<unknown>>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness + ingress/feed status' })
  @ApiOkResponse({ type: HealthStatusDto, description: 'Service health' })
  status(): HealthStatusDto {
    const health: Record<string, unknown> = {
      status: 'ok',
      uptimeSeconds: process.uptime(),
      malformedMessageCount: this.decoder.getMalformedCount(),
    };
    for (const src of this.sources) {
      const h = src.health;
      health[h.sourceField] = src.transport.kind;
      health[h.connectionStatusField] = src.transport.getConnectionStatus();
      health[h.secondsSinceLastMessageField] =
        Math.max(0, Date.now() - src.transport.getLastMessageAt()) / 1000;
      health[h.trackedCountField] = src.store.count;
    }
    return health as unknown as HealthStatusDto;
  }
}