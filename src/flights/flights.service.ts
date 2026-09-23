import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InfluxDB,
  Point,
  type QueryApi,
  type WriteApi,
} from '@influxdata/influxdb-client';
import type { AircraftState } from '../aircraft/aircraft-store.service.js';
import type { DroneRidState } from '../rid/drone-rid-store.service.js';
import type { VesselState } from '../ais/ais.types.js';

const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_BATCH_SIZE = 200;

export const MEASUREMENT_AIRCRAFT = 'aircraft_positions';
export const MEASUREMENT_DRONE = 'drone_positions';
export const MEASUREMENT_VESSEL = 'vessel_positions';

export const TAG_ICAO = 'icao';
export const TAG_SERIAL = 'serial_number';
export const TAG_MMSI = 'mmsi';

export interface PositionRow {
  time: Date;
  icao: string;
  callsign: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  vertical_rate: number | null;
  squawk: string | null;
  position_source: string | null;
  on_ground: boolean | null;
}

export interface FlightSummaryRow {
  icao: string;
  first_seen: Date | null;
  last_seen: Date | null;
  message_count: number;
}

export interface DronePositionRow {
  time: Date;
  serial_number: string;
  latitude: number | null;
  longitude: number | null;
  height: number | null;
  altitude: number | null;
  v_hor: number | null;
  v_up: number | null;
  uav_type: string | null;
  app_lat: number | null;
  app_lon: number | null;
  app_alt: number | null;
  app_type: number | null;
  reg_code: string | null;
  angle: number | null;
  status: number | null;
  sys_type: number | null;
  weight: number | null;
  has_allowlist: boolean | null;
}

export interface DroneFlightSummaryRow {
  serial_number: string;
  first_seen: Date | null;
  last_seen: Date | null;
  message_count: number;
}

export interface VesselPositionRow {
  time: Date;
  mmsi: string;
  name: string | null;
  callsign: string | null;
  latitude: number | null;
  longitude: number | null;
  sog: number | null;
  cog: number | null;
  heading: number | null;
  nav_status: number | null;
  ship_type: number | null;
  destination: string | null;
  draft: number | null;
  length: number | null;
  width: number | null;
}

export interface VesselFlightSummaryRow {
  mmsi: string;
  first_seen: Date | null;
  last_seen: Date | null;
  message_count: number;
}

/**
 * Pivot each point (multiple field records collapse into one row per timestamp)
 * then reduce to a per-entity summary: points = message count, plus first/last
 * seen timestamps. `tag` is the entity tag column (icao/serial_number/mmsi).
 */
function summaryFlux(
  bucket: string,
  measurement: string,
  tag: string,
  from: Date,
  to: Date,
  limit: number,
): string {
  return [
    `from(bucket: "${escapeFlux(bucket)}")`,
    `  |> range(start: ${from.toISOString()}, stop: ${to.toISOString()})`,
    `  |> filter(fn: (r) => r._measurement == "${measurement}")`,
    `  |> group(columns: ["${tag}"])`,
    `  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")`,
    `  |> reduce(identity: {points: 0, first: 0, last: 0}, fn: (r, accumulator) => {`,
    `      t = uint(v: r._time)`,
    `      return {points: accumulator.points + 1, first: if accumulator.points == 0 then t else accumulator.first, last: t}`,
    `    })`,
    `  |> map(fn: (r) => ({r with first_seen: time(v: r.first), last_seen: time(v: r.last)}))`,
    `  |> group()`,
    `  |> sort(columns: ["last"], desc: true)`,
    `  |> limit(n: ${limit})`,
  ].join('\n');
}

function escapeFlux(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

@Injectable()
export class FlightsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FlightsService.name);
  private client: InfluxDB | null = null;
  private writeApi: WriteApi | null = null;
  private queryApi: QueryApi | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private buffer: AircraftState[] = [];
  private droneBuffer: DroneRidState[] = [];
  private vesselBuffer: VesselState[] = [];
  private enabled = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('INFLUX_URL');
    if (!url) {
      this.logger.warn('INFLUX_URL not set — persistence disabled (live-only)');
      return;
    }
    const token = this.config.get<string>('INFLUX_TOKEN') ?? '';
    const org = this.config.get<string>('INFLUX_ORG') ?? 'adsb';
    const bucket = this.config.get<string>('INFLUX_BUCKET') ?? 'adsb';
    try {
      this.client = new InfluxDB({ url, token });
      this.writeApi = this.client.getWriteApi(org, bucket, 'ms', {
        batchSize: FLUSH_BATCH_SIZE * 2,
        flushInterval: 60_000,
        maxRetries: 2,
        retryJitter: 250,
      });
      this.writeApi.useDefaultTags({ source: 'adsb-api' });
      this.queryApi = this.client.getQueryApi(org);
      this.enabled = true;
      this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
      this.logger.log(
        `InfluxDB ready: url=${url} org=${org} bucket=${bucket}`,
      );
    } catch (err) {
      this.logger.error(
        `InfluxDB init failed — persistence disabled: ${(err as Error).message}`,
      );
    }
  }

  onModuleDestroy(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushSync();
    void this.writeApi?.close().catch(() => undefined);
  }

  enqueue(state: AircraftState): void {
    if (!this.enabled) return;
    this.buffer.push(state);
    if (this.buffer.length >= FLUSH_BATCH_SIZE) this.flushSync();
  }

  enqueueDrone(state: DroneRidState): void {
    if (!this.enabled) return;
    this.droneBuffer.push(state);
    if (this.droneBuffer.length >= FLUSH_BATCH_SIZE) this.flushSync();
  }

  enqueueVessel(state: VesselState): void {
    if (!this.enabled) return;
    this.vesselBuffer.push(state);
    if (this.vesselBuffer.length >= FLUSH_BATCH_SIZE) this.flushSync();
  }

  async flush(): Promise<void> {
    await this.flushSync();
  }

  private async flushSync(): Promise<void> {
    if (
      !this.writeApi ||
      (this.buffer.length === 0 &&
        this.droneBuffer.length === 0 &&
        this.vesselBuffer.length === 0)
    )
      return;
    const points: Point[] = [];
    if (this.buffer.length > 0) {
      const states = this.buffer.splice(0);
      for (const s of states) {
        const p = new Point(MEASUREMENT_AIRCRAFT)
          .tag(TAG_ICAO, s.icao)
          .timestamp(new Date(s.lastUpdatedAt));
        if (s.callsign) p.stringField('callsign', s.callsign);
        if (isNum(s.lat)) p.floatField('latitude', s.lat!);
        if (isNum(s.lon)) p.floatField('longitude', s.lon!);
        if (isNum(s.altitude)) p.intField('altitude', s.altitude!);
        if (isNum(s.heading)) p.floatField('heading', s.heading!);
        if (isNum(s.speed)) p.floatField('speed', s.speed!);
        if (isNum(s.verticalRate)) p.intField('vertical_rate', s.verticalRate!);
        if (s.squawk) p.stringField('squawk', s.squawk);
        if (s.positionSource) p.stringField('position_source', s.positionSource);
        if (s.onGround !== undefined) p.booleanField('on_ground', s.onGround);
        points.push(p);
      }
    }
    if (this.droneBuffer.length > 0) {
      const drones = this.droneBuffer.splice(0);
      for (const d of drones) {
        const p = new Point(MEASUREMENT_DRONE)
          .tag(TAG_SERIAL, d.serial_number)
          .timestamp(new Date(d.lastUpdatedAt));
        if (isNum(d.latitude)) p.floatField('latitude', d.latitude!);
        if (isNum(d.longitude)) p.floatField('longitude', d.longitude!);
        if (isNum(d.height)) p.floatField('height', d.height!);
        if (isNum(d.altitude)) p.floatField('altitude', d.altitude!);
        if (isNum(d.v_hor)) p.floatField('v_hor', d.v_hor!);
        if (isNum(d.v_up)) p.floatField('v_up', d.v_up!);
        if (d.uav_type) p.stringField('uav_type', d.uav_type);
        if (isNum(d.app_lat)) p.floatField('app_lat', d.app_lat!);
        if (isNum(d.app_lon)) p.floatField('app_lon', d.app_lon!);
        if (isNum(d.app_alt)) p.floatField('app_alt', d.app_alt!);
        if (isNum(d.app_type)) p.intField('app_type', d.app_type!);
        if (d.reg_code) p.stringField('reg_code', d.reg_code);
        if (isNum(d.angle)) p.floatField('angle', d.angle!);
        if (isNum(d.status)) p.intField('status', d.status!);
        if (isNum(d.sys_type)) p.intField('sys_type', d.sys_type!);
        if (isNum(d.weight)) p.intField('weight', d.weight!);
        if (d.has_allowlist !== undefined)
          p.booleanField('has_allowlist', d.has_allowlist);
        points.push(p);
      }
    }
    if (this.vesselBuffer.length > 0) {
      const vessels = this.vesselBuffer.splice(0);
      for (const v of vessels) {
        const p = new Point(MEASUREMENT_VESSEL)
          .tag(TAG_MMSI, v.mmsi)
          .timestamp(new Date(v.lastUpdatedAt));
        if (v.name) p.stringField('name', v.name);
        if (v.callsign) p.stringField('callsign', v.callsign);
        if (isNum(v.latitude)) p.floatField('latitude', v.latitude!);
        if (isNum(v.longitude)) p.floatField('longitude', v.longitude!);
        if (isNum(v.sog)) p.floatField('sog', v.sog!);
        if (isNum(v.cog)) p.floatField('cog', v.cog!);
        if (isNum(v.heading)) p.floatField('heading', v.heading!);
        if (isNum(v.navStatus)) p.intField('nav_status', v.navStatus!);
        if (isNum(v.shipType)) p.intField('ship_type', v.shipType!);
        if (v.destination) p.stringField('destination', v.destination);
        if (isNum(v.draft)) p.floatField('draft', v.draft!);
        if (isNum(v.length)) p.floatField('length', v.length!);
        if (isNum(v.width)) p.floatField('width', v.width!);
        points.push(p);
      }
    }
    try {
      this.writeApi.writePoints(points);
      await this.writeApi.flush();
    } catch (err) {
      this.logger.error(
        `Batch flush failed (${points.length} points): ${(err as Error).message}`,
      );
    }
  }

  async queryPositions(
    icao: string,
    from: Date,
    to: Date,
  ): Promise<PositionRow[]> {
    if (!this.queryApi) return [];
    const rows: PositionRow[] = [];
    await this.runQuery(
      pivotFlux(
        this.bucket(),
        MEASUREMENT_AIRCRAFT,
        TAG_ICAO,
        icao,
        from,
        to,
      ),
      (o) => {
        rows.push({
          time: asDate(o._time),
          icao: asStr(o.icao) ?? '',
          callsign: asStr(o.callsign),
          latitude: asNum(o.latitude),
          longitude: asNum(o.longitude),
          altitude: asNum(o.altitude),
          heading: asNum(o.heading),
          speed: asNum(o.speed),
          vertical_rate: asNum(o.vertical_rate),
          squawk: asStr(o.squawk),
          position_source: asStr(o.position_source),
          on_ground: asBool(o.on_ground),
        });
      },
    );
    return rows;
  }

  async queryFlights(
    from: Date,
    to: Date,
    limit = 100,
  ): Promise<FlightSummaryRow[]> {
    if (!this.queryApi) return [];
    const rows: Array<Record<string, unknown>> = [];
    await this.runQuery(
      summaryFlux(
        this.bucket(),
        MEASUREMENT_AIRCRAFT,
        TAG_ICAO,
        from,
        to,
        limit,
      ),
      (o) => rows.push(o),
    );
    return rows.map((o) => ({
      icao: asStr(o.icao) ?? '',
      first_seen: o.first_seen ? new Date(o.first_seen as string) : null,
      last_seen: o.last_seen ? new Date(o.last_seen as string) : null,
      message_count: Number(o.points ?? 0),
    }));
  }

  async queryPositionCount(): Promise<number> {
    if (!this.queryApi) return 0;
    return this.runCount(MEASUREMENT_AIRCRAFT);
  }

  async queryDronePositions(
    serial: string,
    from: Date,
    to: Date,
  ): Promise<DronePositionRow[]> {
    if (!this.queryApi) return [];
    const rows: DronePositionRow[] = [];
    await this.runQuery(
      pivotFlux(
        this.bucket(),
        MEASUREMENT_DRONE,
        TAG_SERIAL,
        serial,
        from,
        to,
      ),
      (o) => {
        rows.push({
          time: asDate(o._time),
          serial_number: asStr(o.serial_number) ?? '',
          latitude: asNum(o.latitude),
          longitude: asNum(o.longitude),
          height: asNum(o.height),
          altitude: asNum(o.altitude),
          v_hor: asNum(o.v_hor),
          v_up: asNum(o.v_up),
          uav_type: asStr(o.uav_type),
          app_lat: asNum(o.app_lat),
          app_lon: asNum(o.app_lon),
          app_alt: asNum(o.app_alt),
          app_type: asNum(o.app_type),
          reg_code: asStr(o.reg_code),
          angle: asNum(o.angle),
          status: asNum(o.status),
          sys_type: asNum(o.sys_type),
          weight: asNum(o.weight),
          has_allowlist: asBool(o.has_allowlist),
        });
      },
    );
    return rows;
  }

  async queryDroneFlights(
    from: Date,
    to: Date,
    limit = 100,
  ): Promise<DroneFlightSummaryRow[]> {
    if (!this.queryApi) return [];
    const rows: Array<Record<string, unknown>> = [];
    await this.runQuery(
      summaryFlux(
        this.bucket(),
        MEASUREMENT_DRONE,
        TAG_SERIAL,
        from,
        to,
        limit,
      ),
      (o) => rows.push(o),
    );
    return rows.map((o) => ({
      serial_number: asStr(o.serial_number) ?? '',
      first_seen: o.first_seen ? new Date(o.first_seen as string) : null,
      last_seen: o.last_seen ? new Date(o.last_seen as string) : null,
      message_count: Number(o.points ?? 0),
    }));
  }

  async queryDronePositionCount(): Promise<number> {
    if (!this.queryApi) return 0;
    return this.runCount(MEASUREMENT_DRONE);
  }

  async queryVesselPositions(
    mmsi: string,
    from: Date,
    to: Date,
  ): Promise<VesselPositionRow[]> {
    if (!this.queryApi) return [];
    const rows: VesselPositionRow[] = [];
    await this.runQuery(
      pivotFlux(this.bucket(), MEASUREMENT_VESSEL, TAG_MMSI, mmsi, from, to),
      (o) => {
        rows.push({
          time: asDate(o._time),
          mmsi: asStr(o.mmsi) ?? '',
          name: asStr(o.name),
          callsign: asStr(o.callsign),
          latitude: asNum(o.latitude),
          longitude: asNum(o.longitude),
          sog: asNum(o.sog),
          cog: asNum(o.cog),
          heading: asNum(o.heading),
          nav_status: asNum(o.nav_status),
          ship_type: asNum(o.ship_type),
          destination: asStr(o.destination),
          draft: asNum(o.draft),
          length: asNum(o.length),
          width: asNum(o.width),
        });
      },
    );
    return rows;
  }

  async queryVesselFlights(
    from: Date,
    to: Date,
    limit = 100,
  ): Promise<VesselFlightSummaryRow[]> {
    if (!this.queryApi) return [];
    const rows: Array<Record<string, unknown>> = [];
    await this.runQuery(
      summaryFlux(this.bucket(), MEASUREMENT_VESSEL, TAG_MMSI, from, to, limit),
      (o) => rows.push(o),
    );
    return rows.map((o) => ({
      mmsi: asStr(o.mmsi) ?? '',
      first_seen: o.first_seen ? new Date(o.first_seen as string) : null,
      last_seen: o.last_seen ? new Date(o.last_seen as string) : null,
      message_count: Number(o.points ?? 0),
    }));
  }

  async queryVesselPositionCount(): Promise<number> {
    if (!this.queryApi) return 0;
    return this.runCount(MEASUREMENT_VESSEL);
  }

  private bucket(): string {
    return this.config.get<string>('INFLUX_BUCKET') ?? 'adsb';
  }

  private async runCount(measurement: string): Promise<number> {
    const flux =
      `from(bucket: "${escapeFlux(this.bucket())}")` +
      ` |> range(start: -1000y)` +
      ` |> filter(fn: (r) => r._measurement == "${measurement}")` +
      ` |> group()` +
      ` |> count()`;
    let total = 0;
    await this.runQuery(flux, (o) => {
      total += Number(o._value ?? 0);
    });
    return total;
  }

  private async runQuery(
    flux: string,
    onRow: (obj: Record<string, unknown>) => void,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.queryApi!.queryRows(flux, {
        next: (row, tableMeta) => onRow(tableMeta.toObject(row)),
        error: reject,
        complete: () => resolve(),
      });
    });
  }
}

function isNum(v: number | undefined | null): boolean {
  return v !== undefined && v !== null && Number.isFinite(v);
}

function asStr(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function asNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v === 'true';
  return null;
}

function asDate(v: unknown): Date {
  if (typeof v === 'string' && v.length > 0) return new Date(v);
  if (typeof v === 'number') return new Date(v);
  return new Date(0);
}

function pivotFlux(
  bucket: string,
  measurement: string,
  tag: string,
  entity: string,
  from: Date,
  to: Date,
): string {
  return [
    `from(bucket: "${escapeFlux(bucket)}")`,
    `  |> range(start: ${from.toISOString()}, stop: ${to.toISOString()})`,
    `  |> filter(fn: (r) => r._measurement == "${measurement}")`,
    `  |> filter(fn: (r) => r.${tag} == "${escapeFlux(entity)}")`,
    `  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")`,
    `  |> sort(columns: ["_time"])`,
  ].join('\n');
}
