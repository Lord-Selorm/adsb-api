import { Point } from '@influxdata/influxdb-client';
import type { DataSource } from '../common/data-source.interface.js';
import type {
  AircraftStoreService,
  AircraftState,
} from '../aircraft/aircraft-store.service.js';
import type { DecodedMessage } from '../decode/mode-s.decoder.js';
import type {
  DroneRidStoreService,
  DroneRidState,
} from '../rid/drone-rid-store.service.js';
import type { VesselStoreService } from '../ais/vessel-store.service.js';
import type { DecodedAisMessage, VesselState } from '../ais/ais.types.js';
import {
  MEASUREMENT_AIRCRAFT,
  MEASUREMENT_DRONE,
  MEASUREMENT_VESSEL,
  TAG_ICAO,
  TAG_SERIAL,
  TAG_MMSI,
} from '../flights/flights.constants.js';
import type { SensorSourceDescriptor } from './sensor-source.js';

/**
 * Per-sensor registry descriptors. One factory per sensor: everything the
 * registry consumers (track merge, health, flights persistence) need to know
 * is captured here, keyed to the store + transport the sensor module already
 * owns. Adding a sensor = add one factory + one registration provider.
 */

export function createAircraftSource(
  store: AircraftStoreService,
  transport: DataSource,
): SensorSourceDescriptor<AircraftState> {
  return {
    source: 'adsb',
    transport,
    store,
    feed: (input) => store.handle(input as DecodedMessage),
    toTrack: (s) => ({ ...s, source: 'adsb', id: s.icao }),
    health: {
      sourceField: 'source',
      connectionStatusField: 'connectionStatus',
      secondsSinceLastMessageField: 'secondsSinceLastMessage',
      trackedCountField: 'trackedAircraft',
    },
    flights: {
      measurement: MEASUREMENT_AIRCRAFT,
      tag: TAG_ICAO,
      buildPoint: aircraftPoint,
    },
  };
}

export function createDroneSource(
  store: DroneRidStoreService,
  transport: DataSource,
): SensorSourceDescriptor<DroneRidState> {
  return {
    source: 'drone_rid',
    transport,
    store,
    feed: (input) => store.handle(input as DroneRidState),
    toTrack: (d) => ({
      ...d,
      source: 'drone_rid',
      id: d.serial_number,
      lat: d.latitude,
      lon: d.longitude,
    }),
    health: {
      sourceField: 'ridSource',
      connectionStatusField: 'ridConnectionStatus',
      secondsSinceLastMessageField: 'ridSecondsSinceLastMessage',
      trackedCountField: 'trackedDrones',
    },
    flights: {
      measurement: MEASUREMENT_DRONE,
      tag: TAG_SERIAL,
      buildPoint: dronePoint,
    },
  };
}

export function createVesselSource(
  store: VesselStoreService,
  transport: DataSource,
): SensorSourceDescriptor<VesselState> {
  return {
    source: 'ais',
    transport,
    store,
    feed: (input) => store.handle(input as DecodedAisMessage),
    toTrack: (v) => ({
      ...v,
      source: 'ais',
      id: v.mmsi,
      lat: v.latitude,
      lon: v.longitude,
    }),
    health: {
      sourceField: 'aisSource',
      connectionStatusField: 'aisConnectionStatus',
      secondsSinceLastMessageField: 'aisSecondsSinceLastMessage',
      trackedCountField: 'trackedVessels',
    },
    flights: {
      measurement: MEASUREMENT_VESSEL,
      tag: TAG_MMSI,
      buildPoint: vesselPoint,
    },
  };
}

function aircraftPoint(s: AircraftState): Point {
  const p = new Point(MEASUREMENT_AIRCRAFT)
    .tag(TAG_ICAO, s.icao)
    .timestamp(new Date(s.lastUpdatedAt));
  if (s.callsign) p.stringField('callsign', s.callsign);
  if (isNum(s.lat)) p.floatField('latitude', s.lat!);
  if (isNum(s.lon)) p.floatField('longitude', s.lon!);
  if (isNum(s.altitude)) p.intField('altitude', s.altitude!);
  if (isNum(s.heading)) p.floatField('heading', s.heading!);
  if (isNum(s.speed)) p.floatField('speed', s.speed!);
  if (isNum(s.verticalRate)) p.intField('vertical_rate', s.verticalRate!);
  if (s.squawk) p.stringField('squawk', s.squawk);
  if (s.positionSource) p.stringField('position_source', s.positionSource);
  if (s.onGround !== undefined) p.booleanField('on_ground', s.onGround);
  return p;
}

function dronePoint(d: DroneRidState): Point {
  const p = new Point(MEASUREMENT_DRONE)
    .tag(TAG_SERIAL, d.serial_number)
    .timestamp(new Date(d.lastUpdatedAt));
  if (isNum(d.latitude)) p.floatField('latitude', d.latitude!);
  if (isNum(d.longitude)) p.floatField('longitude', d.longitude!);
  if (isNum(d.height)) p.floatField('height', d.height!);
  if (isNum(d.altitude)) p.floatField('altitude', d.altitude!);
  if (isNum(d.v_hor)) p.floatField('v_hor', d.v_hor!);
  if (isNum(d.v_up)) p.floatField('v_up', d.v_up!);
  if (d.uav_type) p.stringField('uav_type', d.uav_type);
  if (isNum(d.app_lat)) p.floatField('app_lat', d.app_lat!);
  if (isNum(d.app_lon)) p.floatField('app_lon', d.app_lon!);
  if (isNum(d.app_alt)) p.floatField('app_alt', d.app_alt!);
  if (isNum(d.app_type)) p.intField('app_type', d.app_type!);
  if (d.reg_code) p.stringField('reg_code', d.reg_code);
  if (isNum(d.angle)) p.floatField('angle', d.angle!);
  if (isNum(d.status)) p.intField('status', d.status!);
  if (isNum(d.sys_type)) p.intField('sys_type', d.sys_type!);
  if (isNum(d.weight)) p.intField('weight', d.weight!);
  if (d.has_allowlist !== undefined)
    p.booleanField('has_allowlist', d.has_allowlist);
  return p;
}

function vesselPoint(v: VesselState): Point {
  const p = new Point(MEASUREMENT_VESSEL)
    .tag(TAG_MMSI, v.mmsi)
    .timestamp(new Date(v.lastUpdatedAt));
  if (v.name) p.stringField('name', v.name);
  if (v.callsign) p.stringField('callsign', v.callsign);
  if (isNum(v.latitude)) p.floatField('latitude', v.latitude!);
  if (isNum(v.longitude)) p.floatField('longitude', v.longitude!);
  if (isNum(v.sog)) p.floatField('sog', v.sog!);
  if (isNum(v.cog)) p.floatField('cog', v.cog!);
  if (isNum(v.heading)) p.floatField('heading', v.heading!);
  if (isNum(v.navStatus)) p.intField('nav_status', v.navStatus!);
  if (isNum(v.shipType)) p.intField('ship_type', v.shipType!);
  if (v.destination) p.stringField('destination', v.destination);
  if (isNum(v.draft)) p.floatField('draft', v.draft!);
  if (isNum(v.length)) p.floatField('length', v.length!);
  if (isNum(v.width)) p.floatField('width', v.width!);
  return p;
}

function isNum(v: number | undefined | null): boolean {
  return v !== undefined && v !== null && Number.isFinite(v);
}