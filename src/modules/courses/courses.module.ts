import { Module } from '@nestjs/common';

import { CourseOfferingController } from './course-offering.controller';
import { CourseOfferingRepository } from './course-offering.repository';
import { CourseOfferingService } from './course-offering.service';
import { MyCoursesController } from './my-courses.controller';
import { MyCoursesRepository } from './my-courses.repository';
import { MyCoursesService } from './my-courses.service';
import { TeachingStaffRepository } from './teaching-staff.repository';

@Module({
  controllers: [MyCoursesController, CourseOfferingController],
  providers: [
    MyCoursesService,
    MyCoursesRepository,
    CourseOfferingService,
    CourseOfferingRepository,
    TeachingStaffRepository,
  ],
  exports: [MyCoursesService, CourseOfferingService],
})
export class CoursesModule {}
