export type FramingMode = 'beast' | 'avr' | 'rawhex';

export interface ParsedFrame {
  /** Downlink format bit-length of the underlying message. */
  bits: 56 | 112;
  /** The Mode S message (56 bits placed in bytes 7..13 when bits === 56). */
  frame: Buffer;
  mode: FramingMode;
}

export class UnrecognizedFramingError extends Error {
  constructor(public readonly dump: string, hint?: string) {
    super(
      `Unrecognized data framing. ${hint ?? ''}\n` +
        'Received bytes (first 128):\n' +
        dump,
    );
    this.name = 'UnrecognizedFramingError';
  }
}