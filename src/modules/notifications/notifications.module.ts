import { Module } from '@nestjs/common';

import { DiscussionNotificationsService } from './discussion-notifications.service';
import { EnrollmentNotificationsService } from './enrollment-notifications.service';
import { ExamRegistrationNotificationsService } from './exam-registration-notifications.service';
import { ExamTermNotificationsService } from './exam-term-notifications.service';
import { GradeNotificationsService } from './grade-notifications.service';
import { LearningActivityAudienceRepository } from './learning-activity-audience.repository';
import { LearningActivityNotificationsService } from './learning-activity-notifications.service';
import { MyNotificationsController } from './my-notifications.controller';
import { MyNotificationsRepository } from './my-notifications.repository';
import { MyNotificationsService } from './my-notifications.service';
import { NotificationEmitterRepository } from './notification-emitter.repository';
import { NotificationEmitterService } from './notification-emitter.service';
import { NotificationMailRepository } from './notification-mail.repository';
import { NotificationMailService } from './notification-mail.service';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { TimetableNotificationsService } from './timetable-notifications.service';
import { WaitlistNotificationsRepository } from './waitlist-notifications.repository';
import { WaitlistNotificationsService } from './waitlist-notifications.service';

@Module({
  controllers: [MyNotificationsController, NotificationPreferencesController],
  providers: [
    DiscussionNotificationsService,
    NotificationEmitterRepository,
    NotificationEmitterService,
    NotificationMailRepository,
    NotificationMailService,
    ExamTermNotificationsService,
    ExamRegistrationNotificationsService,
    EnrollmentNotificationsService,
    GradeNotificationsService,
    TimetableNotificationsService,
    LearningActivityAudienceRepository,
    LearningActivityNotificationsService,
    MyNotificationsRepository,
    MyNotificationsService,
    WaitlistNotificationsRepository,
    WaitlistNotificationsService,
  ],
  exports: [
    ExamTermNotificationsService,
    ExamRegistrationNotificationsService,
    EnrollmentNotificationsService,
    GradeNotificationsService,
    TimetableNotificationsService,
    LearningActivityNotificationsService,
    NotificationEmitterService,
    MyNotificationsService,
    WaitlistNotificationsService,
    DiscussionNotificationsService,
  ],
})
export class NotificationsModule {}
