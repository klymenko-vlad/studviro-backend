import { Module } from '@nestjs/common';

import { CourseOfferingController } from './course-offering.controller';
import { CourseOfferingRepository } from './course-offering.repository';
import { CourseOfferingService } from './course-offering.service';
import { CourseRosterController } from './course-roster.controller';
import { CourseRosterRepository } from './course-roster.repository';
import { CourseRosterService } from './course-roster.service';
import { MyCoursesController } from './my-courses.controller';
import { MyCoursesRepository } from './my-courses.repository';
import { MyCoursesService } from './my-courses.service';
import { MyTeachingController } from './my-teaching.controller';
import { MyTeachingRepository } from './my-teaching.repository';
import { MyTeachingService } from './my-teaching.service';
import { TeachingStaffRepository } from './teaching-staff.repository';

@Module({
  controllers: [
    MyCoursesController,
    MyTeachingController,
    CourseOfferingController,
    CourseRosterController,
  ],
  providers: [
    MyCoursesService,
    MyCoursesRepository,
    MyTeachingService,
    MyTeachingRepository,
    CourseOfferingService,
    CourseOfferingRepository,
    CourseRosterService,
    CourseRosterRepository,
    TeachingStaffRepository,
  ],
  exports: [MyCoursesService, MyTeachingService, CourseOfferingService],
})
export class CoursesModule {}
