import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { DataSource } from '../common/data-source.interface.js';
import { DroneRidStoreService } from './drone-rid-store.service.js';
import { RidDecoder } from './rid.decoder.js';
import { RID_TRANSPORT_TOKEN } from './rid.transport.token.js';

/**
 * Drone Remote ID ingress pipeline: RID DataSource bytes (JSON lines) ->
 * RidDecoder -> DroneRidStore. Reuses the DataSource contract so serial/TCP
 * feeds slot in behind the same interface (mock today).
 */
@Injectable()
export class RidIngressService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RidIngressService.name);
  private pending = '';
  private readonly stats = {
    rawBytes: 0,
    rawChunks: 0,
    jsonLines: 0,
    nonJsonLines: 0,
    droneFrames: 0,
    ignoredFrames: 0,
    lastRawLine: '',
    lastIgnoredLine: '',
  };

  constructor(
    @Inject(RID_TRANSPORT_TOKEN) private readonly source: DataSource,
    private readonly decoder: RidDecoder,
    private readonly store: DroneRidStoreService,
  ) {}

  getStats(): typeof this.stats {
    return { ...this.stats, dronesTracked: this.store.count } as typeof this.stats;
  }

  async onModuleInit(): Promise<void> {
    this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.source?.disconnect();
  }

  connect(): void {
    this.source.onData((chunk) => this.onChunk(chunk));
    this.source.onError((err) =>
      this.logger.error(`RID DataSource error: ${err.message}`),
    );
    this.logger.log(
      'Connecting Drone Remote ID ingress via injected transport...',
    );
    this.source.connect().catch((err) => {
      this.logger.error(`Failed to start RID source: ${err.message}`);
    });
  }

  private onChunk(chunk: Buffer): void {
    this.stats.rawBytes += chunk.length;
    this.stats.rawChunks++;
    this.pending += chunk.toString('utf8');
    const lines = this.pending.split('\n');
    this.pending = lines.pop() ?? '';
    for (const line of lines) {
      const { drone, status } = this.decoder.decodeLineWithStatus(line);
      if (drone) {
        this.stats.droneFrames++;
        this.stats.lastRawLine = line.slice(0, 300);
        this.store.handle(drone);
        continue;
      }
      if (status === 'non_json') this.stats.nonJsonLines++;
      else if (status === 'empty') this.stats.jsonLines++;
      else {
        this.stats.ignoredFrames++;
        this.stats.lastIgnoredLine = line.slice(0, 300);
      }
    }
  }
}
