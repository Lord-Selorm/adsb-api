import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PositionDto {
  @ApiProperty({ description: 'Time the position was stored (UTC)' })
  time: Date;

  @ApiProperty({ description: 'Lowercase hex ICAO 24-bit address' })
  icao: string;

  @ApiPropertyOptional({ description: 'Assigned callsign', nullable: true })
  callsign?: string | null;

  @ApiPropertyOptional({ description: 'Latitude (deg)', nullable: true })
  latitude?: number | null;

  @ApiPropertyOptional({ description: 'Longitude (deg)', nullable: true })
  longitude?: number | null;

  @ApiPropertyOptional({ description: 'Altitude (ft)', nullable: true })
  altitude?: number | null;

  @ApiPropertyOptional({ description: 'Heading (deg)', nullable: true })
  heading?: number | null;

  @ApiPropertyOptional({ description: 'Ground speed (kt)', nullable: true })
  speed?: number | null;

  @ApiPropertyOptional({ description: 'Vertical rate (ft/min)', nullable: true })
  vertical_rate?: number | null;

  @ApiPropertyOptional({ description: 'Transponder squawk code', nullable: true })
  squawk?: string | null;

  @ApiPropertyOptional({
    description: "'global' or 'local' CPR resolution",
    nullable: true,
  })
  position_source?: string | null;

  @ApiPropertyOptional({ description: 'On-ground flag', nullable: true })
  on_ground?: boolean | null;
}

export class FlightSummaryDto {
  @ApiProperty({ description: 'Lowercase hex ICAO 24-bit address' })
  icao: string;

  @ApiPropertyOptional({ description: 'First message time (UTC)', nullable: true })
  first_seen?: Date | null;

  @ApiPropertyOptional({ description: 'Last message time (UTC)', nullable: true })
  last_seen?: Date | null;

  @ApiProperty({ description: 'Number of stored messages for this aircraft' })
  message_count: number;
}

export class DronePositionDto {
  @ApiProperty({ description: 'Time the position was stored (UTC)' })
  time: Date;

  @ApiProperty({ description: 'Drone serial number (Remote ID)' })
  serial_number: string;

  @ApiPropertyOptional({ description: 'Latitude (deg, WGS84)', nullable: true })
  latitude?: number | null;

  @ApiPropertyOptional({ description: 'Longitude (deg, WGS84)', nullable: true })
  longitude?: number | null;

  @ApiPropertyOptional({ description: 'Height above ground (m)', nullable: true })
  height?: number | null;

  @ApiPropertyOptional({
    description: 'Altitude above mean sea level (m)',
    nullable: true,
  })
  altitude?: number | null;

  @ApiPropertyOptional({ description: 'Horizontal speed (m/s)', nullable: true })
  v_hor?: number | null;

  @ApiPropertyOptional({ description: 'Vertical speed (m/s)', nullable: true })
  v_up?: number | null;

  @ApiPropertyOptional({ description: 'Reported drone model', nullable: true })
  uav_type?: string | null;

  @ApiPropertyOptional({
    description: 'Pilot/controller longitude (deg)',
    nullable: true,
  })
  app_lon?: number | null;

  @ApiPropertyOptional({
    description: 'Pilot/controller latitude (deg)',
    nullable: true,
  })
  app_lat?: number | null;

  @ApiPropertyOptional({
    description: 'Pilot/controller altitude (m)',
    nullable: true,
  })
  app_alt?: number | null;

  @ApiPropertyOptional({
    description: 'Controller station type (0 takeoff point, 1 controller)',
    nullable: true,
  })
  app_type?: number | null;

  @ApiPropertyOptional({
    description: 'Registration code (last 8 digits)',
    nullable: true,
  })
  reg_code?: string | null;

  @ApiPropertyOptional({ description: 'Heading angle (deg)', nullable: true })
  angle?: number | null;

  @ApiPropertyOptional({ description: 'Drone RID status code', nullable: true })
  status?: number | null;

  @ApiPropertyOptional({
    description: 'Aviation operation category (0-3, 255 unknown)',
    nullable: true,
  })
  sys_type?: number | null;

  @ApiPropertyOptional({
    description: 'Aircraft classification (0-4, 255 unknown)',
    nullable: true,
  })
  weight?: number | null;

  @ApiPropertyOptional({
    description: 'Whitelist / allowlist match',
    nullable: true,
  })
  has_allowlist?: boolean | null;
}

export class DroneFlightSummaryDto {
  @ApiProperty({ description: 'Drone serial number (Remote ID)' })
  serial_number: string;

  @ApiPropertyOptional({ description: 'First message time (UTC)', nullable: true })
  first_seen?: Date | null;

  @ApiPropertyOptional({ description: 'Last message time (UTC)', nullable: true })
  last_seen?: Date | null;

  @ApiProperty({ description: 'Number of stored positions for this drone' })
  message_count: number;
}

export class VesselPositionDto {
  @ApiProperty({ description: 'Time the position was stored (UTC)' })
  time: Date;

  @ApiProperty({ description: 'Maritime Mobile Service Identity (9 digits)' })
  mmsi: string;

  @ApiPropertyOptional({ description: 'Vessel name', nullable: true })
  name?: string | null;

  @ApiPropertyOptional({ description: 'Callsign', nullable: true })
  callsign?: string | null;

  @ApiPropertyOptional({ description: 'Latitude (deg, WGS84)', nullable: true })
  latitude?: number | null;

  @ApiPropertyOptional({ description: 'Longitude (deg, WGS84)', nullable: true })
  longitude?: number | null;

  @ApiPropertyOptional({
    description: 'Speed over ground (kt)',
    nullable: true,
  })
  sog?: number | null;

  @ApiPropertyOptional({
    description: 'Course over ground (deg)',
    nullable: true,
  })
  cog?: number | null;

  @ApiPropertyOptional({ description: 'True heading (deg)', nullable: true })
  heading?: number | null;

  @ApiPropertyOptional({ description: 'Navigation status code', nullable: true })
  nav_status?: number | null;

  @ApiPropertyOptional({ description: 'Ship type code', nullable: true })
  ship_type?: number | null;

  @ApiPropertyOptional({ description: 'Destination', nullable: true })
  destination?: string | null;

  @ApiPropertyOptional({ description: 'Draft (m)', nullable: true })
  draft?: number | null;

  @ApiPropertyOptional({ description: 'Length (m)', nullable: true })
  length?: number | null;

  @ApiPropertyOptional({ description: 'Width (m)', nullable: true })
  width?: number | null;
}

export class VesselFlightSummaryDto {
  @ApiProperty({ description: 'Maritime Mobile Service Identity (9 digits)' })
  mmsi: string;

  @ApiPropertyOptional({ description: 'First message time (UTC)', nullable: true })
  first_seen?: Date | null;

  @ApiPropertyOptional({ description: 'Last message time (UTC)', nullable: true })
  last_seen?: Date | null;

  @ApiProperty({ description: 'Number of stored positions for this vessel' })
  message_count: number;
}