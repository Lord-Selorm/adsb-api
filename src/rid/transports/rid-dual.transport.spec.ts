import { describe, expect, it, vi } from 'vitest';
import { RidDualTransport } from './rid-dual.transport.js';
import type { RidUdpTransport } from './rid-udp.transport.js';
import type { RidSerialTransport } from './rid-serial.transport.js';

describe('RidDualTransport', () => {
  it('aggregates data, status, and timestamps from both transports', async () => {
    let udpDataCb: ((buf: Buffer) => void) | undefined;
    let serialDataCb: ((buf: Buffer) => void) | undefined;

    const mockUdp = {
      kind: 'rid_udp',
      isConnected: true,
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      onData: vi.fn((cb) => {
        udpDataCb = cb;
      }),
      onError: vi.fn(),
      getLastMessageAt: vi.fn().mockReturnValue(1000),
      getConnectionStatus: vi.fn().mockReturnValue('connected'),
    } as unknown as RidUdpTransport;

    const mockSerial = {
      kind: 'rid_serial',
      isConnected: false,
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      onData: vi.fn((cb) => {
        serialDataCb = cb;
      }),
      onError: vi.fn(),
      getLastMessageAt: vi.fn().mockReturnValue(2000),
      getConnectionStatus: vi.fn().mockReturnValue('disconnected'),
    } as unknown as RidSerialTransport;

    const dual = new RidDualTransport(mockUdp, mockSerial);

    expect(dual.kind).toBe('rid_dual');
    expect(dual.isConnected).toBe(true);
    expect(dual.getConnectionStatus()).toBe('connected (udp)');
    expect(dual.getLastMessageAt()).toBe(2000);

    const received: string[] = [];
    dual.onData((buf) => received.push(buf.toString('utf8')));

    udpDataCb!(Buffer.from('udp-data', 'utf8'));
    serialDataCb!(Buffer.from('serial-data', 'utf8'));

    expect(received).toEqual(['udp-data', 'serial-data']);

    await dual.connect();
    expect(mockUdp.connect).toHaveBeenCalled();
    expect(mockSerial.connect).toHaveBeenCalled();

    await dual.disconnect();
    expect(mockUdp.disconnect).toHaveBeenCalled();
    expect(mockSerial.disconnect).toHaveBeenCalled();
  });
});
