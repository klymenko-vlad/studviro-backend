import { Body, Controller, Delete, Param, ParseUUIDPipe, Post } from '@nestjs/common';
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

import { ExamRegistrationResponseDto } from './dto/exam-registration-response.dto';
import { RegisterForExamTermDto } from './dto/register-for-exam-term.dto';
import { MyExamRegistrationsService } from './my-exam-registrations.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('schedule')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/me/exam-registrations', version: '1' })
export class MyExamRegistrationsController {
  constructor(private readonly registrations: MyExamRegistrationsService) {}

  @Post()
  @RequirePermission('exam:register', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'registerForExamTerm',
    summary: 'Register the current user for an exam term',
  })
  @ApiCreatedResponse({ type: ExamRegistrationResponseDto })
  @ApiErrorResponses({ notFound: true, conflict: true })
  async register(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterForExamTermDto,
  ): Promise<ExamRegistrationResponseDto> {
    const registration = await this.registrations.register(
      institutionId,
      userId,
      dto.examTermId,
    );

    return ExamRegistrationResponseDto.fromEntity(registration);
  }

  @Delete(':id')
  @RequirePermission('exam:register', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'cancelExamRegistration',
    summary: 'Cancel the current user’s registration for an exam term',
  })
  @ApiOkResponse({ type: ExamRegistrationResponseDto })
  @ApiErrorResponses({ notFound: true })
  async cancel(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ExamRegistrationResponseDto> {
    const cancelled = await this.registrations.cancel(institutionId, userId, id);

    return ExamRegistrationResponseDto.fromEntity(cancelled);
  }
}
