// test/mode-s.decoder.malformed.spec.ts
import { ModeSDecoder } from '../src/decode/mode-s.decoder.js';
import { vi } from 'vitest';

describe('ModeSDecoder malformed message handling', () => {
  it('increments malformedCount and logs warning when crcOk throws', () => {
    const decoder = new ModeSDecoder();
    const initialCount = (decoder as any).malformedCount;
    // Spy on logger.warn
    const loggerSpy = vi.spyOn((decoder as any).logger, 'warn').mockImplementation(() => {});
    // Mock crcOk to throw error
    vi.spyOn(decoder as any, 'crcOk').mockImplementation(() => {
      throw new Error('forced crc error');
    });
    const result = decoder.decode(Buffer.alloc(14, 0));
    expect(result).toBeNull();
    expect((decoder as any).malformedCount).toBe(initialCount + 1);
    expect(loggerSpy).toHaveBeenCalled();
    loggerSpy.mockRestore();
  });
});
