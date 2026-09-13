import { Module } from '@nestjs/common';
import { ModeSDecoder } from './mode-s.decoder.js';

/**
 * Decode domain: owns the Mode S / ADS-B frame decoder (CRC24 validation,
 * DF/ICAO extraction, altitude/velocity/callsign decoding, CPR position
 * fields). Exposed to consumers (ingress pipeline, health checks, tests)
 * through a single, deduplicated provider.
 */
@Module({
  providers: [ModeSDecoder],
  exports: [ModeSDecoder],
})
export class DecodeModule {}
