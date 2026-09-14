import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  boolean,
  doublePrecision,
} from 'drizzle-orm/pg-core';

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
  (table) => [
    index('aircraft_positions_icao_time_idx').on(table.icao, table.time.desc()),
  ],
);

export const dronePositions = pgTable(
  'drone_positions',
  {
    time: timestamp('time', { withTimezone: true }).notNull(),
    serialNumber: text('serial_number').notNull(),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    height: doublePrecision('height'),
    altitude: doublePrecision('altitude'),
    vHor: doublePrecision('v_hor'),
    vUp: doublePrecision('v_up'),
    uavType: text('uav_type'),
    appLat: doublePrecision('app_lat'),
    appLon: doublePrecision('app_lon'),
    appAlt: doublePrecision('app_alt'),
    appType: integer('app_type'),
    regCode: text('reg_code'),
    angle: doublePrecision('angle'),
    status: integer('status'),
    sysType: integer('sys_type'),
    weight: integer('weight'),
    hasAllowlist: boolean('has_allowlist'),
  },
  (table) => [
    index('drone_positions_serial_time_idx').on(
      table.serialNumber,
      table.time.desc(),
    ),
  ],
);

export type DronePositionRow = typeof dronePositions.$inferSelect;
export type DronePositionInsert = typeof dronePositions.$inferInsert;

export type AircraftPositionRow = typeof aircraftPositions.$inferSelect;
export type AircraftPositionInsert = typeof aircraftPositions.$inferInsert;
