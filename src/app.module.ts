import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AircraftModule } from './aircraft/aircraft.module.js';
import { HealthController } from './health.controller.js';
import { IngressModule } from './ingress/ingress.module.js';
import { TimescaleModule } from './timescale/timescale.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    IngressModule,
    AircraftModule,
    TimescaleModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}