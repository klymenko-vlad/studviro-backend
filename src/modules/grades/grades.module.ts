import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { WriteBackModule } from '../write-back/write-back.module';

import { MyCourseResultsController } from './my-course-results.controller';
import { MyCourseResultsRepository } from './my-course-results.repository';
import { MyCourseResultsService } from './my-course-results.service';
import { OfferingResultsController } from './offering-results.controller';
import { OfferingResultsRepository } from './offering-results.repository';
import { OfferingResultsService } from './offering-results.service';

@Module({
  imports: [NotificationsModule, WriteBackModule],
  controllers: [MyCourseResultsController, OfferingResultsController],
  providers: [
    MyCourseResultsService,
    MyCourseResultsRepository,
    OfferingResultsService,
    OfferingResultsRepository,
  ],
  exports: [MyCourseResultsService, OfferingResultsService],
})
export class GradesModule {}
