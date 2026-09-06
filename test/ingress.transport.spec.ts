// test/ingress.transport.spec.ts
import { Test } from '@nestjs/testing';
import { IngressModule } from '../src/ingress/ingress.module.js';
import { TRANSPORT_TOKEN } from '../src/ingress/transport.token.js';
import { MockTransport } from '../src/ingress/transports/mock.transport.js';
import { SerialTransport } from '../src/ingress/transports/serial.transport.js';

describe('Transport DI token', () => {
  afterEach(() => {
    // Cleanup env variable after each test
    delete process.env.USE_MOCK;
  });

  it('should provide MockTransport when USE_MOCK is true', async () => {
    process.env.USE_MOCK = 'true';
    const moduleRef = await Test.createTestingModule({
      imports: [IngressModule],
    }).compile();
    const transport = moduleRef.get<any>(TRANSPORT_TOKEN);
    expect(transport).toBeInstanceOf(MockTransport);
  });

  it('should provide SerialTransport when USE_MOCK is false', async () => {
    process.env.USE_MOCK = 'false';
    const moduleRef = await Test.createTestingModule({
      imports: [IngressModule],
    }).compile();
    const transport = moduleRef.get<any>(TRANSPORT_TOKEN);
    expect(transport).toBeInstanceOf(SerialTransport);
  });
});
