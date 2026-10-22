import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';

import { EnrollableOfferingsRepository } from './enrollable-offerings.repository';
import { EnrollableOfferingsService } from './enrollable-offerings.service';
import { MyEnrollmentsController } from './my-enrollments.controller';
import { MyEnrollmentsRepository } from './my-enrollments.repository';
import { MyEnrollmentsService } from './my-enrollments.service';
import { OfferingWaitlistController } from './offering-waitlist.controller';
import { OfferingWaitlistService } from './offering-waitlist.service';

@Module({
  imports: [NotificationsModule],
  controllers: [MyEnrollmentsController, OfferingWaitlistController],
  providers: [
    EnrollableOfferingsService,
    EnrollableOfferingsRepository,
    MyEnrollmentsService,
    MyEnrollmentsRepository,
    OfferingWaitlistService,
  ],
  exports: [EnrollableOfferingsService, MyEnrollmentsService],
})
export class EnrollmentModule {}
