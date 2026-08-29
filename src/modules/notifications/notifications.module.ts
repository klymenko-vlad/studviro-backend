import { Module } from '@nestjs/common';

import { ExamTermNotificationsService } from './exam-term-notifications.service';
import { MyNotificationsController } from './my-notifications.controller';
import { MyNotificationsRepository } from './my-notifications.repository';
import { MyNotificationsService } from './my-notifications.service';
import { NotificationEmitterRepository } from './notification-emitter.repository';
import { NotificationEmitterService } from './notification-emitter.service';

@Module({
  controllers: [MyNotificationsController],
  providers: [
    NotificationEmitterRepository,
    NotificationEmitterService,
    ExamTermNotificationsService,
    MyNotificationsRepository,
    MyNotificationsService,
  ],
  exports: [ExamTermNotificationsService, NotificationEmitterService, MyNotificationsService],
})
export class NotificationsModule {}
