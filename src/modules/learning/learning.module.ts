import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../authorization/authorization.module';

import { LearningSpacesController } from './learning-spaces.controller';
import { LearningSpacesRepository } from './learning-spaces.repository';
import { LearningSpacesService } from './learning-spaces.service';
import { MyDeadlinesController } from './my-deadlines.controller';
import { MyDeadlinesRepository } from './my-deadlines.repository';
import { MyDeadlinesService } from './my-deadlines.service';

@Module({
  imports: [AuthorizationModule],
  controllers: [LearningSpacesController, MyDeadlinesController],
  providers: [
    LearningSpacesService,
    LearningSpacesRepository,
    MyDeadlinesService,
    MyDeadlinesRepository,
  ],
  exports: [LearningSpacesService, MyDeadlinesService],
})
export class LearningModule {}
