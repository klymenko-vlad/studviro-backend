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
import { PeopleRepository } from './people.repository';
import { PeopleService } from './people.service';
import { RoomsController } from './rooms.controller';
import { RoomsRepository } from './rooms.repository';
import { RoomsService } from './rooms.service';

@Module({
  imports: [UsersModule, InvitationsModule],
  controllers: [
    InstitutionsController,
    InstitutionConfigurationController,
    OrgUnitsController,
    PeopleController,
    RoomsController,
  ],
  providers: [
    InstitutionsService,
    InstitutionsRepository,
    InstitutionConfigurationService,
    InstitutionSettingsRepository,
    FeatureFlagGuard,
    OrgUnitsService,
    OrgUnitsRepository,
    PeopleRepository,
    PeopleService,
    RoomsService,
    RoomsRepository,
  ],
  exports: [
    InstitutionsService,
    InstitutionsRepository,
    InstitutionConfigurationService,
    FeatureFlagGuard,
    OrgUnitsRepository,
    RoomsRepository,
  ],
})
export class InstitutionsModule {}
