import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { AircraftState } from '../aircraft/aircraft-store.service.js';
import type { DecodedMessage } from '../decode/mode-s.decoder.js';
import type { DroneRidState, RidReport } from '../rid/drone-rid-store.service.js';
import type { DecodedAisMessage, VesselState } from '../ais/ais.types.js';
import {
  SENSOR_SOURCES,
  type SensorSourceDescriptor,
} from '../sensors/sensor-source.js';

export type TrackSource = 'adsb' | 'drone_rid' | 'ais';

/** Unified tracked object: common fields for every sensor source. */
export interface Track {
  source: TrackSource;
  /** adsb: lowercase ICAO hex; drone_rid: serial_number; ais: MMSI. */
  id: string;
  firstSeenAt: number;
  lastUpdatedAt: number;
  stale: boolean;
  lat?: number;
  lon?: number;
  [key: string]: unknown;
}

/**
 * Single in-memory view over every sensor source. Instead of hand-wiring a
 * store per sensor, this loops the SENSOR_SOURCES registry: each descriptor
 * knows how to map its store's state into a unified Track and rebroadcast
 * events with the source attached, so REST + WebSocket consumers see one
 * unified picture regardless of how many sensors are registered.
 */
@Injectable()
export class TrackStoreService implements OnModuleDestroy {
  readonly events = new EventEmitter();

  constructor(
    @Inject(SENSOR_SOURCES)
    private readonly sources: Array<SensorSourceDescriptor<unknown>>,
  ) {
    for (const src of this.sources) {
      src.store.events.on('update', (state: unknown) =>
        this.events.emit('update', src.toTrack(state)),
      );
      src.store.events.on('remove', (id: string) =>
        this.events.emit('remove', {
          source: src.source,
          id,
          at: Date.now(),
        }),
      );
    }
  }

  onModuleDestroy(): void {
    this.events.removeAllListeners();
  }

  /** Feed a decoded ADS-B message into the aircraft store. */
  handleAircraft(msg: DecodedMessage): AircraftState | null {
    const src = this.source('adsb');
    return (src?.feed?.(msg) as AircraftState | null) ?? null;
  }

  /** Feed a decoded Drone RID report into the drone store. */
  handleDrone(drone: RidReport): DroneRidState | null {
    const src = this.source('drone_rid');
    return (src?.feed?.(drone) as DroneRidState | null) ?? null;
  }

  /** Feed a decoded AIS report into the vessel store. */
  handleVessel(report: DecodedAisMessage): VesselState | null {
    const src = this.source('ais');
    return (src?.feed?.(report) as VesselState | null) ?? null;
  }

  getAll(source?: TrackSource): Track[] {
    const tracks: Track[] = [];
    for (const src of this.sources) {
      if (source && src.source !== source) continue;
      for (const state of src.store.getAll()) {
        tracks.push(src.toTrack(state));
      }
    }
    return tracks;
  }

  get(source: TrackSource, id: string): Track | null {
    const src = this.source(source);
    if (!src) return null;
    const state = src.store.get(id);
    return state ? src.toTrack(state) : null;
  }

  get countAircraft(): number {
    return this.source('adsb')?.store.count ?? 0;
  }

  get countDrones(): number {
    return this.source('drone_rid')?.store.count ?? 0;
  }

  get countVessels(): number {
    return this.source('ais')?.store.count ?? 0;
  }

  private source(name: string): SensorSourceDescriptor<unknown> | undefined {
    return this.sources.find((s) => s.source === name);
  }
}