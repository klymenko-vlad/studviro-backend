import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../authorization/authorization.module';

import { PersonalEventsController } from './personal-events.controller';
import { PersonalEventsRepository } from './personal-events.repository';
import { PersonalEventsService } from './personal-events.service';
import { PersonalTasksController } from './personal-tasks.controller';
import { PersonalTasksRepository } from './personal-tasks.repository';
import { PersonalTasksService } from './personal-tasks.service';

@Module({
  imports: [AuthorizationModule],
  controllers: [PersonalTasksController, PersonalEventsController],
  providers: [
    PersonalTasksRepository,
    PersonalTasksService,
    PersonalEventsRepository,
    PersonalEventsService,
  ],
  exports: [PersonalTasksService, PersonalEventsService],
})
export class PlannerModule {}
