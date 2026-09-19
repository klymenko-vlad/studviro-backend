import { Module } from '@nestjs/common';

import { AcademicTermsController } from './academic-terms.controller';
import { AcademicTermsRepository } from './academic-terms.repository';
import { AcademicTermsService } from './academic-terms.service';
import { BulkEntryController } from './bulk-entry.controller';
import { BulkEntryService } from './bulk-entry.service';
import { CatalogueController } from './catalogue.controller';
import {
  CoursesCatalogueRepository,
  ProgramsCatalogueRepository,
} from './catalogue.repository';
import { CatalogueService } from './catalogue.service';
import { CourseOfferingsController } from './course-offerings.controller';
import { InstitutionMembershipService } from './institution-membership.service';
import { OfferingAdministrationController } from './offering-administration.controller';
import { OfferingAdministrationService } from './offering-administration.service';
import { ProgramMembershipsController } from './program-memberships.controller';
import { ProgramMembershipsService } from './program-memberships.service';
import { StudyGroupsController } from './study-groups.controller';
import { StudyGroupsService } from './study-groups.service';
import { TeachingAssignmentsController } from './teaching-assignments.controller';
import { TeachingAssignmentsService } from './teaching-assignments.service';

@Module({
  controllers: [
    AcademicTermsController,
    BulkEntryController,
    CatalogueController,
    CourseOfferingsController,
    OfferingAdministrationController,
    ProgramMembershipsController,
    StudyGroupsController,
    TeachingAssignmentsController,
  ],
  providers: [
    AcademicTermsService,
    BulkEntryService,
    InstitutionMembershipService,
    AcademicTermsRepository,
    CatalogueService,
    ProgramsCatalogueRepository,
    CoursesCatalogueRepository,
    OfferingAdministrationService,
    ProgramMembershipsService,
    StudyGroupsService,
    TeachingAssignmentsService,
  ],
  exports: [AcademicTermsService, CatalogueService, OfferingAdministrationService],
})
export class CatalogueModule {}
