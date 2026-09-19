import type {
  ActivityCompletionState,
  CanonicalRole,
  CourseGrade,
  EnrollmentRequirementType,
  EnrollmentStatus,
  ExamRegistrationStatus,
  NotificationPayload,
  NotificationType,
  OfficialCourseResultStatus,
  ProgramMembershipStatus,
  RoleScopeType,
  SubmissionState,
  TeachingRole,
  UserRole,
  UserStatus,
} from '../../database/schema';

export interface ExportedAccount {
  id: string;
  email: string;
  displayName: string;
  locale: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExportedEmail {
  address: string;
  institutionId: string | null;
  verifiedAt: Date | null;
  isPrimary: boolean;
  createdAt: Date;
}

export interface ExportedExternalIdentity {
  provider: string;
  issuer: string;
  subject: string;
  externalUsername: string | null;
  assertedEmail: string | null;
  lastAuthenticatedAt: Date | null;
}

export interface ExportedSession {
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface ExportedPasswordReset {
  requestedAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface ExportedInvitation {
  address: string;
  role: CanonicalRole;
  scopeType: RoleScopeType;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

export interface ExportedRole {
  role: CanonicalRole;
  scopeType: RoleScopeType;
  scopeId: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
}

export interface ExportedTeachingAssignment {
  courseOfferingId: string;
  courseCode: string;
  courseTitle: string;
  role: TeachingRole;
  isPrimary: boolean;
}

export interface ExportedProgramMembership {
  programId: string;
  programCode: string;
  programName: string;
  status: ProgramMembershipStatus;
  studyYear: number | null;
  startedAt: Date | null;
  endedAt: Date | null;
}

export interface ExportedEnrollment {
  id: string;
  courseOfferingId: string;
  courseCode: string;
  courseTitle: string;
  status: EnrollmentStatus;
  requirementType: EnrollmentRequirementType;
  attempt: number;
  enrolledAt: Date | null;
  withdrawnAt: Date | null;
}

export interface ExportedCourseResult {
  enrollmentId: string;
  courseCode: string;
  status: OfficialCourseResultStatus;
  attempt: number;
  calculatedPoints: number | null;
  calculatedGrade: CourseGrade | null;
  proposedGrade: CourseGrade | null;
  proposedAt: Date | null;
  officialGrade: CourseGrade | null;
  officialRecordedAt: Date | null;
  conflictNote: string | null;
}

export interface ExportedExamRegistration {
  examTermId: string;
  courseCode: string;
  status: ExamRegistrationStatus;
  startsAt: Date;
  registeredAt: Date | null;
  cancelledAt: Date | null;
}

export interface ExportedStudyGroupMembership {
  studyGroupId: string;
  code: string;
  courseOfferingId: string;
}

export interface ExportedAssessmentResult {
  assessmentId: string;
  assessmentName: string;
  points: number | null;
  normalizedScore: number | null;
  feedback: string | null;
  gradedAt: Date | null;
}

export interface ExportedActivityCompletion {
  learningActivityId: string;
  activityName: string;
  state: ActivityCompletionState;
  completedAt: Date | null;
}

export interface ExportedFile {
  storageKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export interface ExportedSubmission {
  id: string;
  learningActivityId: string;
  activityName: string;
  state: SubmissionState;
  attempt: number;
  submittedAt: Date | null;
  isLate: boolean;
  notes: string | null;
  files: ExportedFile[];
}

export interface ExportedNotification {
  type: NotificationType;
  occurredAt: Date;
  payload: NotificationPayload;
  readAt: Date | null;
}

export interface PersonalDataExport {
  institutionId: string;
  generatedAt: Date;
  account: ExportedAccount;
  emails: ExportedEmail[];
  externalIdentities: ExportedExternalIdentity[];
  sessions: ExportedSession[];
  passwordResets: ExportedPasswordReset[];
  invitations: ExportedInvitation[];
  roles: ExportedRole[];
  teachingAssignments: ExportedTeachingAssignment[];
  programMemberships: ExportedProgramMembership[];
  enrollments: ExportedEnrollment[];
  courseResults: ExportedCourseResult[];
  examRegistrations: ExportedExamRegistration[];
  studyGroupMemberships: ExportedStudyGroupMembership[];
  assessmentResults: ExportedAssessmentResult[];
  activityCompletions: ExportedActivityCompletion[];
  submissions: ExportedSubmission[];
  notifications: ExportedNotification[];
  files: ExportedFile[];
}
