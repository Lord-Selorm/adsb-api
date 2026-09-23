import type { EventEmitter } from 'node:events';
import type { Point } from '@influxdata/influxdb-client';
import type { DataSource } from '../common/data-source.interface.js';
import type { Track } from '../tracks/track-store.service.js';

/**
 * Registry of sensor descriptors.
 *
 * Each sensor module provides its descriptor under its own unique token
 * (AIRCRAFT_SOURCE / DRONE_SOURCE / VESSEL_SOURCE) and exports it.
 * `SensorsModule` injects every sensor token and exposes the combined
 * `SENSOR_SOURCES` array to consumers (track merge, health, flights).
 */
export const SENSOR_SOURCES = Symbol('SENSOR_SOURCES');

export const AIRCRAFT_SOURCE = Symbol('AIRCRAFT_SOURCE');
export const DRONE_SOURCE = Symbol('DRONE_SOURCE');
export const VESSEL_SOURCE = Symbol('VESSEL_SOURCE');

/** The narrow store surface a sensor must expose to the registry. */
export interface SensorStoreLike<TState> {
  readonly events: EventEmitter;
  getAll(): TState[];
  get(id: string): TState | null | undefined;
  readonly count: number;
}

/** Where this sensor's live status lands in the /api/health response. */
export interface SensorHealthSpec {
  sourceField: string;
  connectionStatusField: string;
  secondsSinceLastMessageField: string;
  trackedCountField: string;
}

/** InfluxDB persistence wiring for this sensor. */
export interface SensorFlightsSpec<TState> {
  measurement: string;
  tag: string;
  buildPoint(state: TState): Point;
}

export interface SensorSourceDescriptor<TState = unknown> {
  /** adsb | drone_rid | ais (must extend TrackSource). */
  source: string;
  transport: DataSource;
  store: SensorStoreLike<TState>;
  /** Ingest hook (e.g. ingress service -> store handle). */
  feed?(input: unknown): TState | null;
  /** Map stored state into the unified Track shape. */
  toTrack(state: TState): Track;
  health: SensorHealthSpec;
  flights?: SensorFlightsSpec<TState>;
}