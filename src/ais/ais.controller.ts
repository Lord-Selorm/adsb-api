import {
  Controller,
  Get,
  NotFoundException,
  Param,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { VesselStoreService } from './vessel-store.service.js';
import { VesselDto, VesselsListResponseDto } from './ais.dto.js';

@ApiTags('vessels')
@Controller('vessels')
export class AisController {
  constructor(private readonly store: VesselStoreService) {}

  @Get()
  @ApiOperation({ summary: 'List all currently tracked maritime vessels' })
  @ApiOkResponse({
    type: VesselsListResponseDto,
    description: 'Active maritime tracks',
  })
  getAll(): VesselsListResponseDto {
    const vessels = this.store.getAll();
    return {
      count: vessels.length,
      vessels: vessels as VesselDto[],
    };
  }

  @Get(':mmsi')
  @ApiOperation({ summary: 'Get a single vessel by MMSI' })
  @ApiParam({
    name: 'mmsi',
    description: '9-digit Maritime Mobile Service Identity',
    example: '211456000',
  })
  @ApiOkResponse({ type: VesselDto, description: 'Vessel state' })
  @ApiNotFoundResponse({ description: 'Vessel not found in active store' })
  getOne(@Param('mmsi') mmsi: string): VesselDto {
    const vessel = this.store.get(mmsi);
    if (!vessel) {
      throw new NotFoundException(`Vessel MMSI ${mmsi} not found`);
    }
    return vessel as VesselDto;
  }
}
