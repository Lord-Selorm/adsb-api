import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { DataSourceKind } from '../common/data-source.interface.js';

export class HealthStatusDto {
  @ApiProperty({ description: 'Always "ok" when the process is alive' })
  status: string;

  @ApiProperty({ description: 'Process uptime in seconds' })
  uptimeSeconds: number;

  @ApiProperty({
    description: 'Active ingress transport',
    enum: ['serial', 'mock', 'tcp', 'udp'],
  })
  source: DataSourceKind;

  @ApiProperty({
    description: 'Number of aircraft currently tracked in memory',
  })
  trackedAircraft: number;

  @ApiProperty({
    description: 'Malformed frames seen by the decoder (decode quality signal)',
  })
  malformedMessageCount: number;

  @ApiProperty({ description: 'Seconds since the last received message' })
  secondsSinceLastMessage: number;

  @ApiProperty({ description: 'Transport connection status' })
  connectionStatus: string;

  @ApiPropertyOptional({
    description: 'Drone Remote ID ingress transport kind',
  })
  ridSource?: DataSourceKind;

  @ApiPropertyOptional({ description: 'Drone Remote ID connection status' })
  ridConnectionStatus?: string;

  @ApiPropertyOptional({
    description: 'Seconds since the last Drone Remote ID message',
  })
  ridSecondsSinceLastMessage?: number;

  @ApiPropertyOptional({
    description: 'Number of drones currently tracked in memory',
  })
  trackedDrones?: number;
}
