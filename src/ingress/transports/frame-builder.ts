import { AIS_CHARSET } from '../../decode/mode-s.decoder.js';
import { cprNL } from '../../decode/cpr.js';

/**
 * Encodes DF17 frames with a valid CRC24 (backstop-field) so the mock feed is
 * indistinguishable from real device output once parsed.
 *
 * Bit indices are absolute within the 112-bit frame and mirror
 * ModeSDecoder.decode(): DF/CA@0..7, ICAO@8..31, ME@32..87, CRC@88..111.
 */

const CHECKSUM_TABLE: readonly number[] = [
  0x3935ea, 0x1c9af5, 0xf1b77e, 0x78dbbf, 0xc397db, 0x9e31e9, 0xb0e2f0, 0x587178,
  0x2c38bc, 0x161c5e, 0x0b0e2f, 0xfa7d13, 0x82c48d, 0xbe9842, 0x5f4c21, 0xd05c14,
  0x682e0a, 0x341705, 0xe5f186, 0x72f8c3, 0xc68665, 0x9cb936, 0x4e5c9b, 0xd8d449,
  0x939020, 0x49c810, 0x24e408, 0x127204, 0x093902, 0x049c81, 0xfdb444, 0x7eda22,
  0x3f6d11, 0xe04c8c, 0x702646, 0x381323, 0xe3f395, 0x8e03ce, 0x4701e7, 0xdc7af7,
  0x91c77f, 0xb719bb, 0xa476d9, 0xadc168, 0x56e0b4, 0x2b705a, 0x15b82d, 0xf52612,
  0x7a9309, 0xc2b380, 0x6159c0, 0x30ace0, 0x185670, 0x0c2b38, 0x06159c, 0x030ace,
  0x018567, 0xff38b7, 0x80665f, 0xbfc92b, 0xa01e91, 0xaff54c, 0x57faa6, 0x2bfd53,
  0xea04ad, 0x8af852, 0x457c29, 0xdd4410, 0x6ea208, 0x375104, 0x1ba882, 0x0dd441,
  0xf91024, 0x7c8812, 0x3e4409, 0xe0d800, 0x706c00, 0x383600, 0x1c1b00, 0x0e0d80,
  0x0706c0, 0x038360, 0x01c1b0, 0x00e0d8, 0x00706c, 0x003836, 0x001c1b, 0xfff409,
  0x000000, 0x000000, 0x000000, 0x000000, 0x000000, 0x000000, 0x000000, 0x000000,
  0x000000, 0x000000, 0x000000, 0x000000, 0x000000, 0x000000, 0x000000, 0x000000,
  0x000000, 0x000000, 0x000000, 0x000000, 0x000000, 0x000000, 0x000000, 0x000000,
];

function crc24(bits: number[]): number {
  let crc = 0;
  for (let j = 0; j < 112; j++) {
    if (bits[j]) crc ^= CHECKSUM_TABLE[j];
  }
  return crc;
}

function setRange(bits: number[], start: number, len: number, value: number): void {
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