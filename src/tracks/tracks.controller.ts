import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { TrackStoreService, type TrackSource } from './track-store.service.js';
import { TracksListResponseDto } from './tracks.dto.js';

@ApiTags('tracks')
@Controller('tracks')
export class TracksController {
  constructor(private readonly tracks: TrackStoreService) {}

  @Get()
  @ApiOperation({
    summary:
      'Live snapshot across all sensor sources (ADS-B + Drone Remote ID + AIS)',
  })
  @ApiQuery({
    name: 'source',
    required: false,
    enum: ['adsb', 'drone_rid', 'ais'],
    description: 'Filter to a single source',
  })
  @ApiOkResponse({
    type: TracksListResponseDto,
    description: 'Live track list',
  })
  @ApiBadRequestResponse({ description: 'Unknown source filter' })
  list(@Query('source') source?: string): TracksListResponseDto {
    const tracks = this.tracks.getAll(this.parseSource(source));
    return { count: tracks.length, tracks };
  }

  private parseSource(source?: string): TrackSource | undefined {
    if (source === undefined || source === '') return undefined;
    if (source === 'adsb' || source === 'drone_rid' || source === 'ais')
      return source;
    throw new BadRequestException(`Unknown source: ${source}`);
  }
}
