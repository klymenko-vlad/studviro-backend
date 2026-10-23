import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../authorization/authorization.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { AssignmentAnnouncementSweepService } from './assignment-announcement-sweep.service';
import { AssignmentAnnouncementsRepository } from './assignment-announcements.repository';
import { AssignmentAnnouncementsService } from './assignment-announcements.service';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { CompletionReportService } from './completion-report.service';
import { CompletionController } from './completion.controller';
import { CompletionRepository } from './completion.repository';
import { CompletionService } from './completion.service';
import { CourseStudentsRepository } from './course-students.repository';
import { LearningAccessService } from './learning-access.service';
import { AvailabilityService } from './learning-availability.service';
import { LearningMaterialsController } from './learning-materials.controller';
import { LearningMaterialsService } from './learning-materials.service';
import { LearningOutlineService } from './learning-outline.service';
import { LearningSectionsController } from './learning-sections.controller';
import { LearningSectionsService } from './learning-sections.service';
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
import { MyProgressService } from './my-progress.service';
import { RestrictionFactsRepository } from './restriction-facts.repository';
import { RestrictionRulesService } from './restriction-rules.service';
import { SubmissionMarkingController } from './submission-marking.controller';
import { SubmissionMarkingService } from './submission-marking.service';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';
import { TrackedItemsRepository } from './tracked-items.repository';

@Module({
  imports: [AuthorizationModule, NotificationsModule],
  controllers: [
    LearningSpacesController,
    LearningSpaceAuthoringController,
    LearningSectionsController,
    LearningMaterialsController,
    AssignmentsController,
    SubmissionsController,
    SubmissionMarkingController,
    MyDeadlinesController,
    MyAssessmentResultsController,
    CompletionController,
  ],
  providers: [
    LearningAccessService,
    LearningSpacesService,
    LearningSpacesRepository,
    LearningSpaceAuthoringService,
    LearningOutlineService,
    AvailabilityService,
    RestrictionFactsRepository,
    RestrictionRulesService,
    LearningSectionsService,
    LearningMaterialsService,
    AssignmentsService,
    AssignmentAnnouncementsRepository,
    AssignmentAnnouncementsService,
    AssignmentAnnouncementSweepService,
    SubmissionsService,
    SubmissionMarkingService,
    MyDeadlinesService,
    MyDeadlinesRepository,
    MyAssessmentResultsService,
    MyAssessmentResultsRepository,
    CompletionRepository,
    CompletionService,
    TrackedItemsRepository,
    CourseStudentsRepository,
    MyProgressService,
    CompletionReportService,
  ],
  exports: [
    LearningSpacesService,
    MyDeadlinesService,
    MyAssessmentResultsService,
    LearningAccessService,
    CompletionService,
  ],
})
export class LearningModule {}
