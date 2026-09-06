import { describe, expect, it } from 'vitest';
import { ModeSDecoder } from './mode-s.decoder.js';
import { BufferReader } from './buffer-reader.js';
import {
  buildIdentityFrame,
  buildPositionFrame,
  buildVelocityFrame,
} from '../ingress/transports/frame-builder.js';

describe('ModeSDecoder', () => {
  const decoder = new ModeSDecoder();

  // pyModeS-verified golden vectors (decoded with pyModeS 2.6.x).
  const EVEN = '8D40621D58C382D690C8AC2863A7';
  const ODD = '8D40621D58C386435CC412692AD6';
  const VEL = '8D485020994409940838175B284F';

  const frame = (hex: string) => Buffer.from(hex, 'hex');

  describe('CRC24', () => {
    it('validates the golden 112-bit frames CRC as OK', () => {
      for (const hex of [EVEN, ODD, VEL]) {
        expect(decoder.crcOk(frame(hex), 112)).toBe(true);
      }
    });

    it('rejects a corrupted frame', () => {
      const buf = frame(EVEN);
      buf[2] ^= 0x04; // flip one data bit
      expect(decoder.crcOk(buf, 112)).toBe(false);
    });

    it('validates a pyModeS-generated 56-bit reply frame', () => {
      // Data 52E6B438 + parity 586C63 computed by pyModeS crc(encode=True).
      const wire = Buffer.from('52E6B438586C63', 'hex');
      const padded = Buffer.alloc(14);
      wire.copy(padded, 7);
      expect(decoder.crcOk(padded, 56)).toBe(true);
    });
  });

  describe('callsign (TC 1-4)', () => {
    it('round-trips an identity frame', () => {
      const buf = buildIdentityFrame(0x4a0042, 'BAW1234');
      const msg = decoder.decode(buf, 112)!;
      expect(msg.metype).toBe(4);
      expect(msg.callsign).toBe('BAW1234');
      expect(msg.crcOk).toBe(true);
    });
  });

  describe('altitude (AC12 field)', () => {
    it('decodes the pyModeS-verified 38000 ft from the golden frames', () => {
      expect(decoder.decode(frame(EVEN), 112)!.airbornePosition!.altitude).toBe(38000);
      expect(decoder.decode(frame(ODD), 112)!.airbornePosition!.altitude).toBe(38000);
    });

    it('encode -> decode round-trip', () => {
      const buf = buildPositionFrame({
        icao: 0x4a0042,
        lat: 52.0,
        lon: 4.0,
        altitudeFt: 38000,
        odd: false,
      });
      const msg = decoder.decode(buf, 112)!;
      expect(msg.airbornePosition!.altitude).toBe(38000);
    });
  });

  describe('velocity (TC 19)', () => {
    it('matches the pyModeS golden vector (159 kt, 182.88°, -832 fpm)', () => {
      const msg = decoder.decode(frame(VEL), 112)!;
      expect(msg.metype).toBe(19);
      expect(msg.velocity!.speed).toBe(159);
      expect(msg.velocity!.heading).toBeCloseTo(182.8803775528476, 6);
      expect(msg.velocity!.verticalRate).toBe(-832);
    });

    it('encode -> decode round-trip', () => {
      const buf = buildVelocityFrame({
        icao: 0x4a0042,
        speedKt: 300,
        trackDeg: 90,
        verticalRateFpm: 640,
      });
      const msg = decoder.decode(buf, 112)!;
      expect(msg.metype).toBe(19);
      expect(msg.velocity!.speed).toBeGreaterThanOrEqual(299);
      expect(msg.velocity!.speed).toBeLessThanOrEqual(301);
      expect(msg.velocity!.heading).toBeCloseTo(90, 0);
      expect(msg.velocity!.verticalRate).toBe(640);
    });
  });

  describe('DF17 identification', () => {
    it('extracts DF and ICAO', () => {
      const msg = decoder.decode(frame(EVEN), 112)!;
      expect(msg.df).toBe(17);
      expect(msg.icao).toBe('40621d');
      expect(msg.bits).toBe(112);
    });
  });

  describe('BufferReader base shift', () => {
    it('maps the same wire bits at 56-bit vs 112-bit alignment', () => {
      const long = new BufferReader(frame(EVEN), 0);
      const short = new BufferReader(frame(EVEN), 56);
      // A 56-bit frame right-aligned in the 14-byte buffer starts at bit 56;
      // the 56-bit view's bit 0 is the 112-bit view's bit 56.
      expect(long.readBits(56, 5)).toBe(26);
      expect(short.readBits(0, 5)).toBe(long.readBits(56, 5));
      expect(short.readBits(0, 8)).toBe(long.readBits(56, 8));
    });
  });
});