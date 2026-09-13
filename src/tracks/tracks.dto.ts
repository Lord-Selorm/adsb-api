import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * One tracked object from any sensor source. `source` discriminates the
 * payload: ADS-B objects carry icao/callsign/altitude(feet), Drone RID
 * objects carry serial_number/latitude(deg)/longitude(deg)/height(m).
 * `altitude` units therefore depend on `source` (see field description).
 */
export class TrackDto {
  @ApiProperty({
    description: 'Sensor source of this track',
    enum: ['adsb', 'drone_rid'],
    example: 'drone_rid',
  })
  source: 'adsb' | 'drone_rid';

  @ApiProperty({
    description: 'adsb: lowercase ICAO hex; drone_rid: serial number',
    example: 'A1B2C3D4',
  })
  id: string;

  @ApiProperty({ description: 'Unix timestamp (ms) of first sighting' })
  firstSeenAt: number;

  @ApiProperty({ description: 'Unix timestamp (ms) of last message' })
  lastUpdatedAt: number;

  @ApiProperty({
    description:
      'True when no messages have arrived for longer than the source staleAfterMs',
  })
  stale: boolean;

  @ApiPropertyOptional({
    description: 'Unified latitude (deg) for combined plotting',
  })
  lat?: number;

  @ApiPropertyOptional({
    description: 'Unified longitude (deg) for combined plotting',
  })
  lon?: number;

  // --- ADS-B fields ---
  @ApiPropertyOptional({ description: 'Lowercase hex ICAO 24-bit address' })
  icao?: string;

  @ApiPropertyOptional({ description: 'Assigned callsign' })
  callsign?: string;

  @ApiPropertyOptional({
    description:
      'Altitude: feet for adsb, metres MSL for drone_rid (see source)',
  })
  altitude?: number;

  @ApiPropertyOptional({ description: 'Ground speed (kt, adsb only)' })
  speed?: number;

  @ApiPropertyOptional({ description: 'Heading (deg)' })
  heading?: number;

  @ApiPropertyOptional({ description: 'Vertical rate (ft/min, adsb only)' })
  verticalRate?: number;

  @ApiPropertyOptional({ description: 'On-ground flag (adsb only)' })
  onGround?: boolean;

  @ApiPropertyOptional({ description: 'Transponder squawk code (adsb only)' })
  squawk?: string;

  @ApiPropertyOptional({
    description:
      "'global' (13/17-bit pair) or 'local' (even/odd) CPR resolution",
    enum: ['global', 'local'],
  })
  positionSource?: 'global' | 'local';

  // --- Drone Remote ID (URM-01/02 frame_type 0x03) fields ---
  @ApiPropertyOptional({ description: 'Drone Remote ID serial number' })
  serial_number?: string;

  @ApiPropertyOptional({ description: 'Drone longitude (WGS84, deg)' })
  longitude?: number;

  @ApiPropertyOptional({ description: 'Drone latitude (WGS84, deg)' })
  latitude?: number;

  @ApiPropertyOptional({ description: 'Drone height above ground (m)' })
  height?: number;

  @ApiPropertyOptional({ description: 'Horizontal speed (m/s)' })
  v_hor?: number;

  @ApiPropertyOptional({ description: 'Vertical speed (m/s)' })
  v_up?: number;

  @ApiPropertyOptional({ description: 'Controller station latitude (deg)' })
  app_lat?: number;

  @ApiPropertyOptional({ description: 'Controller station longitude (deg)' })
  app_lon?: number;

  @ApiPropertyOptional({ description: 'Controller station altitude (m)' })
  app_alt?: number;

  @ApiPropertyOptional({
    description: '0 takeoff point, 1 controller station, 255 unknown',
    enum: [0, 1, 255],
  })
  app_type?: number;

  @ApiPropertyOptional({
    description: 'Drone type/model string',
    example: 'DJI Mini4Pro',
  })
  uav_type?: string;

  @ApiPropertyOptional({ description: 'Registration code (last 8 digits)' })
  reg_code?: string;

  @ApiPropertyOptional({ description: 'Heading angle (deg)' })
  angle?: number;

  @ApiPropertyOptional({
    description:
      '0 not reported, 1 on ground, 2 in air, 3 emergency, 4/5 RID tx failure, 255 unknown',
  })
  status?: number;

  @ApiPropertyOptional({
    description: '0 undefined, 1 open, 2 specific, 3 certified, 255 unknown',
  })
  sys_type?: number;

  @ApiPropertyOptional({
    description: '0 micro, 1 light, 2 small, 3 medium, 4 large, 255 unknown',
  })
  weight?: number;

  @ApiPropertyOptional({
    description: 'Drone Remote ID whitelist match (URM-01/02: always false)',
  })
  has_allowlist?: boolean;
}

export class TracksListResponseDto {
  @ApiProperty({ description: 'Number of tracks returned' })
  count: number;

  @ApiProperty({
    type: [TrackDto],
    description: 'Live state for every tracked object',
  })
  tracks: TrackDto[];
}
