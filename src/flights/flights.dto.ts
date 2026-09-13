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