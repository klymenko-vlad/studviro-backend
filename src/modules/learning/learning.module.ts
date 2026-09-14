import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../authorization/authorization.module';

import { LearningSpacesController } from './learning-spaces.controller';
import { LearningSpacesRepository } from './learning-spaces.repository';
import { LearningSpacesService } from './learning-spaces.service';

@Module({
  imports: [AuthorizationModule],
  controllers: [LearningSpacesController],
  providers: [LearningSpacesService, LearningSpacesRepository],
  exports: [LearningSpacesService],
})
export class LearningModule {}
