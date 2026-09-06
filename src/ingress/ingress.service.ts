import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AircraftStoreService } from '../aircraft/aircraft-store.service.js';
import { ModeSDecoder } from '../decode/mode-s.decoder.js';
import type { ParsedFrame } from './framing/framing.types.js';
import { FramingDetector } from './framing/framing.detector.js';
import type { DataSource } from './data-source.interface.js';
import { TRANSPORT_TOKEN } from './transport.token.js';

/**
 * Ingress pipeline: DataSource bytes -> FramingDetector -> ModeSDecoder ->
 * AircraftStore. Transport selection is decided by the `USE_MOCK` flag in
 * IngressModule (`true` = mock simulator, `false` = real ADSR-800 serial;
 * TCP/UDP are future slots behind the same DataSource contract).
 */
@Injectable()
export class IngressService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngressService.name);
  private detector: FramingDetector | null = null;

  constructor(
    @Inject(TRANSPORT_TOKEN) private readonly source: DataSource,
    private readonly config: ConfigService,
    private readonly store: AircraftStoreService,
    private readonly decoder: ModeSDecoder,
  ) {}

  async onModuleInit(): Promise<void> {
    this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.source?.disconnect();
  }

  /** Connect using the injected transport based on configuration. */
  connect(): void {
    this.detector = new FramingDetector(
      (frame) => this.onFrame(frame),
      (err) => this.logger.warn(err.message),
    );

    this.source.onData((chunk) => this.detector?.push(chunk));
    this.source.onError((err) => this.logger.error(`DataSource error: ${err.message}`));

    this.logger.log(`Connecting ADS-B ingress via injected transport...`);
    this.source.connect().catch((err) => {
      this.logger.error(`Failed to start source: ${err.message}`);
    });
  }

  /** Decode a standalone hex message (used in tests / diagnostics). */
  decodeOne(rawHex: string): ReturnType<ModeSDecoder['decode']> {
    const buf = Buffer.from(rawHex.padEnd(28, '0').slice(0, 28), 'hex');
    return this.decoder.decode(buf, 112);
  }

  private onFrame(frame: ParsedFrame): void {
    const msg = this.decoder.decode(frame.frame, frame.bits);
    if (!msg) return;
    if (!msg.crcOk) {
      this.logger.debug(`Dropping bad CRC for ${msg.icao}`);
      return;
    }
    this.store.handle(msg);
  }
}