import { Logger } from '@nestjs/common';
import type { RidReport } from './drone-rid-store.service.js';

/** URM-01/02 protocol frame envelope: { "frame_type": 3, "frame_info": { ... } }. */
export interface RidFrameEnvelope {
  frame_type?: number;
  frame_info?: Partial<RidReport> & Record<string, unknown>;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function bool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

/** First present value among alias field names (Mini/Nano vs URM-02 manual). */
function pick(
  o: Record<string, unknown>,
  ...keys: string[]
): unknown {
  for (const k of keys) {
    if (o[k] !== undefined) return o[k];
  }
  return undefined;
}

/**
 * Parses URM Drone Remote ID reports (JSON lines) into DroneRidState.
 * Accepts either the protocol envelope ({ frame_type, frame_info }) or a
 * bare drone object, so the mock and serial/TCP/UDP feeds share one parser.
 * Field names are read with Mini/Nano aliases first, then the URM-02 manual
 * names (uav_sn, uav_lon, uav_lat, uav_height, uav_v_hor) so both the mock
 * feed and the physical module decode identically. frame_type 7 device GNSS
 * heartbeats (no serial_number) are intentionally ignored.
 */
export class RidDecoder {
  private readonly logger = new Logger(RidDecoder.name);

  decodeLine(line: string): RidReport | null {
    return this.decodeLineWithStatus(line).drone;
  }

  /** Same parsing as decodeLine, but also reports why a line was skipped. */
  decodeLineWithStatus(line: string): {
    drone: RidReport | null;
    /** 'empty' | 'non_json' | 'non_drone' | 'no_serial' | 'ok' */
    status: string;
  } {
    const raw = line.trim();
    if (!raw) return { drone: null, status: 'empty' };

    let parsed: RidFrameEnvelope;
    try {
      parsed = JSON.parse(raw) as RidFrameEnvelope;
    } catch {
      this.logger.debug('Ignoring non-JSON RID line');
      return { drone: null, status: 'non_json' };
    }

    const info = (parsed?.frame_info ?? parsed) as Partial<RidReport> &
      Record<string, unknown>;
    if (!info || typeof info !== 'object') {
      return { drone: null, status: 'non_json' };
    }

    // Ignore non-drone frames such as the device GNSS heartbeat (frame_type 7).
    if (parsed.frame_type !== undefined && parsed.frame_type !== 3) {
      return { drone: null, status: 'non_drone' };
    }

    const serial = str(pick(info, 'serial_number', 'uav_sn'));
    if (!serial) return { drone: null, status: 'no_serial' };

    return {
      drone: {
        serial_number: serial,
        longitude: num(pick(info, 'longitude', 'uav_lon')),
        latitude: num(pick(info, 'latitude', 'uav_lat')),
        height: num(pick(info, 'height', 'uav_height')),
        altitude: num(info.altitude),
        v_hor: num(pick(info, 'v_hor', 'uav_v_hor')),
        v_up: num(info.v_up),
        app_lat: num(info.app_lat),
        app_lon: num(info.app_lon),
        app_alt: num(info.app_alt),
        app_type: num(info.app_type),
        uav_type: str(info.uav_type),
        reg_code: str(info.reg_code),
        angle: num(info.angle),
        status: num(info.status),
        sys_type: num(info.sys_type),
        weight: num(info.weight),
        has_allowlist: bool(info.has_allowlist),
      },
      status: 'ok',
    };
  }
}
