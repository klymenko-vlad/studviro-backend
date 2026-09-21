import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
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
import { RequireFeature } from '../institutions/configuration/decorators/require-feature.decorator';

import { EnrollableOfferingResponseDto } from './dto/enrollable-offering-response.dto';
import { EnrollmentResponseDto } from './dto/enrollment-response.dto';
import { ListEnrollableOfferingsQueryDto } from './dto/list-enrollable-offerings-query.dto';
import { RequestEnrollmentDto } from './dto/request-enrollment.dto';
import { EnrollableOfferingsService } from './enrollable-offerings.service';
import { MyEnrollmentsService } from './my-enrollments.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('courses')
@ApiBearerAuth('access-token')
@RequireFeature('courseRegistration')
@Controller({ path: 'institutions/:institutionId/me/enrollments', version: '1' })
export class MyEnrollmentsController {
  constructor(
    private readonly offerings: EnrollableOfferingsService,
    private readonly enrollments: MyEnrollmentsService,
  ) {}

  @Get('enrollable')
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listEnrollableOfferings',
    summary: 'List the courses the caller may take, and say why not where they may not',
  })
  @ApiOkResponse({ type: EnrollableOfferingResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async findEnrollable(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListEnrollableOfferingsQueryDto,
  ): Promise<EnrollableOfferingResponseDto[]> {
    const offerings = await this.offerings.listFor(institutionId, userId, query.termId);

    return offerings.map((offering) => EnrollableOfferingResponseDto.from(offering));
  }

  @Post()
  @RequirePermission('course:enroll', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'requestEnrollment',
    summary: 'Ask for a place on a course',
    description:
      'Asking for a place is getting one: the enrolment comes back `active`. StudViro is the system of record, so there is nobody upstream to approve it. Refused with `OFFERING_FULL` when the last seat goes.',
  })
  @ApiCreatedResponse({ type: EnrollmentResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async request(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RequestEnrollmentDto,
  ): Promise<EnrollmentResponseDto> {
    return EnrollmentResponseDto.fromEntity(
      await this.enrollments.request(institutionId, userId, dto.courseOfferingId),
    );
  }

  @Delete(':id')
  @RequirePermission('course:enroll', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'withdrawFromCourse',
    summary: 'Withdraw from a course while the window is still open',
  })
  @ApiOkResponse({ type: EnrollmentResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async withdraw(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EnrollmentResponseDto> {
    return EnrollmentResponseDto.fromEntity(
      await this.enrollments.withdraw(institutionId, userId, id),
    );
  }
}
