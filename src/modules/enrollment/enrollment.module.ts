import { Module } from '@nestjs/common';

import { WriteBackModule } from '../write-back/write-back.module';

import { EnrollableOfferingsRepository } from './enrollable-offerings.repository';
import { EnrollableOfferingsService } from './enrollable-offerings.service';
import { MyEnrollmentsController } from './my-enrollments.controller';
import { MyEnrollmentsRepository } from './my-enrollments.repository';
import { MyEnrollmentsService } from './my-enrollments.service';

@Module({
  imports: [WriteBackModule],
  controllers: [MyEnrollmentsController],
  providers: [
    EnrollableOfferingsService,
    EnrollableOfferingsRepository,
    MyEnrollmentsService,
    MyEnrollmentsRepository,
  ],
  exports: [EnrollableOfferingsService, MyEnrollmentsService],
})
export class EnrollmentModule {}
