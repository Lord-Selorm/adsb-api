import { describe, expect, it } from 'vitest';
import { TimescaleService } from '../src/timescale/timescale.service.js';
import type { AircraftState } from '../src/aircraft/aircraft-store.service.js';

function makeConfig(url?: string) {
  return { get: (key: string, def?: string) => (key === 'DATABASE_URL' ? url ?? def : def) } as never;
}

describe('TimescaleService', () => {
  it('is disabled when DATABASE_URL is not set', async () => {
    const svc = new TimescaleService(makeConfig(undefined));
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
    const svc = new TimescaleService(makeConfig(undefined));
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
});
