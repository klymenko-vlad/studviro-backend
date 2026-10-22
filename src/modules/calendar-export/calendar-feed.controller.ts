import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { Public } from '../auth/decorators/public.decorator';

import { CalendarExportService } from './calendar-export.service';

/**
 * What a calendar app polls. It cannot sign in, so the token in the path is
 * the credential (ADR 0038).
 */
@ApiTags('schedule')
@Controller({ path: 'calendar-feeds', version: '1' })
export class CalendarFeedController {
  constructor(private readonly calendar: CalendarExportService) {}

  @Get(':token')
  @Public()
  @Header('content-type', 'text/calendar; charset=utf-8')
  @Header('cache-control', 'private, no-store')
  @Header('referrer-policy', 'no-referrer')
  @ApiOperation({
    operationId: 'getCalendarFeed',
    summary: 'A calendar subscription, addressed by the secret in its URL',
  })
  @ApiOkResponse({ content: { 'text/calendar': { schema: { type: 'string' } } } })
  @ApiErrorResponses({ notFound: true })
  getCalendarFeed(@Param('token') token: string): Promise<string> {
    return this.calendar.renderFeed(token.replace(/\.ics$/, ''));
  }
}
