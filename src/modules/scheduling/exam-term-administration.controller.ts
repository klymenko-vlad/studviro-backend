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
  CreateExamTermDto,
  ExamTermAdminResponseDto,
  ExamTermRefDto,
  UpdateExamTermDto,
} from './dto/exam-term-administration.dto';
import { ExamTermAdministrationService } from './exam-term-administration.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('scheduling')
@ApiBearerAuth('access-token')
@Controller({
  path: 'institutions/:institutionId/course-offerings/:offeringId/exam-terms',
  version: '1',
})
export class ExamTermAdministrationController {
  constructor(private readonly examTerms: ExamTermAdministrationService) {}

  @Get()
  @RequirePermission('schedule:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listOfferingExamTerms',
    summary: 'Every exam term offered on this course, in time order',
  })
  @ApiOkResponse({ type: ExamTermAdminResponseDto, isArray: true })
  @ApiErrorResponses({ notFound: true })
  async list(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
  ): Promise<ExamTermAdminResponseDto[]> {
    const entries = await this.examTerms.list(institutionId, offeringId);

    return entries.map((entry) => ExamTermAdminResponseDto.from(entry));
  }

  @Post()
  @RequirePermission('schedule:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'createExamTerm',
    summary: 'Offer an exam term',
    description:
      'The registration window must close before the exam starts, and the examiner must be somebody who teaches the offering.',
  })
  @ApiCreatedResponse({ type: ExamTermRefDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async create(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Body() dto: CreateExamTermDto,
  ): Promise<ExamTermRefDto> {
    const created = await this.examTerms.create(institutionId, offeringId, dto);

    return ExamTermRefDto.of(created.id);
  }

  @Patch(':examTermId')
  @RequirePermission('schedule:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'updateExamTerm',
    summary: 'Move a term, or change its capacity or registration window',
    description:
      'Capacity may not be cut below the seats already held. A cancelled term cannot be changed.',
  })
  @ApiOkResponse({ type: ExamTermRefDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async update(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('examTermId', ParseUUIDPipe) examTermId: string,
    @Body() dto: UpdateExamTermDto,
  ): Promise<ExamTermRefDto> {
    const updated = await this.examTerms.update(institutionId, offeringId, examTermId, dto);

    return ExamTermRefDto.of(updated.id);
  }

  @Post(':examTermId/cancellation')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('schedule:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'cancelExamTerm',
    summary: 'Call a term off, releasing the seats it held',
    description:
      'A cancelled term stays on the record so that the students who held a seat can see it was called off.',
  })
  @ApiOkResponse({ type: ExamTermRefDto })
  @ApiErrorResponses({ notFound: true })
  async cancel(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('examTermId', ParseUUIDPipe) examTermId: string,
    @CurrentUser('id') actorUserId: string,
  ): Promise<ExamTermRefDto> {
    const cancelled = await this.examTerms.cancel(
      institutionId,
      offeringId,
      examTermId,
      actorUserId,
    );

    return ExamTermRefDto.of(cancelled.id);
  }

  @Delete(':examTermId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('schedule:manage', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'removeExamTerm',
    summary: 'Remove a term that should never have been offered',
    description: 'Cancelling says it was called off; removing says it never existed.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses({ notFound: true })
  async remove(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('examTermId', ParseUUIDPipe) examTermId: string,
    @CurrentUser('id') actorUserId: string,
  ): Promise<void> {
    await this.examTerms.remove(institutionId, offeringId, examTermId, actorUserId);
  }
}
