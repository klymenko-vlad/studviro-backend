import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import {
  CourseOfferingAdminResponseDto,
  CourseOfferingListItemDto,
  CreateCourseOfferingDto,
} from './dto/catalogue.dto';
import { OfferingAdministrationService } from './offering-administration.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

/**
 * Sits apart from `OfferingAdministrationController`, which is mounted on
 * `course-offerings/:offeringId` and so cannot also serve the collection.
 */
@ApiTags('catalogue')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/course-offerings', version: '1' })
export class CourseOfferingsController {
  constructor(private readonly offerings: OfferingAdministrationService) {}

  @Get()
  @RequirePermission('offering:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listCourseOfferings',
    summary: 'Everything the institution has on offer, newest term first',
  })
  @ApiOkResponse({ type: CourseOfferingListItemDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
  ): Promise<CourseOfferingListItemDto[]> {
    const rows = await this.offerings.list(institutionId);

    return rows.map((row) => CourseOfferingListItemDto.from(row));
  }

  @Post()
  @RequirePermission('offering:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'createCourseOffering',
    summary: 'Put a course on in a term',
    description:
      'A course runs at most once in a term: a second attempt is a conflict, and two parallel groups are study groups rather than two offerings.',
  })
  @ApiCreatedResponse({ type: CourseOfferingAdminResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async create(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Body() dto: CreateCourseOfferingDto,
  ): Promise<CourseOfferingAdminResponseDto> {
    return CourseOfferingAdminResponseDto.fromEntity(
      await this.offerings.create(institutionId, dto),
    );
  }

  @Delete(':offeringId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('offering:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'removeCourseOffering',
    summary: 'Retire an offering nobody enrolled on',
    description:
      'An offering with enrolments is cancelled, not retired — the students’ record of having taken it has to survive.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true, conflict: true })
  async remove(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
  ): Promise<void> {
    await this.offerings.retire(institutionId, offeringId);
  }
}
