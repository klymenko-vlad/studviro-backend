import { Module } from '@nestjs/common';

import { CatalogueController } from './catalogue.controller';
import {
  CoursesCatalogueRepository,
  ProgramsCatalogueRepository,
} from './catalogue.repository';
import { CatalogueService } from './catalogue.service';
import { OfferingAdministrationController } from './offering-administration.controller';
import { OfferingAdministrationService } from './offering-administration.service';

@Module({
  controllers: [CatalogueController, OfferingAdministrationController],
  providers: [
    CatalogueService,
    ProgramsCatalogueRepository,
    CoursesCatalogueRepository,
    OfferingAdministrationService,
  ],
  exports: [CatalogueService, OfferingAdministrationService],
})
export class CatalogueModule {}
