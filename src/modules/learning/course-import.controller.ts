import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
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

import { CourseImportSourcesService } from './course-import-sources.service';
import { CourseImportService } from './course-import.service';
import {
  CourseImportPreviewQueryDto,
  CourseImportReportDto,
  CourseImportRequestDto,
  ImportSourcePageResponseDto,
  ListImportSourcesQueryDto,
} from './dto/course-import.dto';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('learning')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/learning-spaces/:spaceId/import',
  version: '1',
})
export class CourseImportController {
  constructor(
    private readonly imports: CourseImportService,
    private readonly sources: CourseImportSourcesService,
  ) {}

  @Get('sources')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listCourseImportSources',
    summary: 'The other course pages an author may copy into this one, a page at a time',
    description:
      'Pages of offerings the caller teaches (every page of the institution for whoever administers offerings), other offerings of the same course first, then the latest term first. Filtered by page name, course code or title, or term.',
  })
  @ApiOkResponse({ type: ImportSourcePageResponseDto })
  @ApiErrorResponses({ notFound: true })
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListImportSourcesQueryDto,
  ): Promise<ImportSourcePageResponseDto> {
    return ImportSourcePageResponseDto.from(
      await this.sources.page(institutionId, spaceId, userId, query),
    );
  }

  @Get('preview')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'previewCourseImport',
    summary: 'What importing another course page would copy, and how far its dates move',
    description:
      'Exactly the report the import would give, with nothing written. For whoever authors both pages.',
  })
  @ApiOkResponse({ type: CourseImportReportDto })
  @ApiErrorResponses({ notFound: true })
  async preview(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @CurrentUser('id') userId: string,
    @Query() query: CourseImportPreviewQueryDto,
  ): Promise<CourseImportReportDto> {
    return CourseImportReportDto.from(
      await this.imports.preview({
        institutionId,
        spaceId,
        userId,
        fromSpaceId: query.from,
        visibility: query.visibility,
      }),
    );
  }

  @Post()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'importCourse',
    summary: 'Copy another course page’s outline into this one',
    description:
      'Sections, materials and their files, assignments, quizzes and the question bank are copied after what this page already holds, with every date moved by the gap between the two terms’ starts. Nothing a student did is copied. For whoever authors both pages.',
  })
  @ApiCreatedResponse({ type: CourseImportReportDto })
  @ApiErrorResponses({ notFound: true })
  async run(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CourseImportRequestDto,
  ): Promise<CourseImportReportDto> {
    return CourseImportReportDto.from(
      await this.imports.run({
        institutionId,
        spaceId,
        userId,
        fromSpaceId: dto.from,
        visibility: dto.visibility,
      }),
    );
  }
}
