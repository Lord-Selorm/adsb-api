import { Logger } from '@nestjs/common';
import type {
  AisPositionReport,
  AisStaticDataReport,
  DecodedAisMessage,
} from './ais.types.js';

export const NAV_STATUS_MAP: Record<number, string> = {
  0: 'Under way using engine',
  1: 'At anchor',
  2: 'Not under command',
  3: 'Restricted manoeuverability',
  4: 'Constrained by her draught',
  5: 'Moored',
  6: 'Aground',
  7: 'Engaged in Fishing',
  8: 'Under way sailing',
  14: 'AIS-SART active',
  15: 'Undefined',
};

export const SHIP_TYPE_MAP: Record<number, string> = {
  30: 'Fishing',
  31: 'Towing',
  32: 'Towing: length exceeds 200m',
  33: 'Dredging or underwater ops',
  34: 'Diving ops',
  35: 'Military ops',
  36: 'Sailing',
  37: 'Pleasure Craft',
  50: 'Pilot Vessel',
  51: 'Search and Rescue vessel',
  52: 'Tug',
  53: 'Port Tender',
  55: 'Law Enforcement',
  60: 'Passenger',
  70: 'Cargo',
  80: 'Tanker',
  90: 'Other',
};

/**
 * Decodes NMEA 0183 AIVDM / AIVDO sentences (ITU-R M.1371) or JSON lines
 * into typed AIS position and static voyage reports.
 */
export class AisDecoder {
  private readonly logger = new Logger(AisDecoder.name);
  private multiSentenceBuffer: Map<string, string[]> = new Map();

  decodeLine(line: string): DecodedAisMessage | null {
    const raw = line.trim();
    if (!raw) return null;

    // Direct JSON format support
    if (raw.startsWith('{')) {
      try {
        const obj = JSON.parse(raw) as Record<string, unknown>;
        if (obj && typeof obj === 'object' && obj.mmsi) {
          return obj as unknown as DecodedAisMessage;
        }
      } catch {
        // Not JSON, continue to NMEA parser
      }
    }

    // Standard NMEA !AIVDM or !AIVDO sentence
    if (raw.startsWith('!') || raw.startsWith('$')) {
      return this.decodeNmea(raw);
    }

    return null;
  }

  private decodeNmea(sentence: string): DecodedAisMessage | null {
    // Strip checksum if present (e.g. *7A)
    const asteriskIdx = sentence.indexOf('*');
    const clean = asteriskIdx > 0 ? sentence.substring(0, asteriskIdx) : sentence;
    const parts = clean.split(',');

    if (parts.length < 6) return null;

    const totalSentences = Number(parts[1]);
    const sentenceNum = Number(parts[2]);
    const seqId = parts[3];
    const payload = parts[5];

    if (!payload) return null;

    let fullPayload = payload;

    if (totalSentences > 1) {
      const key = `${parts[0]}_${seqId}_${totalSentences}`;
      const fragments = this.multiSentenceBuffer.get(key) ?? [];
      fragments[sentenceNum - 1] = payload;
      this.multiSentenceBuffer.set(key, fragments);

      if (fragments.length === totalSentences && !fragments.includes(undefined!)) {
        fullPayload = fragments.join('');
        this.multiSentenceBuffer.delete(key);
      } else {
        return null; // Awaiting more fragments
      }
    }

    const bits = this.payloadToBitString(fullPayload);
    if (bits.length < 38) return null;

    const msgType = this.extractUint(bits, 0, 6);
    const mmsi = String(this.extractUint(bits, 8, 30));

    switch (msgType) {
      case 1:
      case 2:
      case 3:
        return this.decodeType123(bits, msgType as 1 | 2 | 3, mmsi);
      case 18:
        return this.decodeType18(bits, mmsi);
      case 5:
        return this.decodeType5(bits, mmsi);
      default:
        return null;
    }
  }

  private decodeType123(
    bits: string,
    type: 1 | 2 | 3,
    mmsi: string,
  ): AisPositionReport | null {
    if (bits.length < 137) return null;

    const navStatus = this.extractUint(bits, 38, 4);
    const rawSog = this.extractUint(bits, 50, 10);
    const sog = rawSog === 1023 ? undefined : rawSog / 10;

    const rawLon = this.extractInt(bits, 61, 28);
    const lon = rawLon === 181 * 600000 ? undefined : rawLon / 600000;

    const rawLat = this.extractInt(bits, 89, 27);
    const lat = rawLat === 91 * 600000 ? undefined : rawLat / 600000;

    const rawCog = this.extractUint(bits, 116, 12);
    const cog = rawCog === 3600 ? undefined : rawCog / 10;

    const rawHeading = this.extractUint(bits, 128, 9);
    const heading = rawHeading === 511 ? undefined : rawHeading;

    return {
      type,
      mmsi,
      navStatus,
      sog,
      longitude: lon,
      latitude: lat,
      cog,
      heading,
    };
  }

  private decodeType18(bits: string, mmsi: string): AisPositionReport | null {
    if (bits.length < 133) return null;

    const rawSog = this.extractUint(bits, 46, 10);
    const sog = rawSog === 1023 ? undefined : rawSog / 10;

    const rawLon = this.extractInt(bits, 57, 28);
    const lon = rawLon === 181 * 600000 ? undefined : rawLon / 600000;

    const rawLat = this.extractInt(bits, 85, 27);
    const lat = rawLat === 91 * 600000 ? undefined : rawLat / 600000;

    const rawCog = this.extractUint(bits, 112, 12);
    const cog = rawCog === 3600 ? undefined : rawCog / 10;

    const rawHeading = this.extractUint(bits, 124, 9);
    const heading = rawHeading === 511 ? undefined : rawHeading;

    return {
      type: 18,
      mmsi,
      sog,
      longitude: lon,
      latitude: lat,
      cog,
      heading,
    };
  }

  private decodeType5(bits: string, mmsi: string): AisStaticDataReport | null {
    if (bits.length < 420) return null;

    const callsign = this.extractString(bits, 70, 42);
    const name = this.extractString(bits, 112, 120);
    const shipType = this.extractUint(bits, 232, 8);

    const toBow = this.extractUint(bits, 240, 9);
    const toStern = this.extractUint(bits, 249, 9);
    const toPort = this.extractUint(bits, 258, 6);
    const toStarboard = this.extractUint(bits, 264, 6);

    const length = toBow + toStern;
    const width = toPort + toStarboard;

    const rawDraft = this.extractUint(bits, 294, 8);
    const draft = rawDraft === 0 ? undefined : rawDraft / 10;

    const destination = this.extractString(bits, 302, 120);

    return {
      type: 5,
      mmsi,
      name,
      callsign,
      shipType,
      destination,
      draft,
      length: length > 0 ? length : undefined,
      width: width > 0 ? width : undefined,
    };
  }

  private payloadToBitString(payload: string): string {
    let bits = '';
    for (let i = 0; i < payload.length; i++) {
      let code = payload.charCodeAt(i) - 48;
      if (code > 40) code -= 8;
      code &= 0x3f;
      bits += code.toString(2).padStart(6, '0');
    }
    return bits;
  }

  private extractUint(bits: string, start: number, len: number): number {
    return parseInt(bits.substring(start, start + len), 2);
  }

  private extractInt(bits: string, start: number, len: number): number {
    const slice = bits.substring(start, start + len);
    let val = parseInt(slice, 2);
    if (slice[0] === '1') {
      val -= Math.pow(2, len);
    }
    return val;
  }

  private extractString(bits: string, start: number, len: number): string {
    let result = '';
    for (let i = start; i < start + len; i += 6) {
      const code = parseInt(bits.substring(i, i + 6), 2);
      if (code === 0) continue; // @ padding
      if (code >= 1 && code <= 31) {
        result += String.fromCharCode(64 + code);
      } else if (code >= 32 && code <= 63) {
        result += String.fromCharCode(code);
      }
    }
    return result.replace(/@+$/, '').trim();
  }
}
