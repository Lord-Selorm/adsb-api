import { Injectable, Logger } from '@nestjs/common';
import { BufferReader } from './buffer-reader.js';

/** 24-bit parity table for Mode S messages (dump1090 / pyModeS algorithm,
 *  polynomial 0xFF409). Entry j is the parity contribution of bit j. */
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

export type ModeSMessage = Buffer & { __msgbits: 56 | 112 };

export interface DecodedMessage {
  /** Downlink format (17 = ADS-B extended squitter). */
  df: number;
  /** ICAO 24-bit address as lower-case hex. */
  icao: string;
  crcOk: boolean;
  rawHex: string;
  bits: 56 | 112;
  receivedAt: number;
  /** Extended squitter type code (DF17 only). */
  metype?: number;
  callsign?: string;
  /** Barometric altitude in feet. */
  altitude?: number;
  altitudeSource?: 'AC13' | 'AC12' | 'surface';
  airbornePosition?: AirbornePosition;
  velocity?: {
    speed: number;
    heading: number;
      speedType: 'AS' | 'GS' | 'GT';
    verticalRate: number;
    vertRateSource: 'GNSS' | 'BARO';
  };
  squawk?: string;
  onGround?: boolean;
}

export interface AirbornePosition {
  odd: boolean;
  timeFlag: boolean;
  cprLat: number;
  cprLon: number;
  /** Q-encoded barometric altitude in feet (AC12/MEP). */
  altitude?: number;
}

export const AIS_CHARSET =
  '?ABCDEFGHIJKLMNOPQRSTUVWXYZ????? ???????????????0123456789??????';

@Injectable()
export class ModeSDecoder {
  private readonly logger = new Logger(ModeSDecoder.name);
  private malformedCount = 0;

  /** Return the number of malformed messages seen since startup */
  public getMalformedCount(): number {
    return this.malformedCount;
  }

  /**
   * Decode a Mode S message. `msgbits` selects 112-bit (DF17 squitter) or
   * 56-bit (DF0/4/5/11/16/20/21). For 56-bit messages the caller provides a
   * 14-byte buffer with the 7 payload bytes right-aligned at [7..14).
   */
  decode(frame: Buffer, msgbits: 56 | 112 = 112, receivedAt = Date.now()): DecodedMessage | null {
    if (frame.length !== 14) return null;
    try {
      const base = msgbits === 56 ? 56 : 0;
      const r = new BufferReader(frame, base);

      const df = r.readBits(0, 5);
      const icao = r.readBits(8, 24).toString(16).padStart(6, '0');
      const crcOk = this.crcOk(frame, msgbits);
      const out: DecodedMessage = {
        df,
        icao,
        crcOk,
        rawHex: msgbits === 56 ? frame.subarray(7).toString('hex') : frame.toString('hex'),
        bits: msgbits,
        receivedAt,
      };

      if (df !== 17) {
        if (msgbits === 112) {
          if (df === 0 || df === 4 || df === 16 || df === 20) {
            const qBit = (frame[3] & 0x10) !== 0;
            const mBit = (frame[3] & 0x40) !== 0;
            if (qBit && !mBit) {
              const n =
                ((frame[2] & 31) << 6) |
                ((frame[3] & 0x80) >> 2) |
                ((frame[3] & 0x20) >> 1) |
                (frame[3] & 15);
              out.altitude = Math.round(n * 25) - 1000;
              out.altitudeSource = 'AC13';
            }
          }
          if (df === 4 || df === 5 || df === 20 || df === 21) {
            const a = ((frame[3] & 0x80) >> 5) | (frame[2] & 0x02) | ((frame[2] & 0x08) >> 3);
            const b = ((frame[3] & 0x02) << 1) | ((frame[3] & 0x08) >> 2) | ((frame[3] & 0x20) >> 5);
            const c = ((frame[2] & 0x01) << 2) | ((frame[2] & 0x04) >> 1) | ((frame[2] & 0x10) >> 4);
            const d = ((frame[3] & 0x01) << 2) | ((frame[3] & 0x04) >> 1) | ((frame[3] & 0x10) >> 4);
            out.squawk = String(a * 1000 + b * 100 + c * 10 + d).padStart(4, '0');
          }
        }
        return out;
      }

      const metype = r.readBits(32, 5);
      out.metype = metype;

      if (metype >= 1 && metype <= 4) {
        out.callsign = this.decodeCallsign(r);
      } else if (metype >= 5 && metype <= 8) {
        out.onGround = true;
        out.altitude = 0;
        out.altitudeSource = 'surface';
        out.airbornePosition = this.decodeAirbornePosition(r);
      } else if (metype >= 9 && metype <= 18) {
        const pos = this.decodeAirbornePosition(r);
        out.airbornePosition = pos;
        if (pos.altitude !== undefined) out.altitude = pos.altitude;
        out.altitudeSource = 'AC12';
      } else if (metype === 19) {
        out.velocity = this.decodeVelocity(r);
      } else if (metype >= 20 && metype <= 22) {
        out.airbornePosition = this.decodeAirbornePosition(r);
      }
      return out;
    } catch (err) {
      this.malformedCount++;
      this.logger.warn(`Malformed Mode‑S message: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * CRC24 over a message. Table entries beyond index 87 are zero (and the
   * parity field starts at bit 88 / bit 32 in the 56-bit case), so the result
   * is the parity computed over the data bits — validated bit-for-bit against
   * pyModeS for both 112-bit squitters and 56-bit replies.
   */
  crc24(frame: Uint8Array, msgbits: 56 | 112 = 112): number {
    let crc = 0;
    const bits = msgbits - 24; // data bits only; the parity field carries the rest
    const startByte = msgbits === 56 ? 7 : 0;
    for (let j = 0; j < bits; j++) {
      const byte = startByte + (j >> 3);
      if (frame[byte] & (1 << (7 - (j & 7)))) {
        crc ^= CHECKSUM_TABLE[j];
      }
    }
    return crc;
  }

  crcOk(frame: Uint8Array, msgbits: 56 | 112 = 112): boolean {
    const crc = this.crc24(frame, msgbits);
    const stored =
      msgbits === 56
        ? (frame[11] << 16) | (frame[12] << 8) | frame[13]
        : (frame[11] << 16) | (frame[12] << 8) | frame[13];
    return crc === stored;
  }

  decodeCallsign(r: BufferReader): string | undefined {
    const cs: string[] = [];
    for (let c = 0; c < 8; c++) {
      const idx = r.readBits(40 + c * 6, 6);
      cs.push(AIS_CHARSET[idx] ?? '?');
    }
    const raw = cs.join('');
    return raw.trim() || undefined;
  }

  /**
   * Airborne/surface position. Altitude field = frame bits 40..51 where
   * bit47 is the Q bit and N = bits 40..46 + bits 48..51 (pyModeS AC12 layout);
   * T@52, CPR parity flag F@53, lat@54..70, lon@71..87.
   */
  decodeAirbornePosition(r: BufferReader): AirbornePosition {
    const qBit = r.readBits(47, 1) === 1;
    return {
      odd: r.readBits(53, 1) === 1,
      timeFlag: r.readBits(52, 1) === 1,
      cprLat: r.readBits(54, 17),
      cprLon: r.readBits(71, 17),
      ...(qBit
        ? { altitude: Math.round(((r.readBits(40, 7) << 4) | r.readBits(48, 4)) * 25) - 1000 }
        : {}),
    };
  }

  /**
   * Velocity (TC=19). Bit indices are ME-relative matching the pyModeS
   * reference decoder (speed_heading).
   */
  decodeVelocity(r: BufferReader): DecodedMessage['velocity'] {
    const subtype = r.readBits(37, 3);
    const mebit = (me: number, len: number) => r.readBits(32 + me, len);

    let speed: number | null = null;
    let heading: number | null = null;
    let speedType: 'GS' | 'AS' | 'GT' = 'GS';

    if (subtype === 1 || subtype === 2) {
      const vEw = mebit(14, 10);
      const vNs = mebit(25, 10);
      if (vEw !== 0 && vNs !== 0) {
        const ewSign = mebit(13, 1) === 1 ? -1 : 1;
        const nsSign = mebit(24, 1) === 1 ? -1 : 1;
        let ew = vEw - 1;
        let ns = vNs - 1;
        if (subtype === 2) {
          ew *= 4;
          ns *= 4;
        }
        const vWe = ewSign * ew;
        const vSn = nsSign * ns;
        speed = Math.trunc(Math.sqrt(vSn * vSn + vWe * vWe));
        let trk = (Math.atan2(vWe, vSn) * 180) / Math.PI;
        if (trk < 0) trk += 360;
        heading = trk;
      }
      speedType = 'GS';
    } else {
      heading = mebit(13, 1) === 1 ? (mebit(14, 10) / 1024) * 360 : null;
      const rawSpd = mebit(25, 10);
      let spd = rawSpd === 0 ? null : rawSpd - 1;
      if (subtype === 4 && spd !== null) spd *= 4;
      speed = spd;
      speedType = mebit(24, 1) === 0 ? 'AS' : 'GT';
    }

    const vertRateSource: 'GNSS' | 'BARO' = mebit(35, 1) === 0 ? 'GNSS' : 'BARO';
    const vrSign = mebit(36, 1) === 1 ? -1 : 1;
    const vr = mebit(37, 9);
    const verticalRate = vr === 0 ? 0 : Math.trunc(vrSign * (vr - 1) * 64);

    return {
      speed: speed ?? 0,
      heading: heading ?? 0,
      speedType,
      verticalRate,
      vertRateSource,
    };
  }
}