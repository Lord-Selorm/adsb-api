import { index, integer, pgTable, text, timestamp, boolean, doublePrecision } from 'drizzle-orm/pg-core';

export const aircraftPositions = pgTable(
  'aircraft_positions',
  {
    time: timestamp('time', { withTimezone: true }).notNull(),
    icao: text('icao').notNull(),
    callsign: text('callsign'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    altitude: integer('altitude'),
    heading: doublePrecision('heading'),
    speed: doublePrecision('speed'),
    verticalRate: integer('vertical_rate'),
    squawk: text('squawk'),
    positionSource: text('position_source'),
    onGround: boolean('on_ground'),
  },
  (table) => [index('aircraft_positions_icao_time_idx').on(table.icao, table.time.desc())],
);

export type AircraftPositionRow = typeof aircraftPositions.$inferSelect;
export type AircraftPositionInsert = typeof aircraftPositions.$inferInsert;