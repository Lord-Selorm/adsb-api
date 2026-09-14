import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  lte,
  max,
  min,
  sql,
} from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { AircraftState } from '../aircraft/aircraft-store.service.js';
import type { DroneRidState } from '../rid/drone-rid-store.service.js';
import {
  aircraftPositions,
  dronePositions,
  type AircraftPositionInsert,
  type DronePositionInsert,
} from './schema.js';

const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_BATCH_SIZE = 200;
// If the timescaledb extension isn't present, fall back to a plain table so
// time-series data is still saved.
const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS aircraft_positions (
    time            TIMESTAMPTZ NOT NULL,
    icao            TEXT        NOT NULL,
    callsign        TEXT,
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    altitude        INTEGER,
    heading         DOUBLE PRECISION,
    speed           DOUBLE PRECISION,
    vertical_rate   INTEGER,
    squawk          TEXT,
    position_source TEXT,
    on_ground       BOOLEAN
  );
`;
const CREATE_HYPERTABLE_SQL = `SELECT create_hypertable('aircraft_positions', 'time', if_not_exists => TRUE);`;
const CREATE_INDEX_SQL = `CREATE INDEX IF NOT EXISTS aircraft_positions_icao_time_idx ON aircraft_positions (icao, time DESC);`;

const CREATE_DRONE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS drone_positions (
    time            TIMESTAMPTZ NOT NULL,
    serial_number   TEXT        NOT NULL,
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    height          DOUBLE PRECISION,
    altitude        DOUBLE PRECISION,
    v_hor           DOUBLE PRECISION,
    v_up            DOUBLE PRECISION,
    uav_type        TEXT,
    app_lat         DOUBLE PRECISION,
    app_lon         DOUBLE PRECISION,
    app_alt         DOUBLE PRECISION,
    app_type        INTEGER,
    reg_code        TEXT,
    angle           DOUBLE PRECISION,
    status          INTEGER,
    sys_type        INTEGER,
    weight          INTEGER,
    has_allowlist   BOOLEAN
  );
`;
const CREATE_DRONE_HYPERTABLE_SQL = `SELECT create_hypertable('drone_positions', 'time', if_not_exists => TRUE);`;
const CREATE_DRONE_INDEX_SQL = `CREATE INDEX IF NOT EXISTS drone_positions_serial_time_idx ON drone_positions (serial_number, time DESC);`;

type Db = NodePgDatabase<{
  aircraftPositions: typeof aircraftPositions;
  dronePositions: typeof dronePositions;
}>;

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

@Injectable()
export class FlightsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FlightsService.name);
  private pool: Pool | null = null;
  private db: Db | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private buffer: AircraftState[] = [];
  private droneBuffer: DroneRidState[] = [];
  private enabled = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('DATABASE_URL');
    if (!url) {
      this.logger.warn(
        'DATABASE_URL not set — persistence disabled (live-only)',
      );
      return;
    }
    const pool = new Pool({ connectionString: url, max: 5 });
    const db = drizzle(pool, {
      schema: { aircraftPositions, dronePositions },
    });
    try {
      const client = await pool.connect();
      try {
        await client.query(CREATE_TABLE_SQL);
        try {
          await client.query(CREATE_HYPERTABLE_SQL);
          this.logger.log('TimescaleDB hypertable ready');
        } catch {
          // timescaledb extension absent -> plain Postgres table (still time-series friendly).
          this.logger.log(
            'TimescaleDB extension not found — using plain Postgres table',
          );
        }
        await client.query(CREATE_INDEX_SQL);

        await client.query(CREATE_DRONE_TABLE_SQL);
        try {
          await client.query(CREATE_DRONE_HYPERTABLE_SQL);
          this.logger.log('TimescaleDB drone hypertable ready');
        } catch {
          this.logger.log(
            'TimescaleDB extension not found — drone table uses plain Postgres',
          );
        }
        await client.query(CREATE_DRONE_INDEX_SQL);
      } finally {
        client.release();
      }
      this.pool = pool;
      this.db = db;
      this.enabled = true;
      this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    } catch (err) {
      this.logger.error(
        `Database init failed — persistence disabled: ${(err as Error).message}`,
      );
      await pool.end().catch(() => undefined);
    }
  }

  onModuleDestroy(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushSync();
    void this.pool?.end().catch(() => undefined);
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

  async flush(): Promise<void> {
    await this.flushSync();
  }

  private async flushSync(): Promise<void> {
    if (!this.db || (this.buffer.length === 0 && this.droneBuffer.length === 0))
      return;
    if (this.buffer.length > 0) {
      const states = this.buffer.splice(0);
      try {
        const rows: AircraftPositionInsert[] = states.map((s) => ({
          time: new Date(s.lastUpdatedAt),
          icao: s.icao,
          callsign: s.callsign ?? null,
          latitude: s.lat ?? null,
          longitude: s.lon ?? null,
          altitude: s.altitude ?? null,
          heading: s.heading ?? null,
          speed: s.speed ?? null,
          verticalRate: s.verticalRate ?? null,
          squawk: s.squawk ?? null,
          positionSource: s.positionSource ?? null,
          onGround: s.onGround ?? null,
        }));
        await this.db.insert(aircraftPositions).values(rows);
      } catch (err) {
        this.logger.error(
          `Batch insert failed (${states.length} rows): ${(err as Error).message}`,
        );
      }
    }
    if (this.droneBuffer.length > 0) {
      const drones = this.droneBuffer.splice(0);
      try {
        const rows: DronePositionInsert[] = drones.map((d) => ({
          time: new Date(d.lastUpdatedAt),
          serialNumber: d.serial_number,
          latitude: d.latitude ?? null,
          longitude: d.longitude ?? null,
          height: d.height ?? null,
          altitude: d.altitude ?? null,
          vHor: d.v_hor ?? null,
          vUp: d.v_up ?? null,
          uavType: d.uav_type ?? null,
          appLat: d.app_lat ?? null,
          appLon: d.app_lon ?? null,
          appAlt: d.app_alt ?? null,
          appType: d.app_type ?? null,
          regCode: d.reg_code ?? null,
          angle: d.angle ?? null,
          status: d.status ?? null,
          sysType: d.sys_type ?? null,
          weight: d.weight ?? null,
          hasAllowlist: d.has_allowlist ?? null,
        }));
        await this.db.insert(dronePositions).values(rows);
      } catch (err) {
        this.logger.error(
          `Batch insert failed (${drones.length} drone rows): ${(err as Error).message}`,
        );
      }
    }
  }

  async queryPositions(
    icao: string,
    from: Date,
    to: Date,
  ): Promise<PositionRow[]> {
    if (!this.db) return [];
    const rows = await this.db
      .select({
        time: aircraftPositions.time,
        icao: aircraftPositions.icao,
        callsign: aircraftPositions.callsign,
        latitude: aircraftPositions.latitude,
        longitude: aircraftPositions.longitude,
        altitude: aircraftPositions.altitude,
        heading: aircraftPositions.heading,
        speed: aircraftPositions.speed,
        vertical_rate: aircraftPositions.verticalRate,
        position_source: aircraftPositions.positionSource,
        squawk: aircraftPositions.squawk,
        on_ground: aircraftPositions.onGround,
      })
      .from(aircraftPositions)
      .where(
        and(
          eq(aircraftPositions.icao, icao),
          gte(aircraftPositions.time, from),
          lte(aircraftPositions.time, to),
        ),
      )
      .orderBy(asc(aircraftPositions.time));
    return rows;
  }

  async queryFlights(
    from: Date,
    to: Date,
    limit = 100,
  ): Promise<FlightSummaryRow[]> {
    if (!this.db) return [];
    const rows = await this.db
      .select({
        icao: aircraftPositions.icao,
        first_seen: min(aircraftPositions.time),
        last_seen: max(aircraftPositions.time),
        message_count: count(aircraftPositions).mapWith(Number),
      })
      .from(aircraftPositions)
      .where(
        and(gte(aircraftPositions.time, from), lte(aircraftPositions.time, to)),
      )
      .groupBy(aircraftPositions.icao)
      .orderBy(desc(max(aircraftPositions.time)))
      .limit(limit);
    return rows;
  }

  async queryPositionCount(): Promise<number> {
    if (!this.db) return 0;
    const [{ count: total }] = await this.db
      .select({ count: count().mapWith(Number) })
      .from(aircraftPositions);
    return total;
  }

  async queryDronePositions(
    serial: string,
    from: Date,
    to: Date,
  ): Promise<DronePositionRow[]> {
    if (!this.db) return [];
    const rows = await this.db
      .select({
        time: dronePositions.time,
        serial_number: dronePositions.serialNumber,
        latitude: dronePositions.latitude,
        longitude: dronePositions.longitude,
        height: dronePositions.height,
        altitude: dronePositions.altitude,
        v_hor: dronePositions.vHor,
        v_up: dronePositions.vUp,
        uav_type: dronePositions.uavType,
        app_lat: dronePositions.appLat,
        app_lon: dronePositions.appLon,
        app_alt: dronePositions.appAlt,
        app_type: dronePositions.appType,
        reg_code: dronePositions.regCode,
        angle: dronePositions.angle,
        status: dronePositions.status,
        sys_type: dronePositions.sysType,
        weight: dronePositions.weight,
        has_allowlist: dronePositions.hasAllowlist,
      })
      .from(dronePositions)
      .where(
        and(
          eq(dronePositions.serialNumber, serial),
          gte(dronePositions.time, from),
          lte(dronePositions.time, to),
        ),
      )
      .orderBy(asc(dronePositions.time));
    return rows;
  }

  async queryDroneFlights(
    from: Date,
    to: Date,
    limit = 100,
  ): Promise<DroneFlightSummaryRow[]> {
    if (!this.db) return [];
    const rows = await this.db
      .select({
        serial_number: dronePositions.serialNumber,
        first_seen: min(dronePositions.time),
        last_seen: max(dronePositions.time),
        message_count: count(dronePositions).mapWith(Number),
      })
      .from(dronePositions)
      .where(
        and(gte(dronePositions.time, from), lte(dronePositions.time, to)),
      )
      .groupBy(dronePositions.serialNumber)
      .orderBy(desc(max(dronePositions.time)))
      .limit(limit);
    return rows;
  }

  async queryDronePositionCount(): Promise<number> {
    if (!this.db) return 0;
    const [{ count: total }] = await this.db
      .select({ count: count().mapWith(Number) })
      .from(dronePositions);
    return total;
  }

  /** Direct access to the Drizzle database for raw time-series queries. */
  get database(): { db: Db | null; pool: Pool | null; sql: typeof sql } {
    return { db: this.db, pool: this.pool, sql };
  }
}
