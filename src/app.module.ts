import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AircraftModule } from './aircraft/aircraft.module.js';
import { DecodeModule } from './decode/decode.module.js';
import { FlightsModule } from './flights/flights.module.js';
import { HealthController } from './health/health.controller.js';
import { IngressModule } from './ingress/ingress.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DecodeModule,
    IngressModule,
    AircraftModule,
    FlightsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
