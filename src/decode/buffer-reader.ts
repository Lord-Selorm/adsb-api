/**
 * Bit-field reader over a Mode S message. `base` shifts the read window so
 * the same DF17 field arithmetic works for 56-bit messages (payload aligned
 * at byte 7) as well as 112-bit ones (aligned at byte 0).
 */
export class BufferReader {
  constructor(
    private readonly buf: Uint8Array,
    private readonly base = 0,
  ) {}

  /** Read `len` bits (1..31) starting at absolute bit `start`, base-adjusted. */
  readBits(start: number, len: number): number {
    let v = 0;
    for (let i = 0; i < len; i++) {
      const pos = this.base + start + i;
      v = (v << 1) | ((this.buf[pos >> 3] >> (7 - (pos & 7))) & 1);
    }
    return v;
  }
}