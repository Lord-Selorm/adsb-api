import { Logger } from '@nestjs/common';
import type { RidReport } from './drone-rid-store.service.js';

/** URM-01/02 protocol frame envelope: { "frame_type": 3, "frame_info": { ... } }. */
export interface RidFrameEnvelope {
  frame_type?: number;
  frame_info?: Partial<RidReport>;
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

/**
 * Parses URM Drone Remote ID reports (JSON lines) into DroneRidState.
 * Accepts either the protocol envelope ({ frame_type, frame_info }) or a
 * bare drone object, so the mock and future serial/TCP feeds share one parser.
 */
export class RidDecoder {
  private readonly logger = new Logger(RidDecoder.name);

  decodeLine(line: string): RidReport | null {
    const raw = line.trim();
    if (!raw) return null;

    let parsed: RidFrameEnvelope;
    try {
      parsed = JSON.parse(raw) as RidFrameEnvelope;
    } catch {
      this.logger.debug('Ignoring non-JSON RID line');
      return null;
    }

    const info = (parsed?.frame_info ?? parsed) as Partial<RidReport>;
    if (!info || typeof info !== 'object') return null;

    const serial = str(info.serial_number);
    if (!serial) return null;

    return {
      serial_number: serial,
      longitude: num(info.longitude),
      latitude: num(info.latitude),
      height: num(info.height),
      altitude: num(info.altitude),
      v_hor: num(info.v_hor),
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
    };
  }
}
