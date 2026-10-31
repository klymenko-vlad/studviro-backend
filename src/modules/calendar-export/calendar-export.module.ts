import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../authorization/authorization.module';
import { InstitutionsModule } from '../institutions/institutions.module';
import { LearningModule } from '../learning/learning.module';
import { PlannerModule } from '../planner/planner.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { UsersModule } from '../users/users.module';

import { CalendarEntryExportService } from './calendar-entry-export.service';
import { CalendarEntryMomentsRepository } from './calendar-entry-moments.repository';
import { CalendarExportService } from './calendar-export.service';
import { CalendarFeedController } from './calendar-feed.controller';
import { CalendarFeedService } from './calendar-feed.service';
import { CalendarFeedsRepository } from './calendar-feeds.repository';
import { MyCalendarEntryController } from './my-calendar-entry.controller';
import { MyCalendarFeedController } from './my-calendar-feed.controller';

@Module({
  imports: [
    AuthorizationModule,
    InstitutionsModule,
    LearningModule,
    PlannerModule,
    SchedulingModule,
    UsersModule,
  ],
  controllers: [MyCalendarFeedController, MyCalendarEntryController, CalendarFeedController],
  providers: [
    CalendarExportService,
    CalendarEntryExportService,
    CalendarEntryMomentsRepository,
    CalendarFeedService,
    CalendarFeedsRepository,
  ],
})
export class CalendarExportModule {}
