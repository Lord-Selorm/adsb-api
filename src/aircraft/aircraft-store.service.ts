import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { CprTracker, cprLocal, cprNL } from '../decode/cpr.js';
import type { DecodedMessage } from '../decode/mode-s.decoder.js';

export interface AircraftState {
  icao: string;
  callsign?: string;
  altitude?: number;
  lat?: number;
  lon?: number;
  speed?: number;
  heading?: number;
  verticalRate?: number;
  onGround?: boolean;
  squawk?: string;
  /** 'global' | 'local' position resolution. */
  positionSource?: 'global' | 'local';
  firstSeenAt: number;
  lastUpdatedAt: number;
  /** True when no messages for > staleAfterMs (still visible, flagged). */
  stale: boolean;
}

export interface AircraftStoreConfig {
  staleAfterMs: number;
  evictAfterMs: number;
  scanIntervalMs: number;
  receiverLat?: number;
  receiverLon?: number;
}

interface Entry {
  state: AircraftState;
  tracker: CprTracker;
}

/**
 * In-memory tracker of the latest state per ICAO address. Live reads
 * (REST + WebSocket) hit an in-memory Map — no DB round-trip. Entries are
 * flagged stale after `staleAfterMs` and evicted after `evictAfterMs`.
 */
@Injectable()
export class AircraftStoreService implements OnModuleDestroy {
  readonly events = new EventEmitter();
  private readonly logger = new Logger(AircraftStoreService.name);
  private readonly entries = new Map<string, Entry>();
  private readonly scanner: NodeJS.Timeout;
  private readonly cfg: Required<AircraftStoreConfig>;

  constructor(cfg: AircraftStoreConfig) {
    this.cfg = {
      staleAfterMs: cfg.staleAfterMs,
      evictAfterMs: cfg.evictAfterMs,
      scanIntervalMs: cfg.scanIntervalMs,
      receiverLat: cfg.receiverLat ?? 0,
      receiverLon: cfg.receiverLon ?? 0,
    };
    this.scanner = setInterval(() => this.scan(), cfg.scanIntervalMs || 10_000);
  }

  onModuleDestroy(): void {
    clearInterval(this.scanner);
  }

  /** Feed a decoded message; merges it into per-aircraft state. */
  handle(msg: DecodedMessage): AircraftState | null {
    if (msg.df !== 17) {
      // We only track extended squitter aircraft today.
      if (!(msg.callsign || msg.altitude !== undefined || msg.squawk)) return null;
    }
    let entry = this.entries.get(msg.icao);
    if (!entry) {
      entry = {
        state: {
          icao: msg.icao,
          firstSeenAt: msg.receivedAt,
          lastUpdatedAt: msg.receivedAt,
          stale: false,
        },
        tracker: new CprTracker(),
      };
      this.entries.set(msg.icao, entry);
    }

    const s = entry.state;
    if (msg.callsign) s.callsign = msg.callsign;
    if (msg.squawk) s.squawk = msg.squawk;
    if (msg.onGround !== undefined) s.onGround = msg.onGround;
    if (msg.altitude !== undefined) {
      s.altitude = msg.altitude;
      if (msg.altitudeSource === 'surface') s.onGround = true;
    }
    if (msg.velocity) {
      s.speed = msg.velocity.speed;
      s.heading = msg.velocity.heading;
      s.verticalRate = msg.velocity.verticalRate;
    }
    if (msg.airbornePosition) {
      const ref =
        s.lat !== undefined && s.lon !== undefined
          ? { lat: s.lat, lon: s.lon }
          : { lat: this.cfg.receiverLat, lon: this.cfg.receiverLon };
      const pos = entry.tracker.feed(msg.airbornePosition, ref, msg.receivedAt);
      if (pos) {
        s.lat = pos.lat;
        s.lon = pos.lon;
        s.positionSource = pos.source;
        // Keep local-decoded positions from drifting; confirm with global pairs.
        s.stale = false;
      }
    }

    s.lastUpdatedAt = msg.receivedAt;
    this.events.emit('update', s);
    return s;
  }

  get(icao: string): AircraftState | null {
    const entry = this.entries.get(icao.toLowerCase());
    if (!entry) return null;
    return this.decorate(entry);
  }

  getAll(): AircraftState[] {
    return Array.from(this.entries.values()).map((e) => this.decorate(e));
  }

  get count(): number {
    return this.entries.size;
  }

  /** Position snapshot for receivers sharing the same coordinates. */
  private decorate(entry: Entry): AircraftState {
    const s = entry.state;
    const stale = Date.now() - s.lastUpdatedAt > this.cfg.staleAfterMs;
    return { ...s, stale };
  }

  private scan(): void {
    const now = Date.now();
    for (const [icao, entry] of this.entries) {
      if (now - entry.state.lastUpdatedAt > this.cfg.evictAfterMs) {
        this.entries.delete(icao);
        this.events.emit('remove', entry.state.icao);
        this.logger.debug(`Evicted ${icao} (no signal for > ${this.cfg.evictAfterMs}ms)`);
      }
    }
  }
}

/** CPR helpers re-exported so tests / future modules reuse one implementation. */
export { cprLocal, cprNL, CprTracker };