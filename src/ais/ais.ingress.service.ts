import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { DataSource } from '../common/data-source.interface.js';
import { VesselStoreService } from './vessel-store.service.js';
import { AisDecoder } from './ais.decoder.js';
import { AIS_TRANSPORT_TOKEN } from './ais.transport.token.js';

@Injectable()
export class AisIngressService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AisIngressService.name);
  private pending = '';

  constructor(
    @Inject(AIS_TRANSPORT_TOKEN) private readonly source: DataSource,
    private readonly decoder: AisDecoder,
    private readonly store: VesselStoreService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.source?.disconnect();
  }

  connect(): void {
    this.source.onData((chunk) => this.onChunk(chunk));
    this.source.onError((err) =>
      this.logger.error(`AIS DataSource error: ${err.message}`),
    );
    this.logger.log('Connecting AIS ingress via injected transport...');
    this.source.connect().catch((err) => {
      this.logger.error(`Failed to start AIS source: ${err.message}`);
    });
  }

  private onChunk(chunk: Buffer): void {
    this.pending += chunk.toString('utf8');
    const lines = this.pending.split('\n');
    this.pending = lines.pop() ?? '';
    for (const line of lines) {
      const report = this.decoder.decodeLine(line);
      if (report) this.store.handle(report);
    }
  }
}
