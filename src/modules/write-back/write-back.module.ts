import { Module } from '@nestjs/common';

import { ConnectorsModule } from '../connectors/connectors.module';
import { InstitutionsModule } from '../institutions/institutions.module';

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

const WRITER_CLASSES = [ExamRegistrationCreateWriter, ExamRegistrationCancelWriter];

@Module({
  imports: [ConnectorsModule, InstitutionsModule],
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
  ],
  exports: [ExamRegistrationWriteBackService, WriteBackService, WriteIntentRepository],
})
export class WriteBackModule {}
