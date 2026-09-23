/**
 * Measurement/tag column names used by FlightsService persistence + queries
 * and by the sensor registry descriptors. Single source of truth so a sensor
 * only declares WHICH bucket columns it owns, never their spelling.
 */
export const MEASUREMENT_AIRCRAFT = 'aircraft_positions';
export const MEASUREMENT_DRONE = 'drone_positions';
export const MEASUREMENT_VESSEL = 'vessel_positions';

export const TAG_ICAO = 'icao';
export const TAG_SERIAL = 'serial_number';
export const TAG_MMSI = 'mmsi';