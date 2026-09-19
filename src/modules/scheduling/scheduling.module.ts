import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';

import { ExamTermCancellationService } from './exam-term-cancellation.service';
import { MyExamRegistrationsController } from './my-exam-registrations.controller';
import { MyExamRegistrationsRepository } from './my-exam-registrations.repository';
import { MyExamRegistrationsService } from './my-exam-registrations.service';
import { MyExamTermsController } from './my-exam-terms.controller';
import { MyExamTermsRepository } from './my-exam-terms.repository';
import { MyExamTermsService } from './my-exam-terms.service';
import { MyTimetableEventsController } from './my-timetable-events.controller';
import { MyTimetableEventsRepository } from './my-timetable-events.repository';
import { MyTimetableEventsService } from './my-timetable-events.service';
import { TimetableAdministrationController } from './timetable-administration.controller';
import { TimetableAdministrationService } from './timetable-administration.service';

@Module({
  imports: [NotificationsModule],
  controllers: [
    MyTimetableEventsController,
    MyExamTermsController,
    MyExamRegistrationsController,
    TimetableAdministrationController,
  ],
  providers: [
    ExamTermCancellationService,
    MyTimetableEventsService,
    MyTimetableEventsRepository,
    MyExamTermsService,
    MyExamTermsRepository,
    MyExamRegistrationsService,
    MyExamRegistrationsRepository,
    TimetableAdministrationService,
  ],
  exports: [
    MyTimetableEventsService,
    MyExamTermsService,
    MyExamRegistrationsService,
    ExamTermCancellationService,
  ],
})
export class SchedulingModule {}
