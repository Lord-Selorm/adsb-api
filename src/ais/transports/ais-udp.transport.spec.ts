import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSocket, type Socket } from 'node:dgram';
import { AisUdpTransport } from './ais-udp.transport.js';

const AIVDM = Buffer.from(
  '!AIVDM,1,1,,A,169D2gP008ghO<A=5R68gvH0<1P0*6C\r\n',
  'utf8',
);

describe('AisUdpTransport', () => {
  let transport: AisUdpTransport;
  let sender: Socket;
  const chunks: Buffer[] = [];

  beforeAll(async () => {
    transport = new AisUdpTransport({ host: '127.0.0.1', port: 0 });
    const firstFrame = new Promise<void>((resolve) => {
      transport.onData((chunk) => {
        chunks.push(chunk);
        resolve();
      });
    });
    await transport.connect();
    sender = createSocket('udp4');
    for (let i = 0; i < 3; i++) {
      sender.send(AIVDM, transport.getLocalPort()!, '127.0.0.1');
    }
    await firstFrame;
  });

  afterAll(async () => {
    await transport.disconnect();
    sender.close();
  });

  it('binds as a passive UDP listener in the ais_udp kind', () => {
    expect(transport.kind).toBe('ais_udp');
    expect(transport.isConnected).toBe(true);
    expect(transport.getConnectionStatus()).toBe('connected');
    expect(transport.getLocalPort()).toBeGreaterThan(0);
  });

  it('fans received datagrams out as chunks', () => {
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].toString('utf8')).toContain('!AIVDM');
    expect(chunks[0].toString('utf8')).toContain('169D2gP008ghO');
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