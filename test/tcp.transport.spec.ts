// test/tcp.transport.spec.ts
import { describe, expect, it } from 'vitest';
import net from 'node:net';
import { TcpTransport } from '../src/ingress/transports/tcp.transport.js';

const config = (host: string, port: number) =>
  ({
    get: (key: string) => {
      if (key === 'TCP_HOST') return host;
      if (key === 'TCP_PORT') return String(port);
      return undefined;
    },
  }) as any;

describe('TcpTransport', () => {
  it('receives AVR frames from a TCP serial bridge and reports connected', async () => {
    const server = net.createServer((sock) => {
      sock.write('*8D40621D58C382D690C8AC2863A7;\r\n');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as net.AddressInfo).port;

    const transport = new TcpTransport(config('127.0.0.1', port));
    const chunks: Buffer[] = [];
    transport.onData((c) => chunks.push(c));
    await transport.connect();

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].toString()).toContain('8D40621D58C382D690C8AC2863A7');
    expect(transport.getConnectionStatus()).toBe('connected');
    expect(transport.getLastMessageAt()).toBeGreaterThan(0);

    await transport.disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});