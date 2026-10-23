import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../authorization/authorization.module';

import { TeacherProfileController } from './teacher-profile.controller';
import { TeacherProfileService } from './teacher-profile.service';

@Module({
  imports: [AuthorizationModule],
  controllers: [TeacherProfileController],
  providers: [TeacherProfileService],
})
export class TeachersModule {}
