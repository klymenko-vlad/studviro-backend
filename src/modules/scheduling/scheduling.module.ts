import { Module } from '@nestjs/common';

import { WriteBackModule } from '../write-back/write-back.module';

import { MyExamRegistrationsController } from './my-exam-registrations.controller';
import { MyExamRegistrationsRepository } from './my-exam-registrations.repository';
import { MyExamRegistrationsService } from './my-exam-registrations.service';
import { MyExamTermsController } from './my-exam-terms.controller';
import { MyExamTermsRepository } from './my-exam-terms.repository';
import { MyExamTermsService } from './my-exam-terms.service';
import { MyTimetableEventsController } from './my-timetable-events.controller';
import { MyTimetableEventsRepository } from './my-timetable-events.repository';
import { MyTimetableEventsService } from './my-timetable-events.service';

@Module({
  imports: [WriteBackModule],
  controllers: [
    MyTimetableEventsController,
    MyExamTermsController,
    MyExamRegistrationsController,
  ],
  providers: [
    MyTimetableEventsService,
    MyTimetableEventsRepository,
    MyExamTermsService,
    MyExamTermsRepository,
    MyExamRegistrationsService,
    MyExamRegistrationsRepository,
  ],
  exports: [MyTimetableEventsService, MyExamTermsService, MyExamRegistrationsService],
})
export class SchedulingModule {}
