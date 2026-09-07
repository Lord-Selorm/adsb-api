import { Controller, Get, Inject } from '@nestjs/common';
import { AircraftStoreService } from './aircraft/aircraft-store.service.js';
import { ModeSDecoder } from './decode/mode-s.decoder.js';
import type { DataSource } from './ingress/data-source.interface.js';
import { TRANSPORT_TOKEN } from './ingress/transport.token.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly store: AircraftStoreService,
    private readonly decoder: ModeSDecoder,
    @Inject(TRANSPORT_TOKEN) private readonly transport: DataSource,
  ) {}

  @Get()
  status() {
    return {
      status: 'ok',
      uptimeSeconds: process.uptime(),
      source: this.transport.kind,
      trackedAircraft: this.store.count,
      malformedMessageCount: this.decoder.getMalformedCount(),
      secondsSinceLastMessage: Math.max(0, Date.now() - this.transport.getLastMessageAt()) / 1000,
      connectionStatus: this.transport.getConnectionStatus(),
    };
  }
}