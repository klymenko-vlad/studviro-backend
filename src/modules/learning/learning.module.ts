import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../authorization/authorization.module';

import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { LearningAccessService } from './learning-access.service';
import { LearningMaterialsController } from './learning-materials.controller';
import { LearningMaterialsService } from './learning-materials.service';
import { LearningSpaceAuthoringController } from './learning-space-authoring.controller';
import { LearningSpaceAuthoringService } from './learning-space-authoring.service';
import { LearningSpacesController } from './learning-spaces.controller';
import { LearningSpacesRepository } from './learning-spaces.repository';
import { LearningSpacesService } from './learning-spaces.service';
import { MyAssessmentResultsController } from './my-assessment-results.controller';
import { MyAssessmentResultsRepository } from './my-assessment-results.repository';
import { MyAssessmentResultsService } from './my-assessment-results.service';
import { MyDeadlinesController } from './my-deadlines.controller';
import { MyDeadlinesRepository } from './my-deadlines.repository';
import { MyDeadlinesService } from './my-deadlines.service';
import { SubmissionMarkingController } from './submission-marking.controller';
import { SubmissionMarkingService } from './submission-marking.service';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';

@Module({
  imports: [AuthorizationModule],
  controllers: [
    LearningSpacesController,
    LearningSpaceAuthoringController,
    LearningMaterialsController,
    AssignmentsController,
    SubmissionsController,
    SubmissionMarkingController,
    MyDeadlinesController,
    MyAssessmentResultsController,
  ],
  providers: [
    LearningAccessService,
    LearningSpacesService,
    LearningSpacesRepository,
    LearningSpaceAuthoringService,
    LearningMaterialsService,
    AssignmentsService,
    SubmissionsService,
    SubmissionMarkingService,
    MyDeadlinesService,
    MyDeadlinesRepository,
    MyAssessmentResultsService,
    MyAssessmentResultsRepository,
  ],
  exports: [LearningSpacesService, MyDeadlinesService, MyAssessmentResultsService],
})
export class LearningModule {}
