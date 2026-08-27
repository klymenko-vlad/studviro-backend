import type { Provider } from '@nestjs/common';

import { AcademicTermsImporter } from './academic-terms.importer';
import { ACADEMIC_IMPORTERS, type AcademicImporter } from './academic.importer';
import { CourseOfferingsImporter } from './course-offerings.importer';
import { CoursesImporter } from './courses.importer';
import { EnrollmentsImporter } from './enrollments.importer';
import { ExamTermsImporter } from './exam-terms.importer';
import { OfficialResultsImporter } from './official-results.importer';
import { OrgUnitsImporter } from './org-units.importer';
import { PersonsImporter } from './persons.importer';
import { ProgramMembershipsImporter } from './program-memberships.importer';
import { ProgramsImporter } from './programs.importer';
import { RoomsImporter } from './rooms.importer';
import { StudyGroupsImporter } from './study-groups.importer';
import { TimetableEventsImporter } from './timetable-events.importer';

export const ACADEMIC_IMPORTER_CLASSES = [
  OrgUnitsImporter,
  PersonsImporter,
  AcademicTermsImporter,
  RoomsImporter,
  ProgramsImporter,
  CoursesImporter,
  CourseOfferingsImporter,
  ProgramMembershipsImporter,
  StudyGroupsImporter,
  EnrollmentsImporter,
  TimetableEventsImporter,
  ExamTermsImporter,
  OfficialResultsImporter,
];

export const academicImportersProvider: Provider = {
  provide: ACADEMIC_IMPORTERS,
  useFactory: (...importers: AcademicImporter[]) => importers,
  inject: ACADEMIC_IMPORTER_CLASSES,
};
