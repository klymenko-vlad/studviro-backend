import { Module } from '@nestjs/common';

import { MyExamTermsController } from './my-exam-terms.controller';
import { MyExamTermsRepository } from './my-exam-terms.repository';
import { MyExamTermsService } from './my-exam-terms.service';
import { MyTimetableEventsController } from './my-timetable-events.controller';
import { MyTimetableEventsRepository } from './my-timetable-events.repository';
import { MyTimetableEventsService } from './my-timetable-events.service';

@Module({
  controllers: [MyTimetableEventsController, MyExamTermsController],
  providers: [
    MyTimetableEventsService,
    MyTimetableEventsRepository,
    MyExamTermsService,
    MyExamTermsRepository,
  ],
  exports: [MyTimetableEventsService, MyExamTermsService],
})
export class SchedulingModule {}
