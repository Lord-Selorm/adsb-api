import { Injectable, Logger } from '@nestjs/common';
import type { DataSource, DataSourceKind } from '../data-source.interface.js';
import {
  buildIdentityFrame,
  buildPositionFrame,
  buildVelocityFrame,
  toAvrLine,
} from './frame-builder.js';

interface MockAircraft {
  icao: number;
  callsign: string;
  bearingDeg: number;
  radiusKm: number;
  trackDeg: number;
  altitudeFt: number;
  speedKt: number;
  verticalRateFpm: number;
  ticks: number;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Synthetic receiver: emits realistic DF17 frames (AVR ASCII) for a handful of
 * aircraft orbiting a fixed ground position, so the full pipeline can be
 * exercised without hardware. Frames carry valid CRC24 and decode cleanly.
 */
@Injectable()
export class MockTransport implements DataSource {
  // Track last emitted message timestamp for HealthController
  private lastMessageAt: number = Date.now();
  readonly kind: DataSourceKind = 'mock';
  isConnected = false;

  private readonly logger = new Logger(MockTransport.name);
  private dataListeners: Array<(chunk: Buffer) => void> = [];
  private errorListeners: Array<(err: Error) => void> = [];
  private timer: NodeJS.Timeout | null = null;
  private aircraft: MockAircraft[] = [];
  private readonly receiverLat: number;
  private readonly receiverLon: number;
  private readonly tickMs: number;

  constructor(
    private readonly config: {
      receiverLat: number;
      receiverLon: number;
      aircraftCount: number;
      tickMs: number;
    },
  ) {
    this.receiverLat = config.receiverLat;
    this.receiverLon = config.receiverLon;
    this.tickMs = config.tickMs;
  }

  onData(listener: (chunk: Buffer) => void): void {
    this.dataListeners.push(listener);
  }

  onError(listener: (err: Error) => void): void {
    this.errorListeners.push(listener);
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    this.aircraft = Array.from({ length: this.config.aircraftCount }, (_, i) => ({
      icao: 0x4a_0000 + i + 1,
      callsign: `NEST${String(100 + i + 1)}`,
      bearingDeg: (i * 360) / this.config.aircraftCount,
      radiusKm: randomBetween(15, 120),
      trackDeg: randomBetween(0, 360),
      altitudeFt: Math.round(randomBetween(8_000, 38_000) / 100) * 100,
      speedKt: Math.round(randomBetween(220, 480)),
      verticalRateFpm: randomBetween(-1600, 800),
      ticks: 0,
    }));
    this.isConnected = true;
    this.logger.log(
      `Mock transport online: ${this.aircraft.length} aircraft @ ${this.receiverLat},${this.receiverLon}, ${this.tickMs}ms tick`,
    );
    this.timer = setInterval(() => this.emitTick(), this.tickMs);
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.isConnected = false;
  }

  private emitTick(): void {
    const lines: string[] = [];
    for (const a of this.aircraft) {
      a.ticks++;
      a.bearingDeg = (a.bearingDeg + 0.4) % 360;
      a.trackDeg = (a.trackDeg + 0.5) % 360;
      a.altitudeFt = Math.max(
        1_000,
        a.altitudeFt + (a.verticalRateFpm / 60) * (this.tickMs / 1000),
      );
      if (Math.abs(a.verticalRateFpm) > 40 && Math.random() < 0.002) {
        a.verticalRateFpm = -a.verticalRateFpm;
      }

      const { lat, lon } = this.positionFor(a);
      // Alternate even/odd CPR frames every tick; identity + velocity quieter.
      const odd = a.ticks % 2 === 1;
      lines.push(
        toAvrLine(buildPositionFrame({ icao: a.icao, lat, lon, altitudeFt: a.altitudeFt, odd })),
      );
      if (a.ticks % 3 === 0) {
        lines.push(
          toAvrLine(buildVelocityFrame({ icao: a.icao, speedKt: a.speedKt, trackDeg: a.trackDeg, verticalRateFpm: a.verticalRateFpm })),
        );
      }
      if (a.ticks === 1 || a.ticks % 6 === 0) {
        lines.push(toAvrLine(buildIdentityFrame(a.icao, a.callsign)));
      }
    }
    const chunk = Buffer.from(lines.join(''), 'utf8');
    this.lastMessageAt = Date.now();
    this.dataListeners.forEach((cb) => cb(chunk));
  }

  private positionFor(a: MockAircraft): { lat: number; lon: number } {
    const rad = (a.bearingDeg * Math.PI) / 180;
    const lat = this.receiverLat + (Math.cos(rad) * a.radiusKm) / 111.32;
    const lon =
      this.receiverLon +
      (Math.sin(rad) * a.radiusKm) / (111.32 * Math.cos((this.receiverLat * Math.PI) / 180));
    return { lat, lon };
  }
  /** Return timestamp of last emitted mock message */
  public getLastMessageAt(): number {
    return this.lastMessageAt;
  }

  /** Return connection status as string */
  public getConnectionStatus(): string {
    return this.isConnected ? 'connected' : 'disconnected';
  }
}