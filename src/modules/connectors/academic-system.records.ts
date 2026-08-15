import type {
  AcademicTermKind,
  CourseGrade,
  CourseOfferingStatus,
  DegreeLevel,
  EnrollmentRequirementType,
  EnrollmentStatus,
  ExamTermKind,
  OrgUnitType,
  StudyForm,
  StudyGroupKind,
  TeachingRole,
  TimetableEventType,
} from '../../database/schema';

export interface SisPerson {
  readonly givenName: string;
  readonly familyName: string;
  readonly email: string;
  readonly isStudent: boolean;
  readonly isStaff: boolean;
  readonly studentIdentifier: string | null;
}

export interface SisOrgUnit {
  readonly parentExternalId: string | null;
  readonly type: OrgUnitType;
  readonly code: string;
  readonly name: string;
}

export interface SisAcademicTerm {
  readonly code: string;
  readonly name: string;
  readonly kind: AcademicTermKind;
  readonly academicYear: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly enrollmentOpensAt: Date;
  readonly enrollmentClosesAt: Date;
}

export interface SisProgram {
  readonly orgUnitExternalId: string;
  readonly code: string;
  readonly name: string;
  readonly degreeLevel: DegreeLevel;
  readonly studyForm: StudyForm;
  readonly standardLengthSemesters: number;
}

export interface SisCourse {
  readonly orgUnitExternalId: string;
  readonly code: string;
  readonly title: string;
  readonly credits: number;
}

export interface SisTeachingAssignment {
  readonly personExternalId: string;
  readonly role: TeachingRole;
  readonly isPrimary: boolean;
}

export interface SisCourseOffering {
  readonly courseExternalId: string;
  readonly academicTermExternalId: string;
  readonly orgUnitExternalId: string;
  readonly status: CourseOfferingStatus;
  readonly language: string;
  readonly capacity: number;
  readonly teaching: readonly SisTeachingAssignment[];
}

export interface SisProgramMembership {
  readonly programExternalId: string;
  readonly personExternalId: string;
  readonly studyYear: number;
}

export interface SisEnrollment {
  readonly courseOfferingExternalId: string;
  readonly personExternalId: string;
  readonly programExternalId: string;
  readonly status: EnrollmentStatus;
  readonly requirementType: EnrollmentRequirementType;
  readonly attempt: number;
  readonly enrolledAt: Date;
}

export interface SisStudyGroup {
  readonly courseOfferingExternalId: string;
  readonly kind: StudyGroupKind;
  readonly code: string;
  readonly capacity: number;
  readonly memberExternalIds: readonly string[];
}

export interface SisRoom {
  readonly orgUnitExternalId: string;
  readonly code: string;
  readonly building: string;
  readonly capacity: number;
}

export interface SisTimetableEvent {
  readonly courseOfferingExternalId: string;
  readonly studyGroupExternalId: string | null;
  readonly roomExternalId: string;
  readonly type: TimetableEventType;
  readonly title: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export interface SisExamTerm {
  readonly courseOfferingExternalId: string;
  readonly roomExternalId: string;
  readonly examinerExternalId: string;
  readonly kind: ExamTermKind;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly capacity: number;
  readonly registrationOpensAt: Date;
  readonly registrationClosesAt: Date;
}

export interface SisOfficialResult {
  readonly enrollmentExternalId: string;
  readonly grade: CourseGrade;
  readonly recordedAt: Date;
}
