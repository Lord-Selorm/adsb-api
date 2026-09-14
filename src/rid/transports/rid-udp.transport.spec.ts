import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSocket, type Socket } from 'node:dgram';
import { RidUdpTransport } from './rid-udp.transport.js';

const GNSS_HEARTBEAT = Buffer.from(
  '{"frame_type":7,"dev_sn":"UAVRQM260017","frame_info":{"datetime":"1970-01-01_00:00:47.000","longitude":0,"latitude":0}}\r\n',
  'utf8',
);

describe('RidUdpTransport', () => {
  let transport: RidUdpTransport;
  let sender: Socket;
  const chunks: Buffer[] = [];

  beforeAll(async () => {
    transport = new RidUdpTransport({ host: '127.0.0.1', port: 0 });
    const firstFrame = new Promise<void>((resolve) => {
      transport.onData((chunk) => {
        chunks.push(chunk);
        resolve();
      });
    });
    await transport.connect();
    sender = createSocket('udp4');
    for (let i = 0; i < 3; i++) {
      sender.send(GNSS_HEARTBEAT, transport.getLocalPort()!, '127.0.0.1');
    }
    await firstFrame;
  });

  afterAll(async () => {
    await transport.disconnect();
    sender.close();
  });

  it('binds as a passive UDP listener in the rid_udp kind', () => {
    expect(transport.kind).toBe('rid_udp');
    expect(transport.isConnected).toBe(true);
    expect(transport.getConnectionStatus()).toBe('connected');
    expect(transport.getLocalPort()).toBeGreaterThan(0);
  });

  it('fans received datagrams out as chunks', () => {
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].toString('utf8')).toContain('frame_type');
    expect(chunks[0].toString('utf8')).toContain('UAVRQM260017');
  });

  it('tracks the time of the last received message', () => {
    expect(transport.getLastMessageAt()).toBeGreaterThan(0);
  });

  it('reports disconnected after disconnect', async () => {
    expect(transport.getConnectionStatus()).toBe('connected');
    await transport.disconnect();
    expect(transport.isConnected).toBe(false);
    expect(transport.getConnectionStatus()).toBe('disconnected');
    expect(transport.getLocalPort()).toBeUndefined();
  });
});