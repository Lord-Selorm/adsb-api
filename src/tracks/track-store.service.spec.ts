import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AircraftStoreService } from '../aircraft/aircraft-store.service.js';
import { ModeSDecoder } from '../decode/mode-s.decoder.js';
import {
  buildIdentityFrame,
  buildPositionFrame,
} from '../ingress/transports/frame-builder.js';
import { DroneRidStoreService } from '../rid/drone-rid-store.service.js';
import { TrackStoreService } from './track-store.service.js';

describe('TrackStoreService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const adsb = new AircraftStoreService({
      staleAfterMs: 15_000,
      evictAfterMs: 60_000,
      scanIntervalMs: 10_000,
      receiverLat: 52,
      receiverLon: 4,
    });
    const drone = new DroneRidStoreService({
      staleAfterMs: 15_000,
      evictAfterMs: 60_000,
      scanIntervalMs: 10_000,
    });
    const tracks = new TrackStoreService(adsb, drone);
    const decoder = new ModeSDecoder();
    return { adsb, drone, tracks, decoder };
  };

  it('combines adsb and drone tracks with a source tag', () => {
    const { tracks, decoder } = setup();
    tracks.handleAircraft(
      decoder.decode(buildIdentityFrame(0x4a0001, 'NEST101'), 112)!,
    );
    tracks.handleDrone({
      serial_number: 'A1B2C3D4',
      latitude: 51.4,
      longitude: 7.2,
    });

    const all = tracks.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((t) => t.source).sort()).toEqual(['adsb', 'drone_rid']);

    const [droneTrack] = tracks.getAll('drone_rid');
    expect(droneTrack.source).toBe('drone_rid');
    expect(droneTrack.id).toBe('A1B2C3D4');
    expect(droneTrack.lat).toBe(51.4);

    const [adsbTrack] = tracks.getAll('adsb');
    expect(adsbTrack.id).toBe('4a0001');
  });

  it('keeps adsb and drone entries independent even with identical ids', () => {
    const { tracks, decoder } = setup();
    tracks.handleAircraft(
      decoder.decode(buildIdentityFrame(0x4a0001, 'A'), 112)!,
    );
    tracks.handleDrone({ serial_number: '4a0001', latitude: 1 });
    expect(tracks.getAll()).toHaveLength(2);
  });

  it('forwards update and remove events tagged with their source', () => {
    const { tracks, decoder } = setup();
    const updates: string[] = [];
    const removes: string[] = [];
    tracks.events.on('update', (t) => updates.push(t.source));
    tracks.events.on('remove', (r) => removes.push(r.source));

    tracks.handleAircraft(
      decoder.decode(buildIdentityFrame(0x4a0002, 'B'), 112)!,
    );
    tracks.handleDrone({ serial_number: 'D1' });
    expect(updates).toEqual(['adsb', 'drone_rid']);

    vi.advanceTimersByTime(70_000);
    expect(removes.sort()).toEqual(['adsb', 'drone_rid']);
  });

  it('reports per-source counts and a null lookup for unknown ids', () => {
    const { tracks, decoder } = setup();
    tracks.handleAircraft(
      decoder.decode(buildIdentityFrame(0x4a0001, 'C'), 112)!,
    );
    expect(tracks.countAircraft).toBe(1);
    expect(tracks.countDrones).toBe(0);
    expect(tracks.get('adsb', '4A0001')).not.toBeNull();
    expect(tracks.get('drone_rid', 'anything')).toBeNull();
  });

  it('flags stale entries when read through the unified store', () => {
    const { tracks, decoder } = setup();
    tracks.handleAircraft(
      decoder.decode(
        buildPositionFrame({
          icao: 0x4a0003,
          lat: 52,
          lon: 4,
          altitudeFt: 10000,
          odd: false,
        }),
        112,
      )!,
    );
    expect(tracks.getAll()[0].stale).toBe(false);
    vi.advanceTimersByTime(20_000);
    expect(tracks.getAll()[0].stale).toBe(true);
  });
});
