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

  it('decodes URM-02 manual field aliases (uav_sn/uav_lon/uav_lat/uav_height/uav_v_hor)', () => {
    const d = decoder.decodeLine(
      JSON.stringify({
        frame_type: 3,
        frame_info: {
          uav_sn: 'UAVRQM260017',
          uav_lon: 4.004794,
          uav_lat: 52.035146,
          uav_height: 99,
          uav_v_hor: 11.7,
          app_lon: 4,
          app_lat: 52,
          uav_type: 'DJI Mini4Pro',
        },
      }),
    );
    expect(d).not.toBeNull();
    expect(d!.serial_number).toBe('UAVRQM260017');
    expect(d!.longitude).toBeCloseTo(4.004794, 4);
    expect(d!.latitude).toBeCloseTo(52.035146, 4);
    expect(d!.height).toBe(99);
    expect(d!.v_hor).toBeCloseTo(11.7, 4);
    expect(d!.uav_type).toBe('DJI Mini4Pro');
  });

  it('ignores device GNSS heartbeats (frame_type 7) and other non-0x03 frames', () => {
    const heartbeat = JSON.stringify({
      frame_type: 7,
      dev_sn: 'UAVRQM260017',
      frame_info: {
        datetime: '1970-01-01_00:00:47.000',
        longitude: 0,
        latitude: 0,
      },
    });
    expect(decoder.decodeLine(heartbeat)).toBeNull();
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
