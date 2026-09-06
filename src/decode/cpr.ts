/** A decoded position, tagged with how it was resolved. */
export interface ResolvedPosition {
  lat: number;
  lon: number;
  source: 'global' | 'local';
  frameParity: 'even' | 'odd';
  at: number;
}

/** Number of longitude zones (NL) per latitude (1090-WP-9-14, dump1090 table). */
const NL_THRESHOLDS: ReadonlyArray<[number, number]> = [
  [10.4704713, 59],
  [14.82817437, 58],
  [18.18626357, 57],
  [21.02939493, 56],
  [23.54504487, 55],
  [25.82924707, 54],
  [27.9389871, 53],
  [29.91135686, 52],
  [31.77209708, 51],
  [33.53993436, 50],
  [35.22899598, 49],
  [36.85025108, 48],
  [38.41241892, 47],
  [39.92256684, 46],
  [41.38651832, 45],
  [42.80914012, 44],
  [44.19454951, 43],
  [45.54626723, 42],
  [46.86733252, 41],
  [48.16039128, 40],
  [49.42776439, 39],
  [50.67150166, 38],
  [51.89342469, 37],
  [53.09516153, 36],
  [54.27817472, 35],
  [55.44378444, 34],
  [56.59318756, 33],
  [57.72747354, 32],
  [58.84763776, 31],
  [59.95459277, 30],
  [61.04917774, 29],
  [62.13216659, 28],
  [63.20427479, 27],
  [64.26616523, 26],
  [65.3184531, 25],
  [66.36171008, 24],
  [67.39646774, 23],
  [68.42322022, 22],
  [69.44242631, 21],
  [70.45451075, 20],
  [71.45986473, 19],
  [72.45884545, 18],
  [73.45177442, 17],
  [74.43893416, 16],
  [75.42056257, 15],
  [76.39684391, 14],
  [77.36789461, 13],
  [78.33374083, 12],
  [79.29428225, 11],
  [80.24923213, 10],
  [81.19801349, 9],
  [82.13956981, 8],
  [83.07199445, 7],
  [83.99173563, 6],
  [84.89166191, 5],
  [85.75541621, 4],
  [86.53536998, 3],
  [87.000, 2],
];

/**
 * Number of longitude zones for a latitude (CPR NL function).
 */
export function cprNL(lat: number): number {
  const a = lat % 360;
  const x = Math.abs(a) + (a < 0 ? 360 : 0);
  const absLat = x % 360;
  let index = 0;
  while (index < NL_THRESHOLDS.length - 1 && absLat >= NL_THRESHOLDS[index][0]) {
    index++;
  }
  return NL_THRESHOLDS[index][1];
}

const mod = (a: number, b: number) => ((a % b) + b) % b;

/** Global decoding from an even and an odd position frame. */
export function cprGlobal(
  even: { cprLat: number; cprLon: number },
  odd: { cprLat: number; cprLon: number },
  useEvenTimestamp: boolean,
): { lat: number; lon: number } | null {
  const dLatEven = 360 / 60;
  const dLatOdd = 360 / 59;

  const latEven = dLatEven * (mod(Math.floor(59 * (even.cprLat / 131072) - 60 * (odd.cprLat / 131072) + 0.5), 60) + even.cprLat / 131072);
  const latOdd = dLatOdd * (mod(Math.floor(59 * (even.cprLat / 131072) - 60 * (odd.cprLat / 131072) + 0.5), 59) + odd.cprLat / 131072);

  const latE = latEven >= 270 ? latEven - 360 : latEven;
  const latO = latOdd >= 270 ? latOdd - 360 : latOdd;

  if (cprNL(latE) !== cprNL(latO)) return null;

  const lat = useEvenTimestamp ? latE : latO;
  const nl = cprNL(lat);
  const ni = Math.max(nl - (useEvenTimestamp ? 0 : 1), 1);
  const m = Math.floor(
    (even.cprLon / 131072) * (nl - 1) - (odd.cprLon / 131072) * nl + 0.5,
  );
  const lon = (360 / ni) * (mod(m, ni) + (useEvenTimestamp ? even.cprLon : odd.cprLon) / 131072);
  return { lat, lon: lon > 180 ? lon - 360 : lon };
}

/**
 * Local decoding from a single position frame + a reference position
 * (previous resolved position or receiver location), valid within 180 NM.
 */
export function cprLocal(
  frame: { odd: boolean; cprLat: number; cprLon: number },
  refLat: number,
  refLon: number,
): { lat: number; lon: number } {
  const i = frame.odd ? 1 : 0;
  const dLat = i ? 360 / 59 : 360 / 60;
  const j = Math.floor(0.5 + refLat / dLat - frame.cprLat / 131072);
  const lat = dLat * (j + frame.cprLat / 131072);

  const ni = cprNL(lat) - i;
  const dLon = ni > 0 ? 360 / ni : 360;
  const m = Math.floor(0.5 + refLon / dLon - frame.cprLon / 131072);
  let lon = dLon * (m + frame.cprLon / 131072);
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return { lat, lon };
}

/** Per-aircraft CPR state machine, fed resolved positions. */
export class CprTracker {
  private even: { cprLat: number; cprLon: number; at: number } | null = null;
  private odd: { cprLat: number; cprLon: number; at: number } | null = null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(private readonly pairWindowMs = 10_000) {}

  /** Feed a raw position frame; returns a position if decodable (global or local). */
  feed(
    frame: { odd: boolean; cprLat: number; cprLon: number },
    ref: { lat: number; lon: number } | null,
    at: number,
  ): ResolvedPosition | null {
    if (frame.odd) this.odd = { cprLat: frame.cprLat, cprLon: frame.cprLon, at };
    else this.even = { cprLat: frame.cprLat, cprLon: frame.cprLon, at };

    const other = frame.odd ? this.even : this.odd;
    if (other && Math.abs(other.at - at) <= this.pairWindowMs) {
      // useEven == true when the even frame is the more recent of the pair,
      // matching pyModeS airborne_position(msg0=even, msg1=odd, t0, t1).
      const evenAt = frame.odd ? other.at : at;
      const oddAt = frame.odd ? at : other.at;
      const useEven = evenAt >= oddAt;
      const even = frame.odd
        ? { cprLat: other.cprLat, cprLon: other.cprLon }
        : { cprLat: frame.cprLat, cprLon: frame.cprLon };
      const odd = frame.odd
        ? { cprLat: frame.cprLat, cprLon: frame.cprLon }
        : { cprLat: other.cprLat, cprLon: other.cprLon };
      const pos = cprGlobal(even, odd, useEven);
      if (pos) {
        return {
          ...pos,
          source: 'global',
          frameParity: useEven ? 'even' : 'odd',
          at: Math.max(evenAt, oddAt),
        };
      }
    }

    // Local decode against a reference (last known position or receiver location).
    if (ref) {
      try {
        const pos = cprLocal(frame, ref.lat, ref.lon);
        return { ...pos, source: 'local', frameParity: frame.odd ? 'odd' : 'even', at };
      } catch {
        return null;
      }
    }
    return null;
  }
}