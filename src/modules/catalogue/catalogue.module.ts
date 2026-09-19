import { Module } from '@nestjs/common';

import { AcademicTermsController } from './academic-terms.controller';
import { AcademicTermsRepository } from './academic-terms.repository';
import { AcademicTermsService } from './academic-terms.service';
import { CatalogueController } from './catalogue.controller';
import {
  CoursesCatalogueRepository,
  ProgramsCatalogueRepository,
} from './catalogue.repository';
import { CatalogueService } from './catalogue.service';
import { CourseOfferingsController } from './course-offerings.controller';
import { OfferingAdministrationController } from './offering-administration.controller';
import { OfferingAdministrationService } from './offering-administration.service';
import { TeachingAssignmentsController } from './teaching-assignments.controller';
import { TeachingAssignmentsService } from './teaching-assignments.service';

@Module({
  controllers: [
    AcademicTermsController,
    CatalogueController,
    CourseOfferingsController,
    OfferingAdministrationController,
    TeachingAssignmentsController,
  ],
  providers: [
    AcademicTermsService,
    AcademicTermsRepository,
    CatalogueService,
    ProgramsCatalogueRepository,
    CoursesCatalogueRepository,
    OfferingAdministrationService,
    TeachingAssignmentsService,
  ],
  exports: [AcademicTermsService, CatalogueService, OfferingAdministrationService],
})
export class CatalogueModule {}
