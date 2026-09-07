import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import type { AircraftState } from '../aircraft/aircraft-store.service.js';

const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_BATCH_SIZE = 200;
// If the timescaledb extension isn't present (e.g. hosting on plain Postgres /
// Supabase / Neon), fall back to a plain table so time-series data is still saved.
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
const INSERT_SQL = `
  INSERT INTO aircraft_positions
    (time, icao, callsign, latitude, longitude, altitude, heading, speed, vertical_rate, squawk, position_source, on_ground)
  SELECT * FROM UNNEST($1::timestamptz[], $2::text[], $3::text[], $4::double precision[], $5::double precision[],
    $6::integer[], $7::double precision[], $8::double precision[], $9::integer[], $10::text[], $11::text[], $12::boolean[])
`;

export interface PositionRow {
  time: string;
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

@Injectable()
export class TimescaleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TimescaleService.name);
  private pool: Pool | null = null;
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
    this.pool = new Pool({ connectionString: url, max: 5 });
    try {
      const client = await this.pool.connect();
      try {
        await client.query(CREATE_TABLE_SQL);
        try {
          await client.query(CREATE_HYPERTABLE_SQL);
          this.logger.log('TimescaleDB hypertable ready');
        } catch {
          // timescaledb extension absent -> plain Postgres table (still time-series friendly).
          await client.query(CREATE_INDEX_SQL);
          this.logger.log('TimescaleDB extension not found — using plain Postgres table');
        }
      } finally {
        client.release();
      }
      this.enabled = true;
      this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    } catch (err) {
      this.logger.error(`Database init failed — persistence disabled: ${(err as Error).message}`);
      this.pool = null;
    }
  }

  onModuleDestroy(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushSync();
    this.pool?.end();
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
    if (!this.pool || this.buffer.length === 0) return;
    const rows = this.buffer.splice(0);
    try {
      const times: string[] = [];
      const icaos: string[] = [];
      const callsigns: (string | null)[] = [];
      const lats: (number | null)[] = [];
      const lons: (number | null)[] = [];
      const alts: (number | null)[] = [];
      const hdgs: (number | null)[] = [];
      const spds: (number | null)[] = [];
      const vrs: (number | null)[] = [];
      const squawks: (string | null)[] = [];
      const posSrcs: (string | null)[] = [];
      const grounds: (boolean | null)[] = [];

      for (const s of rows) {
        times.push(new Date(s.lastUpdatedAt).toISOString());
        icaos.push(s.icao);
        callsigns.push(s.callsign ?? null);
        lats.push(s.lat ?? null);
        lons.push(s.lon ?? null);
        alts.push(s.altitude ?? null);
        hdgs.push(s.heading ?? null);
        spds.push(s.speed ?? null);
        vrs.push(s.verticalRate ?? null);
        squawks.push(s.squawk ?? null);
        posSrcs.push(s.positionSource ?? null);
        grounds.push(s.onGround ?? null);
      }

      await this.pool.query(INSERT_SQL, [times, icaos, callsigns, lats, lons, alts, hdgs, spds, vrs, squawks, posSrcs, grounds]);
    } catch (err) {
      this.logger.error(`Batch insert failed (${rows.length} rows): ${(err as Error).message}`);
    }
  }

  async queryPositions(icao: string, from: Date, to: Date): Promise<PositionRow[]> {
    if (!this.pool) return [];
    const { rows } = await this.pool.query<PositionRow>(
      `SELECT * FROM aircraft_positions WHERE icao = $1 AND time >= $2 AND time <= $3 ORDER BY time`,
      [icao, from.toISOString(), to.toISOString()],
    );
    return rows;
  }

  async queryFlights(from: Date, to: Date, limit = 100): Promise<{ icao: string; first_seen: string; last_seen: string; message_count: bigint }[]> {
    if (!this.pool) return [];
    const { rows } = await this.pool.query(
      `SELECT icao, MIN(time) AS first_seen, MAX(time) AS last_seen, COUNT(*)::bigint AS message_count
       FROM aircraft_positions WHERE time >= $1 AND time <= $2
       GROUP BY icao ORDER BY last_seen DESC LIMIT $3`,
      [from.toISOString(), to.toISOString(), limit],
    );
    return rows;
  }

  async queryPositionCount(): Promise<number> {
    if (!this.pool) return 0;
    const { rows } = await this.pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM aircraft_positions');
    return Number(rows[0].count);
  }
}
