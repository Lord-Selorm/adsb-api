import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AircraftModule } from './aircraft/aircraft.module.js';
import { DecodeModule } from './decode/decode.module.js';
import { FlightsModule } from './flights/flights.module.js';
import { HealthModule } from './health/health.module.js';
import { IngressModule } from './ingress/ingress.module.js';
import { RidModule } from './rid/rid.module.js';
import { AisModule } from './ais/ais.module.js';
import { TracksModule } from './tracks/tracks.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DecodeModule,
    IngressModule,
    AircraftModule,
    TracksModule,
    RidModule,
    AisModule,
    FlightsModule,
    HealthModule,
  ],
})
export class AppModule {}
