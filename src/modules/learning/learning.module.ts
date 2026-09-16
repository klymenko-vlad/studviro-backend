import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../authorization/authorization.module';

import { LearningSpacesController } from './learning-spaces.controller';
import { LearningSpacesRepository } from './learning-spaces.repository';
import { LearningSpacesService } from './learning-spaces.service';
import { MyAssessmentResultsController } from './my-assessment-results.controller';
import { MyAssessmentResultsRepository } from './my-assessment-results.repository';
import { MyAssessmentResultsService } from './my-assessment-results.service';
import { MyDeadlinesController } from './my-deadlines.controller';
import { MyDeadlinesRepository } from './my-deadlines.repository';
import { MyDeadlinesService } from './my-deadlines.service';

@Module({
  imports: [AuthorizationModule],
  controllers: [LearningSpacesController, MyDeadlinesController, MyAssessmentResultsController],
  providers: [
    LearningSpacesService,
    LearningSpacesRepository,
    MyDeadlinesService,
    MyDeadlinesRepository,
    MyAssessmentResultsService,
    MyAssessmentResultsRepository,
  ],
  exports: [LearningSpacesService, MyDeadlinesService, MyAssessmentResultsService],
})
export class LearningModule {}
