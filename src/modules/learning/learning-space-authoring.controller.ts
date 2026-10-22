import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import {
  CreateLearningSpaceDto,
  LearningSpaceDetailResponseDto,
  UpdateLearningSpaceDto,
} from './dto/learning-space-authoring.dto';
import { LearningSpaceAuthoringService } from './learning-space-authoring.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('learning')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/learning-spaces', version: '1' })
export class LearningSpaceAuthoringController {
  constructor(private readonly spaces: LearningSpaceAuthoringService) {}

  @Post()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'createLearningSpace',
    summary: 'Open the learning space for an offering',
    description:
      'One space per offering. A new space is unpublished unless `visible` says otherwise, so a course can be built before anybody sees it.',
  })
  @ApiCreatedResponse({ type: LearningSpaceDetailResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async create(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Body() dto: CreateLearningSpaceDto,
    @CurrentUser('id') userId: string,
  ): Promise<LearningSpaceDetailResponseDto> {
    return LearningSpaceDetailResponseDto.from(
      await this.spaces.create(institutionId, dto, userId),
    );
  }

  @Get(':spaceId')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'getLearningSpace',
    summary: 'One learning space',
    description: 'An unpublished space is not found for anybody who cannot publish it.',
  })
  @ApiOkResponse({ type: LearningSpaceDetailResponseDto })
  @ApiErrorResponses({ notFound: true })
  async findOne(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @CurrentUser('id') userId: string,
  ): Promise<LearningSpaceDetailResponseDto> {
    return LearningSpaceDetailResponseDto.from(
      await this.spaces.findOne(institutionId, spaceId, userId),
    );
  }

  @Patch(':spaceId')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'updateLearningSpace',
    summary: 'Rename a space, rewrite its summary, publish or unpublish it',
  })
  @ApiOkResponse({ type: LearningSpaceDetailResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async update(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Body() dto: UpdateLearningSpaceDto,
    @CurrentUser('id') userId: string,
  ): Promise<LearningSpaceDetailResponseDto> {
    return LearningSpaceDetailResponseDto.from(
      await this.spaces.update(institutionId, spaceId, dto, userId),
    );
  }
}
