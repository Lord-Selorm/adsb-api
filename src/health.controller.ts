import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AircraftStoreService } from './aircraft/aircraft-store.service.js';
import { ModeSDecoder } from './decode/mode-s.decoder.js';
import type { DataSource } from './ingress/data-source.interface.js';
import { TRANSPORT_TOKEN } from './ingress/transport.token.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly config: ConfigService,
    private readonly store: AircraftStoreService,
    private readonly decoder: ModeSDecoder,
    @Inject(TRANSPORT_TOKEN) private readonly transport: DataSource,
  ) {}

  @Get()
  status() {
    const useMock = this.config.get<string>('USE_MOCK', 'true').toLowerCase() === 'true';
    return {
      status: 'ok',
      uptimeSeconds: process.uptime(),
      source: useMock ? 'mock' : 'serial',
      trackedAircraft: this.store.count,
      malformedMessageCount: this.decoder.getMalformedCount(),
      secondsSinceLastMessage: Math.max(0, Date.now() - this.transport.getLastMessageAt()) / 1000,
      connectionStatus: this.transport.getConnectionStatus(),
    };
  }
}