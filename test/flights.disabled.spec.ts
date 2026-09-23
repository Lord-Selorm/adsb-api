import { describe, expect, it } from 'vitest';
import { FlightsService } from '../src/flights/flights.service.js';
import type { AircraftState } from '../src/aircraft/aircraft-store.service.js';
import type { DroneRidState } from '../src/rid/drone-rid-store.service.js';

function makeConfig(url?: string) {
  return {
    get: (key: string, def?: string) =>
      key === 'INFLUX_URL' ? (url ?? def) : def,
  } as never;
}

describe('FlightsService', () => {
  it('is disabled when INFLUX_URL is not set', async () => {
    const svc = new FlightsService(makeConfig(undefined));
    await svc.onModuleInit();
    // No pool -> enqueue no-ops, no error.
    const state: AircraftState = {
      icao: '89630c',
      firstSeenAt: 1,
      lastUpdatedAt: 1,
      stale: false,
    };
    svc.enqueue(state);
    expect(await svc.queryPositionCount()).toBe(0);
    svc.onModuleDestroy();
  });

  it('normalizes an aircraft state into a buffers without a pool', () => {
    const svc = new FlightsService(makeConfig(undefined));
    const state: AircraftState = {
      icao: '89630c',
      callsign: 'GHF550',
      altitude: 37750,
      lat: 5.54,
      lon: -0.2,
      speed: 182,
      heading: 259,
      verticalRate: -832,
      firstSeenAt: 1000,
      lastUpdatedAt: 2000,
      stale: false,
    };
    // As long as not enabled, enqueue keeps buffer untouched but no throw.
    expect(() => svc.enqueue(state)).not.toThrow();
  });

  it('normalizes a drone state into buffers without a pool', () => {
    const svc = new FlightsService(makeConfig(undefined));
    const state: DroneRidState = {
      serial_number: 'A1B2C3D4',
      latitude: 51.4472,
      longitude: 7.2665,
      height: 12.4,
      uav_type: 'DJI Mini4Pro',
      status: 2,
      firstSeenAt: 1000,
      lastUpdatedAt: 2000,
      stale: false,
    };
    // Not enabled -> drone enqueue no-ops, no throw.
    expect(() => svc.enqueueDrone(state)).not.toThrow();
    expect(svc['pending'].length).toBe(0);
  });

  it('returns 0 drone rows while persistence is disabled', async () => {
    const svc = new FlightsService(makeConfig(undefined));
    await svc.onModuleInit();
    expect(await svc.queryDronePositionCount()).toBe(0);
    expect(await svc.queryDronePositions('A1B2C3D4', new Date(0), new Date())).toEqual(
      [],
    );
    expect(
      await svc.queryDroneFlights(new Date(0), new Date()),
    ).toEqual([]);
    svc.onModuleDestroy();
  });
});