import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { IdentityModule } from '../identity/identity.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { UsersModule } from '../users/users.module';

import { AcademicDataRepository } from './academic-data.repository';
import { AccountDataRepository } from './account-data.repository';
import { DiscussionDataRepository } from './discussion-data.repository';
import { LearningDataRepository } from './learning-data.repository';
import { PersonalDataErasureController } from './personal-data-erasure.controller';
import { PersonalDataErasureService } from './personal-data-erasure.service';
import { PersonalDataExportService } from './personal-data-export.service';
import { PersonalDataController } from './personal-data.controller';
import { RelatedInstitutionsRepository } from './related-institutions.repository';

@Module({
  imports: [AuthModule, CatalogueModule, IdentityModule, InvitationsModule, UsersModule],
  controllers: [PersonalDataController, PersonalDataErasureController],
  providers: [
    AcademicDataRepository,
    AccountDataRepository,
    DiscussionDataRepository,
    LearningDataRepository,
    PersonalDataErasureService,
    PersonalDataExportService,
    RelatedInstitutionsRepository,
  ],
})
export class PrivacyModule {}
