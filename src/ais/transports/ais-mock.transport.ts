import { Injectable, Logger } from '@nestjs/common';
import type { DataSource, DataSourceKind } from '../../common/data-source.interface.js';

interface MockVessel {
  mmsi: string;
  name: string;
  callsign: string;
  shipType: number;
  lat: number;
  lon: number;
  sog: number;
  cog: number;
  heading: number;
  navStatus: number;
  destination: string;
  length: number;
  width: number;
  draft: number;
}

const INITIAL_VESSELS: Omit<MockVessel, 'lat' | 'lon'>[] = [
  {
    mmsi: '211456000',
    name: 'ATLANTIC PROMISE',
    callsign: 'DH721',
    shipType: 70, // Cargo
    sog: 14.5,
    cog: 82.0,
    heading: 81,
    navStatus: 0, // Under way
    destination: 'ROTTERDAM',
    length: 220,
    width: 32,
    draft: 10.2,
  },
  {
    mmsi: '316987000',
    name: 'PACIFIC VOYAGER',
    callsign: 'CF554',
    shipType: 80, // Tanker
    sog: 11.2,
    cog: 240.0,
    heading: 239,
    navStatus: 0,
    destination: 'ANTWERP',
    length: 185,
    width: 28,
    draft: 9.1,
  },
  {
    mmsi: '244123000',
    name: 'HARBOR CHAMPION',
    callsign: 'PB991',
    shipType: 52, // Tug
    sog: 7.8,
    cog: 310.0,
    heading: 312,
    navStatus: 0,
    destination: 'PORT OPERATIONS',
    length: 32,
    width: 11,
    draft: 4.5,
  },
  {
    mmsi: '235098000',
    name: 'COASTAL RUNNER',
    callsign: 'GZ338',
    shipType: 60, // Passenger
    sog: 18.0,
    cog: 175.0,
    heading: 175,
    navStatus: 0,
    destination: 'ISLAND FERRY TERMINAL',
    length: 85,
    width: 16,
    draft: 3.8,
  },
];

@Injectable()
export class AisMockTransport implements DataSource {
  readonly kind: DataSourceKind = 'ais_mock';
  isConnected = false;

  private readonly logger = new Logger(AisMockTransport.name);
  private dataListeners: Array<(chunk: Buffer) => void> = [];
  private errorListeners: Array<(err: Error) => void> = [];
  private timer: NodeJS.Timeout | null = null;
  private lastMessageAt: number = Date.now();
  private vessels: MockVessel[] = [];

  constructor(
    private readonly config: {
      centerLat: number;
      centerLon: number;
      tickMs: number;
    },
  ) {}

  onData(listener: (chunk: Buffer) => void): void {
    this.dataListeners.push(listener);
  }

  onError(listener: (err: Error) => void): void {
    this.errorListeners.push(listener);
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    this.initVessels();
    this.isConnected = true;
    this.logger.log(
      `AIS Mock transport active (${this.vessels.length} vessels, tick: ${this.config.tickMs}ms)`,
    );

    this.timer = setInterval(() => this.tick(), this.config.tickMs);
  }

  async disconnect(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isConnected = false;
  }

  getLastMessageAt(): number {
    return this.lastMessageAt;
  }

  getConnectionStatus(): string {
    return this.isConnected ? 'connected' : 'disconnected';
  }

  private initVessels(): void {
    this.vessels = INITIAL_VESSELS.map((v, i) => {
      // Scatter vessels within ~0.2 degrees of center
      const offsetLat = (i - 1.5) * 0.08;
      const offsetLon = (i % 2 === 0 ? 1 : -1) * 0.1;
      return {
        ...v,
        lat: this.config.centerLat + offsetLat,
        lon: this.config.centerLon + offsetLon,
      };
    });
  }

  private tick(): void {
    this.lastMessageAt = Date.now();
    const dtHours = this.config.tickMs / 3_600_000;

    for (const v of this.vessels) {
      // Move vessel: SOG in knots = nautical miles per hour.
      // 1 nautical mile approx 1/60th deg latitude.
      const distNm = v.sog * dtHours;
      const rad = (v.cog * Math.PI) / 180;
      v.lat += (distNm * Math.cos(rad)) / 60;
      v.lon +=
        (distNm * Math.sin(rad)) /
        (60 * Math.cos((v.lat * Math.PI) / 180));

      // Emit position report
      const posReport = JSON.stringify({
        type: 1,
        mmsi: v.mmsi,
        navStatus: v.navStatus,
        sog: Number(v.sog.toFixed(1)),
        cog: Number(v.cog.toFixed(1)),
        heading: v.heading,
        latitude: Number(v.lat.toFixed(5)),
        longitude: Number(v.lon.toFixed(5)),
      });

      // Periodically emit static data report
      const staticReport = JSON.stringify({
        type: 5,
        mmsi: v.mmsi,
        name: v.name,
        callsign: v.callsign,
        shipType: v.shipType,
        destination: v.destination,
        length: v.length,
        width: v.width,
        draft: v.draft,
      });

      const chunk = Buffer.from(`${posReport}\n${staticReport}\n`, 'utf8');
      this.dataListeners.forEach((cb) => cb(chunk));
    }
  }
}
