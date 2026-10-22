import { Body, Controller, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { MarkedSubmissionResponseDto, MarkSubmissionDto } from './dto/mark-submission.dto';
import { SubmissionMarkingService } from './submission-marking.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('learning')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/assignments/:assignmentId/submissions/:submissionId/mark',
  version: '1',
})
export class SubmissionMarkingController {
  constructor(private readonly marking: SubmissionMarkingService) {}

  @Put()
  @RequirePermission('grade:propose', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'markSubmission',
    summary: 'Give one submission points and feedback',
    description:
      'The mark lands on the assignment’s gradebook column as a working grade. Publishing an official course grade is a separate decision, made in the results screen with `grade:publish`.',
  })
  @ApiOkResponse({ type: MarkedSubmissionResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async mark(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: MarkSubmissionDto,
  ): Promise<MarkedSubmissionResponseDto> {
    return MarkedSubmissionResponseDto.from(
      await this.marking.mark(institutionId, assignmentId, submissionId, userId, dto),
    );
  }
}
