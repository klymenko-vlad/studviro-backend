import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { WaitingStudentResponseDto } from './dto/waiting-student-response.dto';
import { OfferingWaitlistService } from './offering-waitlist.service';

@ApiTags('courses')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/course-offerings/:offeringId/waitlist',
  version: '1',
})
export class OfferingWaitlistController {
  constructor(private readonly waitlist: OfferingWaitlistService) {}

  @Get()
  @RequirePermission('enrollment:manage', { type: 'institution', param: 'institutionId' })
  @ApiOperation({
    operationId: 'listCourseWaitlist',
    summary: 'Who is queueing for a place on this offering, first come first served',
    description: 'Admit or refuse one with `correctEnrollment`, which tells the student.',
  })
  @ApiOkResponse({ type: WaitingStudentResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
  ): Promise<WaitingStudentResponseDto[]> {
    const waiting = await this.waitlist.list(institutionId, offeringId);

    return waiting.map((entry) => WaitingStudentResponseDto.from(entry));
  }
}
