import { Module } from '@nestjs/common';

import { InstitutionConfigurationController } from './configuration/institution-configuration.controller';
import { InstitutionConfigurationService } from './configuration/institution-configuration.service';
import { InstitutionSettingsRepository } from './configuration/institution-settings.repository';
import { InstitutionsController } from './institutions.controller';
import { InstitutionsRepository } from './institutions.repository';
import { InstitutionsService } from './institutions.service';

@Module({
  controllers: [InstitutionsController, InstitutionConfigurationController],
  providers: [
    InstitutionsService,
    InstitutionsRepository,
    InstitutionConfigurationService,
    InstitutionSettingsRepository,
  ],
  exports: [InstitutionsService, InstitutionsRepository, InstitutionConfigurationService],
})
export class InstitutionsModule {}
