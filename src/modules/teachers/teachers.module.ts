import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../authorization/authorization.module';

import { TeacherOfferingsService } from './teacher-offerings.service';
import { TeacherProfileController } from './teacher-profile.controller';
import { TeacherProfileService } from './teacher-profile.service';
import { TeachersRepository } from './teachers.repository';
import { ViewerOfferingAccessService } from './viewer-offering-access.service';

@Module({
  imports: [AuthorizationModule],
  controllers: [TeacherProfileController],
  providers: [
    TeachersRepository,
    ViewerOfferingAccessService,
    TeacherProfileService,
    TeacherOfferingsService,
  ],
})
export class TeachersModule {}
