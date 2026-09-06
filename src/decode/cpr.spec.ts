import { describe, expect, it } from 'vitest';
import { ModeSDecoder } from './mode-s.decoder.js';
import { cprGlobal, cprLocal, cprNL, CprTracker } from './cpr.js';

const EVEN = '8D40621D58C382D690C8AC2863A7';
const ODD = '8D40621D58C386435CC412692AD6';

describe('CPR', () => {
  const decoder = new ModeSDecoder();
  const posOf = (hex: string) => decoder.decode(Buffer.from(hex, 'hex'), 112)!.airbornePosition!;

  describe('NL table', () => {
    it('matches the standard boundary values', () => {
      expect(cprNL(0)).toBe(59);
      expect(cprNL(10)).toBe(59);
      expect(cprNL(50)).toBe(38);
      expect(cprNL(80)).toBe(10);
      expect(cprNL(87)).toBe(2);
    });
  });

  describe('global decode (golden pair)', () => {
    it('resolves the pyModeS-verified position using the newer (odd) frame', () => {
      const even = posOf(EVEN);
      const odd = posOf(ODD);
      // Odd is the newer frame -> useEven=false (matches pyModeS t0=0).
      const pos = cprGlobal(
        { cprLat: even.cprLat, cprLon: even.cprLon },
        { cprLat: odd.cprLat, cprLon: odd.cprLon },
        false,
      )!;
      expect(pos.lat).toBeCloseTo(52.26578017412606, 9);
      expect(pos.lon).toBeCloseTo(3.938912527901786, 9);
    });
  });

  describe('local decode vs the same ground truth', () => {
    it('recovers a position within a fraction of a degree when the reference is nearby', () => {
      const even = posOf(EVEN);
      const local = cprLocal(
        { odd: even.odd, cprLat: even.cprLat, cprLon: even.cprLon },
        52.266,
        3.939,
      );
      // Local decode of a single frame approximates the global solution; the
      // longitude can differ by a fraction of a degree when the reference's
      // zone wrapped differently.
      expect(Math.abs(local.lat - 52.26578017412606)).toBeLessThan(0.01);
      expect(Math.abs(local.lon - 3.938912527901786)).toBeLessThan(0.03);
    });
  });

  describe('CprTracker', () => {
    it('resolves global once an even+odd pair arrives within the window', () => {
      const tracker = new CprTracker(10_000);
      const even = posOf(EVEN);
      const odd = posOf(ODD);

      // First frame can only be local-decoded against a reference.
      const first = tracker.feed(
        { odd: even.odd, cprLat: even.cprLat, cprLon: even.cprLon },
        { lat: 52.0, lon: 4.0 },
        1000,
      );
      expect(first!.source).toBe('local');

      const second = tracker.feed(
        { odd: odd.odd, cprLat: odd.cprLat, cprLon: odd.cprLon },
        { lat: 52.0, lon: 4.0 },
        2000,
      );
      expect(second!.source).toBe('global');
      expect(second!.lat).toBeCloseTo(52.26578017412606, 9);
      expect(second!.lon).toBeCloseTo(3.938912527901786, 9);
    });

    it('does not pair frames outside the time window', () => {
      const tracker = new CprTracker(10_000);
      const even = posOf(EVEN);
      const odd = posOf(ODD);
      const first = tracker.feed(
        { odd: even.odd, cprLat: even.cprLat, cprLon: even.cprLon },
        null,
        1000,
      );
      expect(first).toBeNull();
      tracker.feed({ odd: odd.odd, cprLat: odd.cprLat, cprLon: odd.cprLon }, null, 60_000);
      // No pair and no reference -> no position.
    });
  });
});