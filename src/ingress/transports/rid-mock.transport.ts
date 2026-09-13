import { Injectable, Logger } from '@nestjs/common';
import type { DataSource, DataSourceKind } from '../data-source.interface.js';

interface MockDrone {
  serial_number: string;
  uav_type: string;
  bearingDeg: number;
  radiusKm: number;
  headingDeg: number;
  heightM: number;
  altitudeM: number;
  speedMS: number;
  verticalMS: number;
  ticks: number;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

const UAV_TYPES = ['DJI Mini4Pro', 'DJI Mavic 3', 'DJI Tello', 'Autel EVO II'];

/**
 * Synthetic Drone Remote ID source: emits URM-01/02 protocol JSON envelopes
 * ({"frame_type":3,"frame_info":{...}}) for a handful of drones orbiting a
 * ground station, one line per drone. Exercises the RID decode -> store ->
 * API pipeline without hardware.
 */
@Injectable()
export class RidMockTransport implements DataSource {
  private lastMessageAt: number = Date.now();
  readonly kind: DataSourceKind = 'rid_mock';
  isConnected = false;

  private readonly logger = new Logger(RidMockTransport.name);
  private dataListeners: Array<(chunk: Buffer) => void> = [];
  private errorListeners: Array<(err: Error) => void> = [];
  private timer: NodeJS.Timeout | null = null;
  private drones: MockDrone[] = [];
  private readonly receiverLat: number;
  private readonly receiverLon: number;
  private readonly droneCount: number;
  private readonly tickMs: number;

  constructor(
    private readonly config: {
      receiverLat: number;
      receiverLon: number;
      droneCount: number;
      tickMs: number;
    },
  ) {
    this.receiverLat = config.receiverLat;
    this.receiverLon = config.receiverLon;
    this.droneCount = config.droneCount;
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
    this.drones = Array.from({ length: this.droneCount }, (_, i) => ({
      serial_number: (0xa1b2_0000 + i + 1).toString(16).toUpperCase(),
      uav_type: UAV_TYPES[i % UAV_TYPES.length],
      bearingDeg: (i * 360) / Math.max(1, this.droneCount),
      radiusKm: randomBetween(1, 5),
      headingDeg: randomBetween(0, 360),
      heightM: Math.round(randomBetween(30, 120)),
      altitudeM: Math.round(randomBetween(120, 400)),
      speedMS: Math.round(randomBetween(3, 15)),
      verticalMS: Math.round(randomBetween(-2, 2) * 10) / 10,
      ticks: 0,
    }));
    this.isConnected = true;
    this.logger.log(
      `RID mock transport online: ${this.drones.length} drones @ ${this.receiverLat},${this.receiverLon}, ${this.tickMs}ms tick`,
    );
    this.timer = setInterval(() => this.emitTick(), this.tickMs);
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.isConnected = false;
  }

  private emitTick(): void {
    const frames: string[] = [];
    for (const d of this.drones) {
      d.ticks++;
      d.bearingDeg = (d.bearingDeg + 0.6) % 360;
      d.headingDeg = (d.headingDeg + 0.8) % 360;
      d.speedMS = Math.max(0, d.speedMS + randomBetween(-0.5, 0.5));
      const { lat, lon } = this.positionFor(d);
      frames.push(
        JSON.stringify({
          frame_type: 3,
          frame_info: {
            serial_number: d.serial_number,
            longitude: Math.round(lon * 1e6) / 1e6,
            latitude: Math.round(lat * 1e6) / 1e6,
            height: d.heightM,
            altitude: d.altitudeM,
            v_hor: d.speedMS,
            v_up: d.verticalMS,
            app_lat: this.receiverLat,
            app_lon: this.receiverLon,
            app_alt: 98,
            app_type: 1,
            uav_type: d.uav_type,
            reg_code: d.serial_number.slice(-8),
            angle: Math.round(d.headingDeg * 100) / 100,
            status: 2,
            sys_type: 1,
            weight: 1,
            has_allowlist: false,
          },
        }) + '\n',
      );
    }
    const chunk = Buffer.from(frames.join(''), 'utf8');
    this.lastMessageAt = Date.now();
    this.dataListeners.forEach((cb) => cb(chunk));
  }

  private positionFor(d: MockDrone): { lat: number; lon: number } {
    const rad = (d.bearingDeg * Math.PI) / 180;
    const lat = this.receiverLat + (Math.cos(rad) * d.radiusKm) / 111.32;
    const lon =
      this.receiverLon +
      (Math.sin(rad) * d.radiusKm) /
        (111.32 * Math.cos((this.receiverLat * Math.PI) / 180));
    return { lat, lon };
  }

  public getLastMessageAt(): number {
    return this.lastMessageAt;
  }

  public getConnectionStatus(): string {
    return this.isConnected ? 'connected' : 'disconnected';
  }
}
