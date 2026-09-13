import { describe, expect, it } from 'vitest';
import { RidDecoder } from './rid.decoder.js';

describe('RidDecoder', () => {
  const decoder = new RidDecoder();

  it('parses a frame_type 0x03 envelope into drone state', () => {
    const line = JSON.stringify({
      frame_type: 3,
      frame_info: {
        serial_number: 'A1B2C3D4',
        longitude: 7.2665,
        latitude: 51.4472,
        height: 12.4,
        altitude: 140.2,
        v_hor: 8.1,
        v_up: 0.2,
        app_lat: 51.4,
        app_lon: 7.25,
        app_alt: 98,
        app_type: 1,
        uav_type: 'DJI Mini4Pro',
        reg_code: 'A1B2C3D4',
        angle: 92,
        status: 2,
        sys_type: 1,
        weight: 1,
        has_allowlist: false,
      },
    });

    const d = decoder.decodeLine(line);
    expect(d).not.toBeNull();
    expect(d!.serial_number).toBe('A1B2C3D4');
    expect(d!.longitude).toBeCloseTo(7.2665, 4);
    expect(d!.latitude).toBeCloseTo(51.4472, 4);
    expect(d!.height).toBe(12.4);
    expect(d!.uav_type).toBe('DJI Mini4Pro');
    expect(d!.status).toBe(2);
    expect(d!.app_type).toBe(1);
    expect(d!.has_allowlist).toBe(false);
  });

  it('accepts a bare drone object without the protocol wrapper', () => {
    const d = decoder.decodeLine(
      JSON.stringify({ serial_number: 'X1', latitude: 10, longitude: 20 }),
    );
    expect(d!.serial_number).toBe('X1');
    expect(d!.latitude).toBe(10);
  });

  it('rejects empty, whitespace, non-JSON and missing-serial lines', () => {
    expect(decoder.decodeLine('')).toBeNull();
    expect(decoder.decodeLine('   ')).toBeNull();
    expect(decoder.decodeLine('not json')).toBeNull();
    expect(
      decoder.decodeLine(JSON.stringify({ frame_type: 2, frame_info: {} })),
    ).toBeNull();
    expect(decoder.decodeLine(JSON.stringify({ longitude: 5 }))).toBeNull();
  });
});
