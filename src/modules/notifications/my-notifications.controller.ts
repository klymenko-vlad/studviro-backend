import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { ListMyNotificationsQueryDto } from './dto/list-my-notifications-query.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { UnreadNotificationsResponseDto } from './dto/unread-notifications-response.dto';
import { MyNotificationsService } from './my-notifications.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('notifications')
@ApiBearerAuth('access-token')
@Controller({ path: 'institutions/:institutionId/me/notifications', version: '1' })
export class MyNotificationsController {
  constructor(private readonly notifications: MyNotificationsService) {}

  @Get()
  @RequirePermission('notification:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'listMyNotifications',
    summary: 'List the notifications delivered to the current user',
  })
  @ApiOkResponse({ type: NotificationResponseDto, isArray: true })
  @ApiErrorResponses()
  async findMine(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ListMyNotificationsQueryDto,
  ): Promise<NotificationResponseDto[]> {
    const rows = await this.notifications.listMine(institutionId, userId, query);

    return rows.map((row) => NotificationResponseDto.fromRow(row));
  }

  @Get('unread-count')
  @RequirePermission('notification:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'countMyUnreadNotifications',
    summary: 'Count the notifications the current user has not read',
  })
  @ApiOkResponse({ type: UnreadNotificationsResponseDto })
  @ApiErrorResponses()
  async countUnread(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
  ): Promise<UnreadNotificationsResponseDto> {
    return UnreadNotificationsResponseDto.of(
      await this.notifications.countUnread(institutionId, userId),
    );
  }

  @Post('read-all')
  @RequirePermission('notification:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'markAllMyNotificationsRead',
    summary: 'Mark every notification of the current user as read',
  })
  @ApiOkResponse({ type: UnreadNotificationsResponseDto })
  @ApiErrorResponses()
  async markAllRead(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
  ): Promise<UnreadNotificationsResponseDto> {
    await this.notifications.markAllRead(institutionId, userId);

    return UnreadNotificationsResponseDto.of(0);
  }

  @Post(':id/read')
  @RequirePermission('notification:read', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'markMyNotificationRead',
    summary: 'Mark one notification of the current user as read',
  })
  @ApiOkResponse({ type: NotificationResponseDto })
  @ApiErrorResponses({ notFound: true })
  async markRead(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NotificationResponseDto> {
    const read = await this.notifications.markRead(institutionId, userId, id);

    return NotificationResponseDto.fromRow(read);
  }
}
