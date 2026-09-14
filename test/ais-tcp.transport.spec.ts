import { describe, expect, it } from 'vitest';
import net from 'node:net';
import { AisTcpTransport } from '../src/ais/transports/ais-tcp.transport.js';

const AIVDM =
  '!AIVDM,1,1,,A,169D2gP008ghO<A=5R68gvH0<1P0*6C';

describe('AisTcpTransport', () => {
  it('receives AIVDM sentences from a TCP serial bridge and reports connected', async () => {
    const server = net.createServer((sock) => {
      sock.write(`${AIVDM}\r\n`);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', () => resolve()),
    );
    const port = (server.address() as net.AddressInfo).port;

    const transport = new AisTcpTransport({ host: '127.0.0.1', port });
    const chunks: Buffer[] = [];
    transport.onData((c) => chunks.push(c));
    await transport.connect();

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].toString()).toContain('169D2gP008ghO');
    expect(transport.getConnectionStatus()).toBe('connected');
    expect(transport.getLastMessageAt()).toBeGreaterThan(0);

    await transport.disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});