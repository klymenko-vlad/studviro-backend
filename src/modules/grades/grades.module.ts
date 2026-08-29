import { Module } from '@nestjs/common';

import { MyCourseResultsController } from './my-course-results.controller';
import { MyCourseResultsRepository } from './my-course-results.repository';
import { MyCourseResultsService } from './my-course-results.service';

@Module({
  controllers: [MyCourseResultsController],
  providers: [MyCourseResultsService, MyCourseResultsRepository],
  exports: [MyCourseResultsService],
})
export class GradesModule {}
