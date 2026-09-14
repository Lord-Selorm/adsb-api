import { describe, expect, it, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { AisMockTransport } from './ais-mock.transport';
import { Logger } from '@nestjs/common';

describe('AisMockTransport', () => {
  let transport: AisMockTransport;
  const mockListener = vi.fn();

  beforeAll(() => {
    vi.useFakeTimers();
    // Suppress logger output during tests
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  beforeEach(() => {
    transport = new AisMockTransport({
      centerLat: 52,
      centerLon: 4,
      tickMs: 1000,
    });
    transport.onData(mockListener);
  });

  afterEach(async () => {
    await transport.disconnect();
    mockListener.mockReset();
  });

  it('should emit position and static AIS messages on each tick', async () => {
    await transport.connect();
    vi.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(mockListener).toHaveBeenCalled();
    const callArg = mockListener.mock.calls[0][0];
    const dataStr = callArg.toString();
    const lines = dataStr.trim().split('\n');
    const types = lines.map((l) => JSON.parse(l).type).sort();
    expect(types).toEqual([1, 5]);
    const pos = JSON.parse(lines[0]);
    expect(pos).toMatchObject({ type: 1, mmsi: expect.any(String) });
    const stat = JSON.parse(lines[1]);
    expect(stat).toMatchObject({ type: 5, mmsi: expect.any(String) });
  });

  afterAll(() => {
    vi.useRealTimers();
  });
});