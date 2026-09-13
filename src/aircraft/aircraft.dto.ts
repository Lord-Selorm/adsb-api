import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AircraftDto {
  @ApiProperty({
    description: 'Lowercase hex ICAO 24-bit address',
    example: '89630c',
  })
  icao: string;

  @ApiPropertyOptional({ description: 'Assigned callsign', example: 'GHF550' })
  callsign?: string;

  @ApiPropertyOptional({ description: 'Altitude (ft)', example: 37750 })
  altitude?: number;

  @ApiPropertyOptional({ description: 'Latitude (deg)', example: 5.54 })
  lat?: number;

  @ApiPropertyOptional({ description: 'Longitude (deg)', example: -0.2 })
  lon?: number;

  @ApiPropertyOptional({ description: 'Ground speed (kt)', example: 182 })
  speed?: number;

  @ApiPropertyOptional({ description: 'Heading (deg)', example: 259 })
  heading?: number;

  @ApiPropertyOptional({ description: 'Vertical rate (ft/min)', example: -832 })
  verticalRate?: number;

  @ApiPropertyOptional({ description: 'On-ground flag' })
  onGround?: boolean;

  @ApiPropertyOptional({ description: 'Transponder squawk code' })
  squawk?: string;

  @ApiPropertyOptional({
    description: "'global' (13/17-bit pair) or 'local' (even/odd) CPR resolution",
    enum: ['global', 'local'],
  })
  positionSource?: 'global' | 'local';

  @ApiProperty({ description: 'Unix timestamp (ms) of first sighting' })
  firstSeenAt: number;

  @ApiProperty({ description: 'Unix timestamp (ms) of last message' })
  lastUpdatedAt: number;

  @ApiProperty({
    description: 'True when no messages have arrived for longer than staleAfterMs',
  })
  stale: boolean;
}

export class AircraftListResponseDto {
  @ApiProperty({ description: 'Number of tracked aircraft' })
  count: number;

  @ApiProperty({
    type: [AircraftDto],
    description: 'Live state for every tracked aircraft',
  })
  aircraft: AircraftDto[];
}