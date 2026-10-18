import { Module } from '@nestjs/common';

import { LearningModule } from '../learning/learning.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { DiscussionAccessService } from './discussion-access.service';
import { DiscussionModerationService } from './discussion-moderation.service';
import { DiscussionsController } from './discussions.controller';
import { DiscussionsRepository } from './discussions.repository';
import { DiscussionsService } from './discussions.service';

@Module({
  imports: [LearningModule, NotificationsModule],
  controllers: [DiscussionsController],
  providers: [
    DiscussionsService,
    DiscussionAccessService,
    DiscussionModerationService,
    DiscussionsRepository,
  ],
})
export class DiscussionsModule {}
