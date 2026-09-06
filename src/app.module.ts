import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AircraftModule } from './aircraft/aircraft.module.js';
import { HealthController } from './health.controller.js';
import { IngressModule } from './ingress/ingress.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    IngressModule,
    AircraftModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}