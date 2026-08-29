import { Module } from '@nestjs/common';

import { MyTimetableEventsController } from './my-timetable-events.controller';
import { MyTimetableEventsRepository } from './my-timetable-events.repository';
import { MyTimetableEventsService } from './my-timetable-events.service';

@Module({
  controllers: [MyTimetableEventsController],
  providers: [MyTimetableEventsService, MyTimetableEventsRepository],
  exports: [MyTimetableEventsService],
})
export class SchedulingModule {}
