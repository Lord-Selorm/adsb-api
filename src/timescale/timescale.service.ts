import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, count, desc, eq, gte, lte, max, min, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { AircraftState } from '../aircraft/aircraft-store.service.js';
import { aircraftPositions, type AircraftPositionInsert } from './schema.js';

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

type Db = NodePgDatabase<{ aircraftPositions: typeof aircraftPositions }>;

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

@Injectable()
export class TimescaleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TimescaleService.name);
  private pool: Pool | null = null;
  private db: Db | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private buffer: AircraftState[] = [];
  private enabled = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('DATABASE_URL');
    if (!url) {
      this.logger.warn('DATABASE_URL not set — persistence disabled (live-only)');
      return;
    }
    const pool = new Pool({ connectionString: url, max: 5 });
    const db = drizzle(pool, { schema: { aircraftPositions } });
    try {
      const client = await pool.connect();
      try {
        await client.query(CREATE_TABLE_SQL);
        try {
          await client.query(CREATE_HYPERTABLE_SQL);
          this.logger.log('TimescaleDB hypertable ready');
        } catch {
          // timescaledb extension absent -> plain Postgres table (still time-series friendly).
          this.logger.log('TimescaleDB extension not found — using plain Postgres table');
        }
        await client.query(CREATE_INDEX_SQL);
      } finally {
        client.release();
      }
      this.pool = pool;
      this.db = db;
      this.enabled = true;
      this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    } catch (err) {
      this.logger.error(`Database init failed — persistence disabled: ${(err as Error).message}`);
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

  async flush(): Promise<void> {
    await this.flushSync();
  }

  private async flushSync(): Promise<void> {
    if (!this.db || this.buffer.length === 0) return;
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
      this.logger.error(`Batch insert failed (${states.length} rows): ${(err as Error).message}`);
    }
  }

  async queryPositions(icao: string, from: Date, to: Date): Promise<PositionRow[]> {
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
      .where(and(eq(aircraftPositions.icao, icao), gte(aircraftPositions.time, from), lte(aircraftPositions.time, to)))
      .orderBy(asc(aircraftPositions.time));
    return rows;
  }

  async queryFlights(from: Date, to: Date, limit = 100): Promise<FlightSummaryRow[]> {
    if (!this.db) return [];
    const rows = await this.db
      .select({
        icao: aircraftPositions.icao,
        first_seen: min(aircraftPositions.time),
        last_seen: max(aircraftPositions.time),
        message_count: count(aircraftPositions).mapWith(Number),
      })
      .from(aircraftPositions)
      .where(and(gte(aircraftPositions.time, from), lte(aircraftPositions.time, to)))
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

  /** Direct access to the Drizzle database for raw time-series queries. */
  get database(): { db: Db | null; pool: Pool | null; sql: typeof sql } {
    return { db: this.db, pool: this.pool, sql };
  }
}