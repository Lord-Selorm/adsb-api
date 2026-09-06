import { describe, expect, it } from 'vitest';
import { FramingDetector } from './framing.detector.js';
import type { ParsedFrame } from './framing.types.js';

describe('FramingDetector', () => {
  const collect = (input: Buffer | string) => {
    const frames: ParsedFrame[] = [];
    const errors: Error[] = [];
    const detector = new FramingDetector(
      (f) => frames.push(f),
      (e) => errors.push(e),
    );
    if (typeof input === 'string') detector.push(Buffer.from(input, 'utf8'));
    else detector.push(input);
    return { frames, errors };
  };

  it('parses a single raw AVR line', () => {
    const { frames } = collect('*8D40621D58C382D690C8AC2863A7;\r\n');
    expect(frames).toHaveLength(1);
    expect(frames[0].mode).toBe('avr');
    expect(frames[0].bits).toBe(112);
    expect(frames[0].frame.toString('hex').toUpperCase()).toBe('8D40621D58C382D690C8AC2863A7');
  });

  it('parses a 56-bit AVR line', () => {
    const { frames } = collect('*52E6B438586C63;\r\n');
    expect(frames).toHaveLength(1);
    expect(frames[0].bits).toBe(56);
  });

  it('parses raw hex lines', () => {
    const { frames } = collect('8D40621D58C382D690C8AC2863A7\n');
    expect(frames).toHaveLength(1);
    expect(frames[0].mode).toBe('rawhex');
  });

  it('parses multiple frames in one chunk', () => {
    const { frames } = collect('*8D40621D58C382D690C8AC2863A7;\r\n*8D40621D58C386435CC412692AD6;\r\n');
    expect(frames).toHaveLength(2);
  });

  it('parses frames split across chunk boundaries', () => {
    const frames: ParsedFrame[] = [];
    const det = new FramingDetector((f) => frames.push(f));
    det.push(Buffer.from('*8D40621D58C382D69', 'utf8'));
    det.push(Buffer.from('0C8AC2863A7;\r\n', 'utf8'));
    expect(frames).toHaveLength(1);
  });

  it('skips the ADSR-800 boot banner before the first frame', () => {
    const { frames } = collect('JouleMore. Ltd Since2009 SetOutput=1 Uart_Baud=460800\n*8D40621D58C382D690C8AC2863A7;\r\n');
    expect(frames).toHaveLength(1);
  });

  it('parses Beast binary frames', () => {
    const frame = Buffer.from('8D40621D58C382D690C8AC2863A7', 'hex');
    const chunk = Buffer.concat([Buffer.from([0x1c]), frame]);
    const { frames } = collect(chunk);
    expect(frames).toHaveLength(1);
    expect(frames[0].mode).toBe('beast');
    expect(frames[0].bits).toBe(112);
    expect(frames[0].frame.toString('hex')).toBe('8d40621d58c382d690c8ac2863a7');
  });

  it('raises UnrecognizedFramingError on a hopeless feed', () => {
    const errors: Error[] = [];
    const frames: ParsedFrame[] = [];
    const d = new FramingDetector((f) => frames.push(f), (e) => errors.push(e));
    d.push(Buffer.from('@@@@@@@@@@@@@@@@@@@@@@@@@@' + 'X'.repeat(1100), 'utf8'));
    expect(frames).toHaveLength(0);
  });
});