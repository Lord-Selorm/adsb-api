// test/ingress.transport.spec.ts
import { Test } from '@nestjs/testing';
import { IngressModule } from '../src/ingress/ingress.module.js';
import { TRANSPORT_TOKEN } from '../src/ingress/transport.token.js';
import { SerialTransport } from '../src/ingress/transports/serial.transport.js';
import { TcpTransport } from '../src/ingress/transports/tcp.transport.js';

describe('Transport DI token', () => {
  afterEach(() => {
    delete process.env.TCP_PORT;
  });

  it('provides SerialTransport when no TCP port is configured', async () => {
    delete process.env.TCP_PORT;
    const moduleRef = await Test.createTestingModule({
      imports: [IngressModule],
    }).compile();
    const transport = moduleRef.get<any>(TRANSPORT_TOKEN);
    expect(transport).toBeInstanceOf(SerialTransport);
  });

  it('provides TcpTransport when TCP_PORT is set', async () => {
    process.env.TCP_PORT = '8235';
    const moduleRef = await Test.createTestingModule({
      imports: [IngressModule],
    }).compile();
    const transport = moduleRef.get<any>(TRANSPORT_TOKEN);
    expect(transport).toBeInstanceOf(TcpTransport);
  });
});