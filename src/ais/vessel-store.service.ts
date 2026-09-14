import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { DecodedAisMessage, VesselState } from './ais.types.js';
import { NAV_STATUS_MAP, SHIP_TYPE_MAP } from './ais.decoder.js';

export interface VesselStoreConfig {
  staleAfterMs: number;
  evictAfterMs: number;
  scanIntervalMs: number;
}

@Injectable()
export class VesselStoreService implements OnModuleDestroy {
  readonly events = new EventEmitter();
  private readonly logger = new Logger(VesselStoreService.name);
  private readonly vessels = new Map<string, VesselState>();
  private readonly scanner: NodeJS.Timeout;
  private readonly staleAfterMs: number;
  private readonly evictAfterMs: number;

  constructor(cfg: VesselStoreConfig) {
    this.staleAfterMs = cfg.staleAfterMs;
    this.evictAfterMs = cfg.evictAfterMs;
    this.scanner = setInterval(() => this.scan(), cfg.scanIntervalMs || 15_000);
  }

  onModuleDestroy(): void {
    clearInterval(this.scanner);
    this.events.removeAllListeners();
  }

  handle(report: DecodedAisMessage): VesselState | null {
    if (!report.mmsi) return null;

    const now = Date.now();
    const existing = this.vessels.get(report.mmsi);

    const state: VesselState = existing
      ? { ...existing, lastUpdatedAt: now, stale: false }
      : {
          mmsi: report.mmsi,
          firstSeenAt: now,
          lastUpdatedAt: now,
          stale: false,
        };

    // Position updates (Type 1, 2, 3, 18)
    if (report.type === 1 || report.type === 2 || report.type === 3 || report.type === 18) {
      if (report.latitude !== undefined) state.latitude = report.latitude;
      if (report.longitude !== undefined) state.longitude = report.longitude;
      if (report.sog !== undefined) state.sog = report.sog;
      if (report.cog !== undefined) state.cog = report.cog;
      if (report.heading !== undefined) state.heading = report.heading;
      if (report.navStatus !== undefined) {
        state.navStatus = report.navStatus;
        state.navStatusDescription = NAV_STATUS_MAP[report.navStatus] ?? 'Unknown';
      }
    }

    // Static & Voyage data (Type 5, 24)
    if (report.type === 5 || report.type === 24) {
      if (report.name) state.name = report.name;
      if (report.callsign) state.callsign = report.callsign;
      if (report.shipType !== undefined) {
        state.shipType = report.shipType;
        state.shipTypeDescription = SHIP_TYPE_MAP[report.shipType] ?? 'Other';
      }
      if (report.destination) state.destination = report.destination;
      if (report.draft !== undefined) state.draft = report.draft;
      if (report.length !== undefined) state.length = report.length;
      if (report.width !== undefined) state.width = report.width;
    }

    this.vessels.set(report.mmsi, state);
    this.events.emit('update', state);
    return state;
  }

  get(mmsi: string): VesselState | undefined {
    return this.vessels.get(mmsi);
  }

  getAll(): VesselState[] {
    return Array.from(this.vessels.values());
  }

  get count(): number {
    return this.vessels.size;
  }

  private scan(): void {
    const now = Date.now();
    for (const [mmsi, vessel] of this.vessels.entries()) {
      const silence = now - vessel.lastUpdatedAt;
      if (silence > this.evictAfterMs) {
        this.vessels.delete(mmsi);
        this.logger.debug(
          `Evicted vessel ${mmsi} (no signal for > ${this.evictAfterMs}ms)`,
        );
        this.events.emit('remove', mmsi);
      } else if (!vessel.stale && silence > this.staleAfterMs) {
        vessel.stale = true;
        this.events.emit('update', vessel);
      }
    }
  }
}
