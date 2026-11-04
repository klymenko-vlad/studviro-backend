import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import {
  CreateLearningSectionDto,
  LearningSectionResponseDto,
  UpdateLearningSectionDto,
} from './dto/learning-section.dto';
import { LearningSectionsService } from './learning-sections.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('learning')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/learning-spaces/:spaceId/sections',
  version: '1',
})
export class LearningSectionsController {
  constructor(private readonly sections: LearningSectionsService) {}

  @Get()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listLearningSections',
    summary: 'The sections of a course page, in order',
    description:
      'A hidden or ended section is omitted for anybody who cannot unhide it, and so is everything placed in it. One that has not opened yet shows only its title, unless it is hidden until then.',
  })
  @ApiOkResponse({ type: LearningSectionResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @CurrentUser('id') userId: string,
  ): Promise<LearningSectionResponseDto[]> {
    const sections = await this.sections.list(institutionId, spaceId, userId);

    return sections.map((section) => LearningSectionResponseDto.from(section));
  }

  @Post()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'createLearningSection',
    summary: 'Add a section — a week or a topic — at the end of the page',
  })
  @ApiCreatedResponse({ type: LearningSectionResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async create(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateLearningSectionDto,
  ): Promise<LearningSectionResponseDto> {
    return LearningSectionResponseDto.from(
      await this.sections.create(institutionId, spaceId, userId, dto),
    );
  }

  @Patch(':sectionId')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'updateLearningSection',
    summary: 'Retitle a section, move it, hide or show it',
  })
  @ApiOkResponse({ type: LearningSectionResponseDto })
  @ApiErrorResponses({ notFound: true })
  async update(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateLearningSectionDto,
  ): Promise<LearningSectionResponseDto> {
    return LearningSectionResponseDto.from(
      await this.sections.update(institutionId, spaceId, sectionId, userId, dto),
    );
  }

  @Delete(':sectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'removeLearningSection',
    summary: 'Remove a section, keeping what was in it',
    description: 'Its materials and assignments move to the end of the general area.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true })
  async remove(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    await this.sections.remove(institutionId, spaceId, sectionId, userId);
  }
}
