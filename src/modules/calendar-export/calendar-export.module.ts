import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../authorization/authorization.module';
import { InstitutionsModule } from '../institutions/institutions.module';
import { LearningModule } from '../learning/learning.module';
import { PlannerModule } from '../planner/planner.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { UsersModule } from '../users/users.module';

import { CalendarExportService } from './calendar-export.service';
import { CalendarFeedController } from './calendar-feed.controller';
import { CalendarFeedService } from './calendar-feed.service';
import { CalendarFeedsRepository } from './calendar-feeds.repository';
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
  controllers: [MyCalendarFeedController, CalendarFeedController],
  providers: [CalendarExportService, CalendarFeedService, CalendarFeedsRepository],
})
export class CalendarExportModule {}
