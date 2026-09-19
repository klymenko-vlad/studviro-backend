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
import { OfferingAdministrationController } from './offering-administration.controller';
import { OfferingAdministrationService } from './offering-administration.service';

@Module({
  controllers: [AcademicTermsController, CatalogueController, OfferingAdministrationController],
  providers: [
    AcademicTermsService,
    AcademicTermsRepository,
    CatalogueService,
    ProgramsCatalogueRepository,
    CoursesCatalogueRepository,
    OfferingAdministrationService,
  ],
  exports: [AcademicTermsService, CatalogueService, OfferingAdministrationService],
})
export class CatalogueModule {}
