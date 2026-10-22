import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { ExamRegistrantResponseDto, RecordExamAttendanceDto } from './dto/exam-attendance.dto';
import { ExamAttendanceService } from './exam-attendance.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('scheduling')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/course-offerings/:offeringId/exam-terms/:examTermId/registrations',
  version: '1',
})
export class ExamAttendanceController {
  constructor(private readonly attendance: ExamAttendanceService) {}

  @Get()
  @RequirePermission('grade:publish', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listExamTermRegistrants',
    summary: 'Who holds, or held, a seat on this exam term',
    description: 'A seat the student gave up, or that a called-off term released, is left out.',
  })
  @ApiOkResponse({ type: ExamRegistrantResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('examTermId', ParseUUIDPipe) examTermId: string,
  ): Promise<ExamRegistrantResponseDto[]> {
    const registrants = await this.attendance.list(institutionId, offeringId, examTermId);

    return registrants.map((registrant) => ExamRegistrantResponseDto.from(registrant));
  }

  @Put(':registrationId/attendance')
  @RequirePermission('grade:publish', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'recordExamAttendance',
    summary: 'Record whether a student sat the exam',
    description:
      'Only once the exam has started, and never on a term that was called off or a seat that was given up.',
  })
  @ApiOkResponse({ type: ExamRegistrantResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async record(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('examTermId', ParseUUIDPipe) examTermId: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Body() dto: RecordExamAttendanceDto,
    @CurrentUser('id') actorUserId: string,
  ): Promise<ExamRegistrantResponseDto> {
    const recorded = await this.attendance.record(
      institutionId,
      offeringId,
      examTermId,
      registrationId,
      dto.status,
      actorUserId,
    );

    return ExamRegistrantResponseDto.from(recorded);
  }
}
