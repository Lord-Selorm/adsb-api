import { Injectable, Logger } from '@nestjs/common';
import { BufferReader } from './buffer-reader.js';
import { CHECKSUM_TABLE } from './checksum.js';

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
  decode(
    frame: Buffer,
    msgbits: 56 | 112 = 112,
    receivedAt = Date.now(),
  ): DecodedMessage | null {
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
        rawHex:
          msgbits === 56
            ? frame.subarray(7).toString('hex')
            : frame.toString('hex'),
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
            const a =
              ((frame[3] & 0x80) >> 5) |
              (frame[2] & 0x02) |
              ((frame[2] & 0x08) >> 3);
            const b =
              ((frame[3] & 0x02) << 1) |
              ((frame[3] & 0x08) >> 2) |
              ((frame[3] & 0x20) >> 5);
            const c =
              ((frame[2] & 0x01) << 2) |
              ((frame[2] & 0x04) >> 1) |
              ((frame[2] & 0x10) >> 4);
            const d =
              ((frame[3] & 0x01) << 2) |
              ((frame[3] & 0x04) >> 1) |
              ((frame[3] & 0x10) >> 4);
            out.squawk = String(a * 1000 + b * 100 + c * 10 + d).padStart(
              4,
              '0',
            );
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
    const stored = (frame[11] << 16) | (frame[12] << 8) | frame[13];
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
        ? {
            altitude:
              Math.round(((r.readBits(40, 7) << 4) | r.readBits(48, 4)) * 25) -
              1000,
          }
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

    const vertRateSource: 'GNSS' | 'BARO' =
      mebit(35, 1) === 0 ? 'GNSS' : 'BARO';
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
