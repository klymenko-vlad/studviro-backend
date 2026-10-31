import { Controller, Get, Header, Param, ParseEnumPipe, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { CALENDAR_ENTRY_KINDS, type CalendarEntryKind } from './calendar-entry';
import { CalendarEntryExportService } from './calendar-entry-export.service';

@ApiTags('schedule')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/me/calendar-entries', version: '1' })
export class MyCalendarEntryController {
  constructor(private readonly entries: CalendarEntryExportService) {}

  @Get(':kind/:entryId')
  @RequirePermission('schedule:read', { type: 'institution', param: 'institutionId' })
  @Header('content-type', 'text/calendar; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="studviro-event.ics"')
  @Header('cache-control', 'private, no-store')
  @ApiOperation({
    operationId: 'downloadMyCalendarEntry',
    summary: 'Download one class, exam or deadline of the current user as an iCalendar file',
  })
  @ApiParam({ name: 'kind', enum: CALENDAR_ENTRY_KINDS })
  @ApiOkResponse({ content: { 'text/calendar': { schema: { type: 'string' } } } })
  @ApiErrorResponses({ notFound: true })
  downloadMyCalendarEntry(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Param(
      'kind',
      new ParseEnumPipe(Object.fromEntries(CALENDAR_ENTRY_KINDS.map((kind) => [kind, kind]))),
    )
    kind: CalendarEntryKind,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @CurrentUser('id') userId: string,
  ): Promise<string> {
    return this.entries.render(institutionId, userId, { kind, id: entryId });
  }
}
