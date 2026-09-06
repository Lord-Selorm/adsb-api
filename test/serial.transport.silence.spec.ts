// test/serial.transport.silence.spec.ts

import { vi } from 'vitest';

// Mock SerialPort before importing the module that uses it
vi.mock('serialport', () => {
  const mockPortCallbacks = {} as Record<string, (...args: any[]) => void>;

  const mockSerialPort = {
    on: vi.fn((event: string, cb: (...args: any[]) => void) => {
      mockPortCallbacks[event] = cb;
      return mockSerialPort;
    }),
    open: vi.fn((cb: (err?: Error) => void) => cb()),
    removeAllListeners: vi.fn(),
    close: vi.fn((cb: () => void) => cb()),
    isOpen: true,
  };

  // Constructor function that returns the mock instance
  function SerialPort(this: any, _options: any) {
    return mockSerialPort;
  }
  // Attach callbacks for test access
  (SerialPort as any).mockPortCallbacks = mockPortCallbacks;

  return { SerialPort, default: SerialPort };
});

// Import the mock class to access callbacks
import { SerialPort } from 'serialport';
import { SerialTransport } from '../src/ingress/transports/serial.transport.js';

vi.useFakeTimers();

describe('SerialTransport silence detection', () => {
  it('logs a warning after silence threshold is exceeded', async () => {
    process.env.SERIAL_SILENCE_THRESHOLD = '100'; // 100 ms
    const transport = new SerialTransport({ get: vi.fn() } as any);
    const warnSpy = vi.spyOn((transport as any).logger, 'warn').mockImplementation(() => {});
    await transport.connect();
    // Simulate a data event to start timer and set lastMessageAt
    const callbacks = (SerialPort as any).mockPortCallbacks as Record<string, (...args: any[]) => void>;
    callbacks['data']?.(Buffer.from([0]));
    // Advance fake timers beyond threshold
    vi.advanceTimersByTime(200);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
