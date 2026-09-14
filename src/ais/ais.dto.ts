import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VesselDto {
  @ApiProperty({ description: 'Maritime Mobile Service Identity (MMSI)', example: '211456000' })
  mmsi: string;

  @ApiPropertyOptional({ description: 'Vessel name', example: 'ATLANTIC PROMISE' })
  name?: string;

  @ApiPropertyOptional({ description: 'Radio callsign', example: 'DH721' })
  callsign?: string;

  @ApiPropertyOptional({ description: 'Numeric AIS ship type code', example: 70 })
  shipType?: number;

  @ApiPropertyOptional({ description: 'Description of ship type', example: 'Cargo' })
  shipTypeDescription?: string;

  @ApiPropertyOptional({ description: 'Current latitude (WGS84, deg)', example: 52.12345 })
  latitude?: number;

  @ApiPropertyOptional({ description: 'Current longitude (WGS84, deg)', example: 4.54321 })
  longitude?: number;

  @ApiPropertyOptional({ description: 'Speed Over Ground (knots)', example: 14.5 })
  sog?: number;

  @ApiPropertyOptional({ description: 'Course Over Ground (deg)', example: 82.0 })
  cog?: number;

  @ApiPropertyOptional({ description: 'True heading (deg)', example: 81 })
  heading?: number;

  @ApiPropertyOptional({ description: 'Numeric navigational status code', example: 0 })
  navStatus?: number;

  @ApiPropertyOptional({ description: 'Navigational status description', example: 'Under way using engine' })
  navStatusDescription?: string;

  @ApiPropertyOptional({ description: 'Voyage destination port', example: 'ROTTERDAM' })
  destination?: string;

  @ApiPropertyOptional({ description: 'Maximum static draught (m)', example: 10.2 })
  draft?: number;

  @ApiPropertyOptional({ description: 'Overall vessel length (m)', example: 220 })
  length?: number;

  @ApiPropertyOptional({ description: 'Vessel beam / width (m)', example: 32 })
  width?: number;

  @ApiProperty({ description: 'Unix timestamp (ms) of first sighting' })
  firstSeenAt: number;

  @ApiProperty({ description: 'Unix timestamp (ms) of latest message' })
  lastUpdatedAt: number;

  @ApiProperty({ description: 'True when no messages received for > staleAfterMs' })
  stale: boolean;
}

export class VesselsListResponseDto {
  @ApiProperty({ description: 'Number of active vessels' })
  count: number;

  @ApiProperty({ type: [VesselDto], description: 'List of tracked maritime vessels' })
  vessels: VesselDto[];
}
