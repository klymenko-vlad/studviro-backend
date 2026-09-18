import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';

import { EnrollableOfferingsRepository } from './enrollable-offerings.repository';
import { EnrollableOfferingsService } from './enrollable-offerings.service';
import { MyEnrollmentsController } from './my-enrollments.controller';
import { MyEnrollmentsRepository } from './my-enrollments.repository';
import { MyEnrollmentsService } from './my-enrollments.service';

@Module({
  imports: [NotificationsModule],
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
