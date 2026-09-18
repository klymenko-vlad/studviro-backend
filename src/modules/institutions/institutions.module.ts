import { Module } from '@nestjs/common';

import { InvitationsModule } from '../invitations/invitations.module';
import { UsersModule } from '../users/users.module';

import { FeatureFlagGuard } from './configuration/guards/feature-flag.guard';
import { InstitutionConfigurationController } from './configuration/institution-configuration.controller';
import { InstitutionConfigurationService } from './configuration/institution-configuration.service';
import { InstitutionSettingsRepository } from './configuration/institution-settings.repository';
import { InstitutionsController } from './institutions.controller';
import { InstitutionsRepository } from './institutions.repository';
import { InstitutionsService } from './institutions.service';
import { OrgUnitsController } from './org-units.controller';
import { OrgUnitsRepository } from './org-units.repository';
import { OrgUnitsService } from './org-units.service';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';

@Module({
  imports: [UsersModule, InvitationsModule],
  controllers: [
    InstitutionsController,
    InstitutionConfigurationController,
    OrgUnitsController,
    PeopleController,
  ],
  providers: [
    InstitutionsService,
    InstitutionsRepository,
    InstitutionConfigurationService,
    InstitutionSettingsRepository,
    FeatureFlagGuard,
    OrgUnitsService,
    OrgUnitsRepository,
    PeopleService,
  ],
  exports: [
    InstitutionsService,
    InstitutionsRepository,
    InstitutionConfigurationService,
    FeatureFlagGuard,
    OrgUnitsRepository,
  ],
})
export class InstitutionsModule {}
