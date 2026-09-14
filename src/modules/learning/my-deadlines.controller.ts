import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { ListMyDeadlinesQueryDto } from './dto/list-my-deadlines-query.dto';
import { MyDeadlineResponseDto } from './dto/my-deadline-response.dto';
import { MyDeadlinesService } from './my-deadlines.service';

@ApiTags('learning')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/me/deadlines', version: '1' })
export class MyDeadlinesController {
  constructor(private readonly deadlines: MyDeadlinesService) {}

  @Get()
  @RequirePermission('schedule:read', { type: 'institution', param: 'institutionId' })
  @ApiOperation({
    operationId: 'listMyDeadlines',
    summary: 'List the current user’s learning activity deadlines falling in a date range',
  })
  @ApiOkResponse({ type: MyDeadlineResponseDto, isArray: true })
  @ApiErrorResponses()
  async findMine(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListMyDeadlinesQueryDto,
  ): Promise<MyDeadlineResponseDto[]> {
    const deadlines = await this.deadlines.listMine(institutionId, userId, query);

    return deadlines.map((deadline) => MyDeadlineResponseDto.fromMyDeadline(deadline));
  }
}
