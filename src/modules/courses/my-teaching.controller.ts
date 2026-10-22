import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { ListMyTeachingQueryDto } from './dto/list-my-teaching-query.dto';
import { TeachingOfferingResponseDto } from './dto/teaching-offering-response.dto';
import { MyTeachingService } from './my-teaching.service';

@ApiTags('courses')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/me/teaching-offerings', version: '1' })
export class MyTeachingController {
  constructor(private readonly myTeaching: MyTeachingService) {}

  @Get()
  @RequirePermission('offering:read', { type: 'institution', param: 'institutionId' })
  @ApiOperation({
    operationId: 'listMyTeachingOfferings',
    summary: 'List the course offerings the current user teaches in an institution',
  })
  @ApiOkResponse({ type: TeachingOfferingResponseDto, isArray: true })
  @ApiErrorResponses()
  async findMine(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListMyTeachingQueryDto,
  ): Promise<TeachingOfferingResponseDto[]> {
    const teaching = await this.myTeaching.listTeaching(institutionId, userId, query);

    return teaching.map((offering) =>
      TeachingOfferingResponseDto.fromTeachingOffering(offering),
    );
  }
}
