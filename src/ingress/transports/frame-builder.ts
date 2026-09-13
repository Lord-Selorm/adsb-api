import { AIS_CHARSET } from '../../decode/mode-s.decoder.js';
import { cprNL } from '../../decode/cpr.js';
import { crc24 } from '../../decode/checksum.js';

/**
 * Encodes DF17 frames with a valid CRC24 (backstop-field) so the mock feed is
 * indistinguishable from real device output once parsed.
 *
 * Bit indices are absolute within the 112-bit frame and mirror
 * ModeSDecoder.decode(): DF/CA@0..7, ICAO@8..31, ME@32..87, CRC@88..111.
 */

function setRange(
  bits: number[],
  start: number,
  len: number,
  value: number,
): void {
  for (let i = 0; i < len; i++) {
    bits[start + i] = (value >>> (len - 1 - i)) & 1;
  }
}

function newFrame(icao: number): number[] {
  const bits: number[] = Array.from({ length: 88 }, () => 0);
  setRange(bits, 0, 5, 17); // DF
  setRange(bits, 5, 3, 0); // CA
  setRange(bits, 8, 24, icao);
  return bits;
}

function finalize(bits88: number[]): Buffer {
  const crc = crc24([...bits88, ...Array.from({ length: 24 }, () => 0)]);
  const bits = [...bits88];
  for (let i = 0; i < 24; i++) bits.push((crc >>> (23 - i)) & 1);
  const buf = Buffer.alloc(14);
  for (let b = 0; b < 14; b++) {
    let v = 0;
    for (let i = 0; i < 8; i++) v = (v << 1) | (bits[b * 8 + i] ?? 0);
    buf[b] = v;
  }
  return buf;
}

export interface PositionFrameSpec {
  icao: number;
  lat: number;
  lon: number;
  altitudeFt: number;
  odd: boolean;
  onGround?: boolean;
}

/** Build an airborne (TC 9-18) / surface (TC 5-8) position frame. */
export function buildPositionFrame(spec: PositionFrameSpec): Buffer {
  const bits = newFrame(spec.icao);
  const tc = spec.onGround ? 5 : 12;
  setRange(bits, 32, 5, tc);
  if (!spec.onGround) {
    const n = Math.round((spec.altitudeFt + 1000) / 25);
    // Altitude field: [N][Q][N] with Q bit at frame bit 47, N = bits 40..47 + 48..51.
    bits[47] = 1; // Q bit
    setRange(bits, 40, 7, (n & 0x7ff) >> 4);
    setRange(bits, 48, 4, n & 0xf);
  }
  bits[53] = spec.odd ? 1 : 0; // CPR odd/even flag
  const c = cprEncode(spec.lat, spec.lon, spec.odd);
  setRange(bits, 54, 17, c.lat);
  setRange(bits, 71, 17, c.lon);
  if (spec.onGround) {
    setRange(bits, 37, 2, 0b11); // surface: movement / status bits
  }
  return finalize(bits);
}

export function cprEncode(
  lat: number,
  lon: number,
  odd: boolean,
): { lat: number; lon: number } {
  const zones = odd ? 59 : 60;
  const dLat = 360 / zones;
  const latCpr = Math.floor((mod(lat, dLat) / dLat) * 131072) % 131072;
  const nlz = odd ? Math.max(cprNL(lat) - 1, 1) : cprNL(lat);
  const dLon = 360 / nlz;
  const lonCpr = Math.floor((mod(lon, dLon) / dLon) * 131072) % 131072;
  return { lat: latCpr, lon: lonCpr };
}

const mod = (a: number, b: number) => ((a % b) + b) % b;

/** Build a TC 1-4 identification frame (8-char callsign). */
export function buildIdentityFrame(icao: number, callsign: string): Buffer {
  const bits = newFrame(icao);
  setRange(bits, 32, 5, 4); // TC 4 (airline callsign)
  setRange(bits, 37, 3, 0);
  const padded = callsign.padEnd(8, ' ').slice(0, 8);
  for (let c = 0; c < 8; c++) {
    const idx = AIS_CHARSET.indexOf(padded[c]);
    setRange(bits, 40 + c * 6, 6, idx < 0 ? 32 : idx);
  }
  return finalize(bits);
}

export interface VelocityFrameSpec {
  icao: number;
  speedKt: number;
  trackDeg: number;
  verticalRateFpm: number;
}

/**
 * Build a TC=19 subtype-1 (ground speed, subsonic) velocity frame.
 * Field layout mirrors ModeSDecoder.decodeVelocity (pyModeS indices).
 */
export function buildVelocityFrame(spec: VelocityFrameSpec): Buffer {
  const bits = newFrame(spec.icao);
  setRange(bits, 32, 5, 19); // TC 19
  setRange(bits, 37, 3, 1); // subtype 1

  const ns = spec.speedKt * Math.cos((spec.trackDeg * Math.PI) / 180);
  const ew = spec.speedKt * Math.sin((spec.trackDeg * Math.PI) / 180);

  bits[45] = ew < 0 ? 1 : 0; // EW sign (1 = west)
  setRange(bits, 46, 10, Math.round(Math.abs(ew)) + 1);
  bits[56] = ns < 0 ? 1 : 0; // NS sign (1 = south)
  setRange(bits, 57, 10, Math.round(Math.abs(ns)) + 1);

  bits[68] = spec.verticalRateFpm < 0 ? 1 : 0; // VR sign (1 = descending)
  setRange(bits, 69, 9, Math.round(Math.abs(spec.verticalRateFpm) / 64) + 1);
  return finalize(bits);
}

/** Serialize a 112-bit frame as an AVR line: "*HEX;\r\n". */
export function toAvrLine(frame: Buffer): string {
  return `*${frame.toString('hex').toUpperCase()};\r\n`;
}
