import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { ListMyTimetableEventsQueryDto } from './dto/list-my-timetable-events-query.dto';
import { MyTimetableEventResponseDto } from './dto/my-timetable-event-response.dto';
import { MyTimetableEventsService } from './my-timetable-events.service';

@ApiTags('schedule')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/me/timetable-events', version: '1' })
export class MyTimetableEventsController {
  constructor(private readonly myTimetableEvents: MyTimetableEventsService) {}

  @Get()
  @RequirePermission('schedule:read', { type: 'institution', param: 'institutionId' })
  @ApiOperation({
    operationId: 'listMyTimetableEvents',
    summary: 'List the current user’s timetable events overlapping a date range',
  })
  @ApiOkResponse({ type: MyTimetableEventResponseDto, isArray: true })
  @ApiErrorResponses()
  async findMine(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListMyTimetableEventsQueryDto,
  ): Promise<MyTimetableEventResponseDto[]> {
    const events = await this.myTimetableEvents.listMine(institutionId, userId, query);

    return events.map((event) => MyTimetableEventResponseDto.fromMyTimetableEvent(event));
  }
}
