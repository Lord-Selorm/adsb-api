// src/ingress/ingress.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IngressService } from './ingress.service.js';
import { AircraftModule } from '../aircraft/aircraft.module.js';
import { ModeSDecoder } from '../decode/mode-s.decoder.js';
import { TRANSPORT_TOKEN } from './transport.token.js';
import { SerialTransport } from './transports/serial.transport.js';
import { MockTransport } from './transports/mock.transport.js';

@Module({
  imports: [ConfigModule, AircraftModule],
  providers: [
    IngressService,
    ModeSDecoder,
    {
      provide: TRANSPORT_TOKEN,
      useFactory: (config: ConfigService) => {
        const useMock = config.get<string>('USE_MOCK', 'true').toLowerCase();
        if (useMock === 'true') {
          return new MockTransport({
            receiverLat: Number(config.get('RECEIVER_LAT', '52')),
            receiverLon: Number(config.get('RECEIVER_LON', '4')),
            aircraftCount: Number(config.get('MOCK_AIRCRAFT', '8')),
            tickMs: Number(config.get('MOCK_TICK_MS', '1000')),
          });
        }
        return new SerialTransport(config);
      },
      inject: [ConfigService],
    },
  ],
  exports: [IngressService, TRANSPORT_TOKEN, ModeSDecoder],
})
export class IngressModule {}