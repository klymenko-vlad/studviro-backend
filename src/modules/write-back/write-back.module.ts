import { Module } from '@nestjs/common';

import { ConnectorsModule } from '../connectors/connectors.module';
import { InstitutionsModule } from '../institutions/institutions.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { CourseEnrollmentWriteBackService } from './course-enrollment-write-back.service';
import { CourseEnrollmentWriteRepository } from './course-enrollment-write.repository';
import {
  CourseEnrollmentRequestWriter,
  CourseEnrollmentWithdrawWriter,
} from './course-enrollment.writer';
import { ExamRegistrationWriteBackService } from './exam-registration-write-back.service';
import { ExamRegistrationWriteRepository } from './exam-registration-write.repository';
import {
  ExamRegistrationCancelWriter,
  ExamRegistrationCreateWriter,
} from './exam-registration.writer';
import { WriteBackController } from './write-back.controller';
import { WriteBackService } from './write-back.service';
import { WriteIntentAdminService } from './write-intent-admin.service';
import { WriteIntentRepository } from './write-intent.repository';
import { WriteIntentService } from './write-intent.service';
import { INTENT_WRITERS } from './write-intent.types';
import { WriteTargetService } from './write-target.service';

const WRITER_CLASSES = [
  ExamRegistrationCreateWriter,
  ExamRegistrationCancelWriter,
  CourseEnrollmentRequestWriter,
  CourseEnrollmentWithdrawWriter,
];

@Module({
  imports: [ConnectorsModule, InstitutionsModule, NotificationsModule],
  controllers: [WriteBackController],
  providers: [
    ...WRITER_CLASSES,
    {
      provide: INTENT_WRITERS,
      inject: WRITER_CLASSES,
      useFactory: (...writers: unknown[]) => writers,
    },
    WriteIntentRepository,
    WriteIntentService,
    WriteIntentAdminService,
    WriteTargetService,
    WriteBackService,
    ExamRegistrationWriteRepository,
    ExamRegistrationWriteBackService,
    CourseEnrollmentWriteRepository,
    CourseEnrollmentWriteBackService,
  ],
  exports: [
    ExamRegistrationWriteBackService,
    CourseEnrollmentWriteBackService,
    WriteBackService,
    WriteIntentRepository,
  ],
})
export class WriteBackModule {}
