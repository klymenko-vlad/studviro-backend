import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import {
  NotificationPreferencesResponseDto,
  UpdateNotificationPreferencesDto,
} from './dto/notification-preferences.dto';
import { NotificationMailService } from './notification-mail.service';

/**
 * Per person, not per institution: one mailbox, one choice, wherever the
 * notifications come from.
 */
@ApiTags('notifications')
@ApiBearerAuth('access-token')
@Controller({ path: 'users/me/notification-preferences', version: '1' })
export class NotificationPreferencesController {
  constructor(private readonly mail: NotificationMailService) {}

  @Get()
  @ApiOperation({
    operationId: 'getMyNotificationPreferences',
    summary: 'Which notification types the current user also gets by e-mail',
  })
  @ApiOkResponse({ type: NotificationPreferencesResponseDto })
  @ApiErrorResponses()
  async findMine(
    @CurrentUser('id') userId: string,
  ): Promise<NotificationPreferencesResponseDto> {
    return NotificationPreferencesResponseDto.of(await this.mail.emailTypes(userId));
  }

  @Put()
  @ApiOperation({
    operationId: 'updateMyNotificationPreferences',
    summary: 'Choose which notification types also arrive by e-mail',
    description:
      'Replaces the whole set. A copy goes out only for a notification still unread after a few minutes, and only for notifications made after the type was turned on.',
  })
  @ApiOkResponse({ type: NotificationPreferencesResponseDto })
  @ApiErrorResponses()
  async updateMine(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesResponseDto> {
    return NotificationPreferencesResponseDto.of(
      await this.mail.setEmailTypes(userId, dto.emailTypes),
    );
  }
}
