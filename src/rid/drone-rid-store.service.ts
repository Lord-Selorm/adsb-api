import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'node:events';

/** Drone Remote ID state, keys/units matching the URM-01/02 frame_type 0x03 protocol. */
export interface DroneRidState {
  serial_number: string;
  longitude?: number;
  latitude?: number;
  height?: number;
  altitude?: number;
  v_hor?: number;
  v_up?: number;
  app_lat?: number;
  app_lon?: number;
  app_alt?: number;
  app_type?: number;
  uav_type?: string;
  reg_code?: string;
  angle?: number;
  status?: number;
  sys_type?: number;
  weight?: number;
  /** Whitelist match; URM-01/02 always reports false. */
  has_allowlist?: boolean;
  firstSeenAt: number;
  lastUpdatedAt: number;
  /** True when no messages for > staleAfterMs (still visible, flagged). */
  stale: boolean;
}

/** A decoded RID report before the store stamps firstSeenAt/lastUpdatedAt/stale. */
export type RidReport = Omit<
  DroneRidState,
  'stale' | 'firstSeenAt' | 'lastUpdatedAt'
>;

export interface DroneRidStoreConfig {
  staleAfterMs: number;
  evictAfterMs: number;
  scanIntervalMs: number;
}

/**
 * In-memory tracker of the latest Drone Remote ID state per serial number,
 * mirroring the AircraftStoreService lifecycle (stale flag + eviction).
 */
@Injectable()
export class DroneRidStoreService implements OnModuleDestroy {
  readonly events = new EventEmitter();
  private readonly logger = new Logger(DroneRidStoreService.name);
  private readonly entries = new Map<string, DroneRidState>();
  private readonly scanner: NodeJS.Timeout;
  private readonly staleAfterMs: number;
  private readonly evictAfterMs: number;

  constructor(cfg: DroneRidStoreConfig) {
    this.staleAfterMs = cfg.staleAfterMs;
    this.evictAfterMs = cfg.evictAfterMs;
    this.scanner = setInterval(() => this.scan(), cfg.scanIntervalMs || 10_000);
  }

  onModuleDestroy(): void {
    clearInterval(this.scanner);
  }

  /** Upsert a decoded RID report; merges it into per-drone state. */
  handle(drone: RidReport): DroneRidState | null {
    if (!drone.serial_number) return null;
    const now = Date.now();
    let state = this.entries.get(drone.serial_number);
    if (!state) {
      state = {
        serial_number: drone.serial_number,
        firstSeenAt: now,
        lastUpdatedAt: now,
        stale: false,
      };
      this.entries.set(drone.serial_number, state);
    }

    if (drone.longitude !== undefined) state.longitude = drone.longitude;
    if (drone.latitude !== undefined) state.latitude = drone.latitude;
    if (drone.height !== undefined) state.height = drone.height;
    if (drone.altitude !== undefined) state.altitude = drone.altitude;
    if (drone.v_hor !== undefined) state.v_hor = drone.v_hor;
    if (drone.v_up !== undefined) state.v_up = drone.v_up;
    if (drone.app_lat !== undefined) state.app_lat = drone.app_lat;
    if (drone.app_lon !== undefined) state.app_lon = drone.app_lon;
    if (drone.app_alt !== undefined) state.app_alt = drone.app_alt;
    if (drone.app_type !== undefined) state.app_type = drone.app_type;
    if (drone.uav_type !== undefined) state.uav_type = drone.uav_type;
    if (drone.reg_code !== undefined) state.reg_code = drone.reg_code;
    if (drone.angle !== undefined) state.angle = drone.angle;
    if (drone.status !== undefined) state.status = drone.status;
    if (drone.sys_type !== undefined) state.sys_type = drone.sys_type;
    if (drone.weight !== undefined) state.weight = drone.weight;
    if (drone.has_allowlist !== undefined) state.has_allowlist = drone.has_allowlist;

    state.lastUpdatedAt = now;
    this.events.emit('update', state);
    return state;
  }

  get(id: string): DroneRidState | null {
    const entry = this.entries.get(id);
    return entry ? this.decorate(entry) : null;
  }

  getAll(): DroneRidState[] {
    return Array.from(this.entries.values()).map((e) => this.decorate(e));
  }

  get count(): number {
    return this.entries.size;
  }

  private decorate(state: DroneRidState): DroneRidState {
    const stale = Date.now() - state.lastUpdatedAt > this.staleAfterMs;
    return { ...state, stale };
  }

  private scan(): void {
    const now = Date.now();
    for (const [id, state] of this.entries) {
      if (now - state.lastUpdatedAt > this.evictAfterMs) {
        this.entries.delete(id);
        this.events.emit('remove', state.serial_number);
        this.logger.debug(
          `Evicted drone ${id} (no signal for > ${this.evictAfterMs}ms)`,
        );
      }
    }
  }
}
