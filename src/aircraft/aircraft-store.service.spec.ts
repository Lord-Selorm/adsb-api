import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AircraftStoreService } from './aircraft-store.service.js';
import { ModeSDecoder } from '../decode/mode-s.decoder.js';
import { buildIdentityFrame, buildPositionFrame, buildVelocityFrame } from '../ingress/transports/frame-builder.js';

describe('AircraftStoreService', () => {
  const decoder = new ModeSDecoder();
  const store = (overrides: Partial<ConstructorParameters<typeof AircraftStoreService>[0]> = {}) =>
    new AircraftStoreService({
      staleAfterMs: 15_000,
      evictAfterMs: 60_000,
      scanIntervalMs: 10_000,
      receiverLat: 52,
      receiverLon: 4,
      ...overrides,
    });

  const decodeOf = (buf: Buffer) => decoder.decode(buf, 112)!;

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('tracks a callsign, altitude, position and velocity on one aircraft', () => {
    const s = store();
    const icao = 0x4a0044;

    s.handle(decodeOf(buildIdentityFrame(icao, 'ABC123')));
    s.handle(
      decodeOf(buildPositionFrame({ icao, lat: 52.26, lon: 3.94, altitudeFt: 38000, odd: false })),
    );
    s.handle(
      decodeOf(buildPositionFrame({ icao, lat: 52.26, lon: 3.94, altitudeFt: 38000, odd: true })),
    );
    s.handle(decodeOf(buildVelocityFrame({ icao, speedKt: 300, trackDeg: 90, verticalRateFpm: 640 })));

    const aircraft = s.get(icao.toString(16))!;
    expect(aircraft.callsign).toBe('ABC123');
    expect(aircraft.altitude).toBe(38000);
    expect(aircraft.lat).toBeCloseTo(52.26, 2);
    expect(aircraft.lon).toBeCloseTo(3.94, 2);
    expect(aircraft.speed).toBeGreaterThanOrEqual(299);
    expect(aircraft.heading).toBeCloseTo(90, 0);
    expect(aircraft.verticalRate).toBe(640);
    expect(aircraft.positionSource).toBe('global');
    expect(aircraft.stale).toBe(false);
  });

  it('flags entries as stale after staleAfterMs', () => {
    const s = store();
    s.handle(decodeOf(buildPositionFrame({ icao: 0x4a0001, lat: 52, lon: 4, altitudeFt: 10000, odd: false })));
    expect(s.get('4a0001')!.stale).toBe(false);
    vi.advanceTimersByTime(20_000);
    expect(s.get('4a0001')!.stale).toBe(true);
  });

  it('evicts entries after evictAfterMs and emits remove', () => {
    const s = store();
    vi.spyOn(s.events, 'emit');
    s.handle(decodeOf(buildIdentityFrame(0x4a0002, 'X1234')));
    expect(s.count).toBe(1);
    vi.advanceTimersByTime(70_000);
    expect(s.count).toBe(0);
    expect(s.events.emit).toHaveBeenCalledWith('remove', '4a0002');
  });

  it('returns the same entry via getAll and get(icao)', () => {
    const s = store();
    s.handle(decodeOf(buildIdentityFrame(0x4a0003, 'Y1234')));
    expect(s.getAll()).toHaveLength(1);
    expect(s.get('4A0003')!.callsign).toBe('Y1234');
    expect(s.get('4a0003')!.icao).toBe('4a0003');
  });

  it('ignores empty / irrelevant messages', () => {
    const s = store();
    const empty = decoder.decode(Buffer.alloc(14), 112)!; // all zero DF17
    expect(empty).not.toBeNull();
    s.handle(empty);
    expect(s.count).toBe(0);
  });
});