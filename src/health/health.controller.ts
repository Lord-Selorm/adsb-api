import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ModeSDecoder } from '../decode/mode-s.decoder.js';
import type { DataSource } from '../ingress/data-source.interface.js';
import { TRANSPORT_TOKEN } from '../ingress/transport.token.js';
import { RID_TRANSPORT_TOKEN } from '../rid/rid.transport.token.js';
import { TrackStoreService } from '../tracks/track-store.service.js';
import { HealthStatusDto } from './health.dto.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly tracks: TrackStoreService,
    private readonly decoder: ModeSDecoder,
    @Inject(TRANSPORT_TOKEN) private readonly transport: DataSource,
    @Inject(RID_TRANSPORT_TOKEN) private readonly ridTransport: DataSource,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness + ingress/feed status' })
  @ApiOkResponse({ type: HealthStatusDto, description: 'Service health' })
  status(): HealthStatusDto {
    return {
      status: 'ok',
      uptimeSeconds: process.uptime(),
      source: this.transport.kind,
      trackedAircraft: this.tracks.countAircraft,
      malformedMessageCount: this.decoder.getMalformedCount(),
      secondsSinceLastMessage:
        Math.max(0, Date.now() - this.transport.getLastMessageAt()) / 1000,
      connectionStatus: this.transport.getConnectionStatus(),
      ridSource: this.ridTransport.kind,
      ridConnectionStatus: this.ridTransport.getConnectionStatus(),
      ridSecondsSinceLastMessage:
        Math.max(0, Date.now() - this.ridTransport.getLastMessageAt()) / 1000,
      trackedDrones: this.tracks.countDrones,
    };
  }
}
