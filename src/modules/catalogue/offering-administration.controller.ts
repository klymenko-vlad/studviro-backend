import { Body, Controller, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import {
  CorrectEnrollmentDto,
  CorrectedEnrollmentResponseDto,
  CourseOfferingAdminResponseDto,
  UpdateCourseOfferingDto,
} from './dto/catalogue.dto';
import { OfferingAdministrationService } from './offering-administration.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('catalogue')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/course-offerings/:offeringId', version: '1' })
export class OfferingAdministrationController {
  constructor(private readonly offerings: OfferingAdministrationService) {}

  @Patch()
  @RequirePermission('offering:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'updateCourseOffering',
    summary: 'Change an offering’s capacity, status or language',
    description:
      'Capacity may not be cut below the places already taken, because the count would then be a lie.',
  })
  @ApiOkResponse({ type: CourseOfferingAdminResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async update(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Body() dto: UpdateCourseOfferingDto,
  ): Promise<CourseOfferingAdminResponseDto> {
    return CourseOfferingAdminResponseDto.fromEntity(
      await this.offerings.update(institutionId, offeringId, dto),
    );
  }

  @Patch('enrollments/:enrollmentId')
  @RequirePermission('enrollment:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'correctEnrollment',
    summary: 'Put a student’s enrolment into the state it should be in',
    description:
      'The registrar’s correction verb, which is not bound by the window or the capacity a student is bound by.',
  })
  @ApiOkResponse({ type: CorrectedEnrollmentResponseDto })
  @ApiErrorResponses({ notFound: true })
  async correct(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Body() dto: CorrectEnrollmentDto,
    @CurrentUser('id') actorUserId: string,
  ): Promise<CorrectedEnrollmentResponseDto> {
    return CorrectedEnrollmentResponseDto.fromEntity(
      await this.offerings.correctEnrollment(
        institutionId,
        offeringId,
        enrollmentId,
        dto.status,
        actorUserId,
      ),
    );
  }
}
