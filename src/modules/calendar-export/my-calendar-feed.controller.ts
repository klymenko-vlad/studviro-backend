import {
  Controller,
  Delete,
  Get,
  Header,
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
import { AppConfigService } from '../../config/app-config.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { CalendarExportService } from './calendar-export.service';
import { CalendarFeedService } from './calendar-feed.service';
import { CalendarFeedStatusDto } from './dto/calendar-feed-status.dto';
import { IssuedCalendarFeedDto } from './dto/issued-calendar-feed.dto';

@ApiTags('schedule')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/me', version: '1' })
export class MyCalendarFeedController {
  constructor(
    private readonly feeds: CalendarFeedService,
    private readonly calendar: CalendarExportService,
    private readonly config: AppConfigService,
  ) {}

  @Get('calendar.ics')
  @RequirePermission('schedule:read', { type: 'institution', param: 'institutionId' })
  @Header('content-type', 'text/calendar; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="studviro.ics"')
  @Header('cache-control', 'private, no-store')
  @ApiOperation({
    operationId: 'downloadMyCalendar',
    summary: 'Download the current user’s calendar as an iCalendar file',
  })
  @ApiOkResponse({ content: { 'text/calendar': { schema: { type: 'string' } } } })
  @ApiErrorResponses()
  downloadMyCalendar(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
  ): Promise<string> {
    return this.calendar.render(institutionId, userId);
  }

  @Get('calendar-feed')
  @RequirePermission('schedule:read', { type: 'institution', param: 'institutionId' })
  @ApiOperation({
    operationId: 'getMyCalendarFeed',
    summary: 'Whether the current user has a calendar subscription URL',
  })
  @ApiOkResponse({ type: CalendarFeedStatusDto })
  @ApiErrorResponses()
  async getMyCalendarFeed(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
  ): Promise<CalendarFeedStatusDto> {
    return CalendarFeedStatusDto.of(await this.feeds.status(institutionId, userId));
  }

  @Post('calendar-feed')
  @RequirePermission('schedule:read', { type: 'institution', param: 'institutionId' })
  @ApiOperation({
    operationId: 'issueMyCalendarFeed',
    summary: 'Create the calendar subscription URL, replacing any earlier one',
  })
  @ApiCreatedResponse({ type: IssuedCalendarFeedDto })
  @ApiErrorResponses()
  async issueMyCalendarFeed(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
  ): Promise<IssuedCalendarFeedDto> {
    const issued = await this.feeds.issue(institutionId, userId);
    const url = `${this.config.http.appUrl}/api/v1/calendar-feeds/${issued.token}.ics`;

    return IssuedCalendarFeedDto.of(url, issued.createdAt);
  }

  @Delete('calendar-feed')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('schedule:read', { type: 'institution', param: 'institutionId' })
  @ApiOperation({
    operationId: 'revokeMyCalendarFeed',
    summary: 'Turn the calendar subscription URL off',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses()
  revokeMyCalendarFeed(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    return this.feeds.revoke(institutionId, userId);
  }
}
