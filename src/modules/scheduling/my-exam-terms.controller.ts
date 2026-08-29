import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { ListMyExamTermsQueryDto } from './dto/list-my-exam-terms-query.dto';
import { MyExamTermResponseDto } from './dto/my-exam-term-response.dto';
import { MyExamTermsService } from './my-exam-terms.service';

@ApiTags('schedule')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/me/exam-terms', version: '1' })
export class MyExamTermsController {
  constructor(private readonly myExamTerms: MyExamTermsService) {}

  @Get()
  @RequirePermission('schedule:read', { type: 'institution', param: 'institutionId' })
  @ApiOperation({
    operationId: 'listMyExamTerms',
    summary: 'List the exam terms of the courses the current user attends or teaches',
  })
  @ApiOkResponse({ type: MyExamTermResponseDto, isArray: true })
  @ApiErrorResponses()
  async findMine(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListMyExamTermsQueryDto,
  ): Promise<MyExamTermResponseDto[]> {
    const terms = await this.myExamTerms.listMine(institutionId, userId, query);

    return terms.map((term) => MyExamTermResponseDto.fromMyExamTerm(term));
  }
}
