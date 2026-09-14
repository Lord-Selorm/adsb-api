import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import {
  AircraftStoreService,
  AircraftState,
} from '../aircraft/aircraft-store.service.js';
import type { DecodedMessage } from '../decode/mode-s.decoder.js';
import {
  DroneRidStoreService,
  DroneRidState,
  type RidReport,
} from '../rid/drone-rid-store.service.js';
import { VesselStoreService } from '../ais/vessel-store.service.js';
import type { DecodedAisMessage, VesselState } from '../ais/ais.types.js';

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
 * Single in-memory view over every sensor source. ADS-B, Drone RID, and AIS
 * stores stay owned by their own modules; this service merges them behind one
 * interface (get/watchers) and rebroadcasts all stores' events with the
 * source attached, so REST + WebSocket consumers see one unified picture.
 */
@Injectable()
export class TrackStoreService implements OnModuleDestroy {
  readonly events = new EventEmitter();

  constructor(
    private readonly adsb: AircraftStoreService,
    private readonly drone: DroneRidStoreService,
    @Optional() private readonly vessels?: VesselStoreService,
  ) {
    this.adsb.events.on('update', (s: AircraftState) =>
      this.events.emit('update', this.adsbTrack(s)),
    );
    this.adsb.events.on('remove', (icao: string) =>
      this.events.emit('remove', { source: 'adsb', id: icao, at: Date.now() }),
    );
    this.drone.events.on('update', (d: DroneRidState) =>
      this.events.emit('update', this.droneTrack(d)),
    );
    this.drone.events.on('remove', (id: string) =>
      this.events.emit('remove', { source: 'drone_rid', id, at: Date.now() }),
    );
    if (this.vessels) {
      this.vessels.events.on('update', (v: VesselState) =>
        this.events.emit('update', this.vesselTrack(v)),
      );
      this.vessels.events.on('remove', (mmsi: string) =>
        this.events.emit('remove', { source: 'ais', id: mmsi, at: Date.now() }),
      );
    }
  }

  onModuleDestroy(): void {
    this.events.removeAllListeners();
  }

  /** Feed a decoded ADS-B message into the aircraft store. */
  handleAircraft(msg: DecodedMessage): AircraftState | null {
    return this.adsb.handle(msg);
  }

  /** Feed a decoded Drone RID report into the drone store. */
  handleDrone(drone: RidReport): DroneRidState | null {
    return this.drone.handle(drone);
  }

  /** Feed a decoded AIS report into the vessel store. */
  handleVessel(report: DecodedAisMessage): VesselState | null {
    return this.vessels?.handle(report) ?? null;
  }

  getAll(source?: TrackSource): Track[] {
    const tracks: Track[] = [];
    if (!source || source === 'adsb') {
      tracks.push(...this.adsb.getAll().map((s) => this.adsbTrack(s)));
    }
    if (!source || source === 'drone_rid') {
      tracks.push(...this.drone.getAll().map((d) => this.droneTrack(d)));
    }
    if ((!source || source === 'ais') && this.vessels) {
      tracks.push(...this.vessels.getAll().map((v) => this.vesselTrack(v)));
    }
    return tracks;
  }

  get(source: TrackSource, id: string): Track | null {
    if (source === 'adsb') {
      const state = this.adsb.get(id);
      return state ? this.adsbTrack(state) : null;
    }
    if (source === 'drone_rid') {
      const state = this.drone.get(id);
      return state ? this.droneTrack(state) : null;
    }
    if (source === 'ais' && this.vessels) {
      const state = this.vessels.get(id);
      return state ? this.vesselTrack(state) : null;
    }
    return null;
  }

  get countAircraft(): number {
    return this.adsb.count;
  }

  get countDrones(): number {
    return this.drone.count;
  }

  get countVessels(): number {
    return this.vessels?.count ?? 0;
  }

  private adsbTrack(s: AircraftState): Track {
    return { ...s, source: 'adsb', id: s.icao };
  }

  private droneTrack(d: DroneRidState): Track {
    return {
      ...d,
      source: 'drone_rid',
      id: d.serial_number,
      lat: d.latitude,
      lon: d.longitude,
    };
  }

  private vesselTrack(v: VesselState): Track {
    return {
      ...v,
      source: 'ais',
      id: v.mmsi,
      lat: v.latitude,
      lon: v.longitude,
    };
  }
}
