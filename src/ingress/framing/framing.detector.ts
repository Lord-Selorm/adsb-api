import type { FramingMode, ParsedFrame } from './framing.types.js';
import { UnrecognizedFramingError } from './framing.types.js';

const MAX_LOOKAHEAD = 1024;

/**
 * Lenient, auto-detecting Mode S frame stream parser.
 *
 * Handles the three common wire formats:
 *  - Beast binary   (0x1a/0x1b/0x1c prefixed, optional 0x1e escape + 0x33 clock)
 *  - AVR ASCII      ("*8D40621D58C382D690C8AC2863A7;" or '@' variant)
 *  - Raw hex lines  ("8D40621D58C382D690C8AC2863A7\n")
 *
 * Unknown bytes (e.g. the ADSR-800 boot banner "JouleMore. Ltd Since2009") are
 * skipped while scanning for the first valid frame, then the detector locks
 * onto the format that matched — any feed that matches nothing raises the the
 * `UnrecognizedFramingError` instead of silently mis-parsing.
 */
export class FramingDetector {
  private buffer: Buffer;
  private mode: FramingMode | null = null;
  private unmatched = 0;
  private readonly onFrame: (frame: ParsedFrame) => void;
  private readonly onError: (err: Error) => void;

  constructor(
    onFrame: (frame: ParsedFrame) => void,
    onError?: (err: Error) => void,
  ) {
    this.onFrame = onFrame;
    this.onError = onError ?? (() => {});
    this.buffer = Buffer.alloc(0);
  }

  push(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length > 0) {
      // Feedback-free single-format loop once locked.
      if (this.mode === 'beast') {
        if (!this.consumeBeast()) return;
        continue;
      }
      if (this.mode === 'avr') {
        if (!this.consumeAvr()) return;
        continue;
      }
      if (this.mode === 'rawhex') {
        if (!this.consumeRawHex()) return;
        continue;
      }

      // Auto-detect from the head of the stream.
      const b = this.buffer[0];
      if (b === 0x1a || b === 0x1b || b === 0x1c || b === 0x1d || b === 0x1e) {
        this.mode = 'beast';
        continue;
      }
      if (b === 0x2a || b === 0x40) {
        // '*' or '@' -> AVR
        this.mode = 'avr';
        continue;
      }
      if (isHex(b)) {
        this.mode = 'rawhex';
        continue;
      }

      // Skip non-frame bytes (banner text, framing noise, CR/LF).
      this.buffer = this.buffer.subarray(1);
      this.unmatched++;
      if (this.unmatched > MAX_LOOKAHEAD) {
        this.fail();
      }
    }
  }

  private fail(): void {
    const dump = this.buffer.subarray(0, 128).toString('hex');
    const err = new UnrecognizedFramingError(dump);
    this.onError(err);
    throw err;
  }

  private consumeAvr(): boolean {
    const idx = this.buffer.indexOf(0x3b); // ';'
    const nl = this.buffer.indexOf(0x0a); // '\n'
    if (idx === -1 && nl === -1) {
      // Not enough data yet — but guard runaway garbage.
      if (this.buffer.length > 4096) this.fail();
      return false;
    }
    const end = idx !== -1 ? idx : nl;
    // Skip until a line start marker if bytes precede it.
    const start = this.buffer[0] === 0x2a || this.buffer[0] === 0x40 ? 1 : 0;
    const candidate = this.buffer.subarray(start, end);
    const hex = candidate.toString('ascii').replace(/[^0-9A-Fa-f]/g, '');
    if (hex.length === 28 || hex.length === 14) {
      this.emit(hex);
    }
    this.buffer = this.buffer.subarray(end + 1);
    this.unmatched = 0;
    return true;
  }

  private consumeRawHex(): boolean {
    const nl = this.buffer.indexOf(0x0a);
    if (nl === -1) {
      if (this.buffer.length > 4096) this.fail();
      return false;
    }
    // Trim possible '\r'
    let end = nl;
    if (end > 0 && this.buffer[end - 1] === 0x0d) end -= 1;
    const line = this.buffer.subarray(0, end);
    const hex = line.toString('ascii').replace(/[^0-9A-Fa-f]/g, '');

    if (hex.length === 28) {
      this.emit(hex, 'rawhex');
    } else if (hex.length !== 0) {
      this.unmatched++;
      if (this.unmatched > MAX_LOOKAHEAD) this.fail();
    }
    this.buffer = this.buffer.subarray(nl + 1);
    return true;
  }

  private consumeBeast(): boolean {
    let i = 0;

    while (this.buffer.length - i > 0) {
      const b = this.buffer[i];
      if (b === 0x1e) {
        // Escape byte: expect the following byte to decide what it was.
        if (this.buffer.length - i < 2) return false;
        i += 2;
        continue;
      }
      if (b === 0x1a || b === 0x1b || b === 0x1c || b === 0x1d) {
        const isShort = b === 0x1a || b === 0x1b;
        const header = b === 0x1a || b === 0x1d ? 7 : 1;
        const payload = isShort ? 7 : 14;
        if (this.buffer.length - i < header + payload) return false;

        const body = this.buffer.subarray(i + header, i + header + payload);
        if (payload === 7) {
          const padded = Buffer.alloc(14);
          body.copy(padded, 7, 0, 7);
          this.emitBuffer(padded, 'beast', 56);
        } else {
          this.emitBuffer(Buffer.from(body), 'beast', 112);
        }
        i += header + payload;
        this.unmatched = 0;
        continue;
      }
      if (b >= 0x33 && b <= 0x3f) {
        // Optional Beast clock: 0x33 + 4 bytes little-endian (ms).
        if (this.buffer.length - i < 5) return false;
        i += 5;
        continue;
      }
      if (b === 0x31 || b === 0x32) {
        if (this.buffer.length - i < 7) return false;
        i += 7;
        continue;
      }
      // Unknown byte inside what we locked as Beast: skip.
      i++;
      this.unmatched++;
      if (this.unmatched > MAX_LOOKAHEAD) this.fail();
      continue;
    }

    this.buffer = this.buffer.subarray(i);
    return this.buffer.length === 0;
  }

  private emit(hex: string, mode: FramingMode = 'avr'): void {
    let frame = Buffer.from(hex.padEnd(28, '0').slice(0, 28), 'hex');
    let bits: 56 | 112 = 112;
    if (hex.length === 14) {
      // 56-bit message: right-align into a 14-byte buffer.
      const padded = Buffer.alloc(14);
      Buffer.from(hex, 'hex').copy(padded, 7);
      frame = padded;
      bits = 56;
    }
    this.emitBuffer(frame, mode, bits);
  }

  private emitBuffer(frame: Buffer, mode: FramingMode, bits: 56 | 112): void {
    this.onFrame({ frame, bits, mode });
  }
}

function isHex(b: number): boolean {
  return (
    (b >= 0x30 && b <= 0x39) ||
    (b >= 0x41 && b <= 0x46) ||
    (b >= 0x61 && b <= 0x66)
  );
}