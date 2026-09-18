import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { RequireFeature } from '../institutions/configuration/decorators/require-feature.decorator';

import { OfferingResultsResponseDto } from './dto/offering-results-response.dto';
import { RecordGradeDto } from './dto/record-grade.dto';
import { RecordedGradeResponseDto } from './dto/recorded-grade-response.dto';
import { OfferingResultsService } from './offering-results.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('grades')
@ApiBearerAuth('access-token')
@RequireFeature('grades')
@Controller({
  path: 'institutions/:institutionId/course-offerings/:offeringId/results',
  version: '1',
})
export class OfferingResultsController {
  constructor(private readonly results: OfferingResultsService) {}

  @Get()
  @RequirePermission('grade:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listOfferingResults',
    summary: 'Read every recorded student of an offering with each attempt they hold',
    description:
      '`grade:read` alone is not enough: the caller must teach the offering or hold `offering:manage`, the same standing the roster asks for.',
  })
  @ApiOkResponse({ type: OfferingResultsResponseDto })
  @ApiErrorResponses({ notFound: true })
  async findAll(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @CurrentUser('id') userId: string,
  ): Promise<OfferingResultsResponseDto> {
    return OfferingResultsResponseDto.from(
      await this.results.findForViewer(institutionId, offeringId, userId),
    );
  }

  @Put(':enrollmentId')
  @RequirePermission('grade:propose', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'recordOfferingResult',
    summary: 'Propose a grade for one student, or publish one',
    description:
      'Proposing needs `grade:propose`; setting `officialGrade` needs `grade:publish` as well, checked separately so a teaching assistant may propose and may not publish. Publishing marks the student’s live seat on that course as attended, which is what spends the attempt.',
  })
  @ApiOkResponse({ type: RecordedGradeResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async record(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RecordGradeDto,
  ): Promise<RecordedGradeResponseDto> {
    return RecordedGradeResponseDto.fromEntity(
      await this.results.record(institutionId, offeringId, userId, {
        enrollmentId,
        attempt: dto.attempt ?? null,
        proposedGrade: dto.proposedGrade,
        officialGrade: dto.officialGrade,
        conflictNote: dto.conflictNote,
      }),
    );
  }
}
