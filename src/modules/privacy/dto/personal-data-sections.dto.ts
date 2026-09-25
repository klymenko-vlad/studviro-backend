import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import {
  ACTIVITY_COMPLETION_STATES,
  CANONICAL_ROLES,
  COURSE_GRADES,
  ENROLLMENT_REQUIREMENT_TYPES,
  ENROLLMENT_STATUSES,
  EXAM_REGISTRATION_STATUSES,
  NOTIFICATION_TYPES,
  OFFICIAL_COURSE_RESULT_STATUSES,
  PROGRAM_MEMBERSHIP_STATUSES,
  ROLE_SCOPE_TYPES,
  SUBMISSION_STATES,
  SUPPORTED_LOCALES,
  TEACHING_ROLES,
  USER_ROLES,
  USER_STATUSES,
} from '../../../database/schema';
import type { ExportedFile } from '../personal-data.types';

const uuid = { format: 'uuid' } as const;
const dateTime = { type: String, format: 'date-time' } as const;
const nullableDateTime = { type: String, format: 'date-time', nullable: true } as const;
const nullableText = { type: String, nullable: true } as const;
const nullableNumber = { type: Number, nullable: true } as const;

@Exclude()
export class ExportedAccountDto {
  @Expose() @ApiProperty(uuid) id!: string;
  @Expose() @ApiProperty() email!: string;
  @Expose() @ApiProperty() displayName!: string;
  @Expose() @ApiProperty({ enum: SUPPORTED_LOCALES }) locale!: string;
  @Expose() @ApiProperty({ enum: USER_ROLES }) role!: string;
  @Expose() @ApiProperty({ enum: USER_STATUSES }) status!: string;
  @Expose() @ApiProperty(dateTime) createdAt!: Date;
  @Expose() @ApiProperty(dateTime) updatedAt!: Date;
}

@Exclude()
export class ExportedEmailDto {
  @Expose() @ApiProperty() address!: string;
  @Expose()
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  institutionId!: string | null;

  @Expose() @ApiProperty(nullableDateTime) verifiedAt!: Date | null;
  @Expose() @ApiProperty() isPrimary!: boolean;
  @Expose() @ApiProperty(dateTime) createdAt!: Date;
}

@Exclude()
export class ExportedExternalIdentityDto {
  @Expose() @ApiProperty() provider!: string;
  @Expose() @ApiProperty() issuer!: string;
  @Expose() @ApiProperty() subject!: string;
  @Expose() @ApiProperty(nullableText) externalUsername!: string | null;
  @Expose() @ApiProperty(nullableText) assertedEmail!: string | null;
  @Expose() @ApiProperty(nullableDateTime) lastAuthenticatedAt!: Date | null;
}

/** The device-and-address history a rotating session leaves behind. */
@Exclude()
export class ExportedSessionDto {
  @Expose() @ApiProperty(nullableText) userAgent!: string | null;
  @Expose() @ApiProperty(nullableText) ipAddress!: string | null;
  @Expose() @ApiProperty(dateTime) createdAt!: Date;
  @Expose() @ApiProperty(dateTime) expiresAt!: Date;
  @Expose() @ApiProperty(nullableDateTime) revokedAt!: Date | null;
}

@Exclude()
export class ExportedPasswordResetDto {
  @Expose() @ApiProperty(dateTime) requestedAt!: Date;
  @Expose() @ApiProperty(dateTime) expiresAt!: Date;
  @Expose() @ApiProperty(nullableDateTime) consumedAt!: Date | null;
}

@Exclude()
export class ExportedInvitationDto {
  @Expose() @ApiProperty() address!: string;
  @Expose() @ApiProperty({ enum: CANONICAL_ROLES }) role!: string;
  @Expose() @ApiProperty({ enum: ROLE_SCOPE_TYPES }) scopeType!: string;
  @Expose() @ApiProperty(dateTime) expiresAt!: Date;
  @Expose() @ApiProperty(nullableDateTime) acceptedAt!: Date | null;
  @Expose() @ApiProperty(dateTime) createdAt!: Date;
}

@Exclude()
export class ExportedRoleDto {
  @Expose() @ApiProperty({ enum: CANONICAL_ROLES }) role!: string;
  @Expose() @ApiProperty({ enum: ROLE_SCOPE_TYPES }) scopeType!: string;
  @Expose()
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  scopeId!: string | null;

  @Expose() @ApiProperty(nullableDateTime) validFrom!: Date | null;
  @Expose() @ApiProperty(nullableDateTime) validUntil!: Date | null;
}

@Exclude()
export class ExportedTeachingAssignmentDto {
  @Expose() @ApiProperty(uuid) courseOfferingId!: string;
  @Expose() @ApiProperty() courseCode!: string;
  @Expose() @ApiProperty() courseTitle!: string;
  @Expose() @ApiProperty({ enum: TEACHING_ROLES }) role!: string;
  @Expose() @ApiProperty() isPrimary!: boolean;
}

@Exclude()
export class ExportedProgramMembershipDto {
  @Expose() @ApiProperty(uuid) programId!: string;
  @Expose() @ApiProperty() programCode!: string;
  @Expose() @ApiProperty() programName!: string;
  @Expose() @ApiProperty({ enum: PROGRAM_MEMBERSHIP_STATUSES }) status!: string;
  @Expose() @ApiProperty(nullableNumber) studyYear!: number | null;
  @Expose() @ApiProperty(nullableDateTime) startedAt!: Date | null;
  @Expose() @ApiProperty(nullableDateTime) endedAt!: Date | null;
}

@Exclude()
export class ExportedEnrollmentDto {
  @Expose() @ApiProperty(uuid) id!: string;
  @Expose() @ApiProperty(uuid) courseOfferingId!: string;
  @Expose() @ApiProperty() courseCode!: string;
  @Expose() @ApiProperty() courseTitle!: string;
  @Expose() @ApiProperty({ enum: ENROLLMENT_STATUSES }) status!: string;
  @Expose() @ApiProperty({ enum: ENROLLMENT_REQUIREMENT_TYPES }) requirementType!: string;
  @Expose() @ApiProperty() attempt!: number;
  @Expose() @ApiProperty(nullableDateTime) enrolledAt!: Date | null;
  @Expose() @ApiProperty(nullableDateTime) withdrawnAt!: Date | null;
}

@Exclude()
export class ExportedCourseResultDto {
  @Expose() @ApiProperty(uuid) enrollmentId!: string;
  @Expose() @ApiProperty() courseCode!: string;
  @Expose() @ApiProperty({ enum: OFFICIAL_COURSE_RESULT_STATUSES }) status!: string;
  @Expose() @ApiProperty() attempt!: number;
  @Expose() @ApiProperty(nullableNumber) calculatedPoints!: number | null;
  @Expose()
  @ApiProperty({ enum: [...COURSE_GRADES, null], nullable: true })
  calculatedGrade!: string | null;

  @Expose() @ApiProperty({ enum: [...COURSE_GRADES, null], nullable: true }) proposedGrade!:
    string | null;
  @Expose() @ApiProperty(nullableDateTime) proposedAt!: Date | null;
  @Expose() @ApiProperty({ enum: [...COURSE_GRADES, null], nullable: true }) officialGrade!:
    string | null;
  @Expose() @ApiProperty(nullableDateTime) officialRecordedAt!: Date | null;
  @Expose() @ApiProperty(nullableText) conflictNote!: string | null;
}

@Exclude()
export class ExportedExamRegistrationDto {
  @Expose() @ApiProperty(uuid) examTermId!: string;
  @Expose() @ApiProperty() courseCode!: string;
  @Expose() @ApiProperty({ enum: EXAM_REGISTRATION_STATUSES }) status!: string;
  @Expose() @ApiProperty(dateTime) startsAt!: Date;
  @Expose() @ApiProperty(nullableDateTime) registeredAt!: Date | null;
  @Expose() @ApiProperty(nullableDateTime) cancelledAt!: Date | null;
}

@Exclude()
export class ExportedStudyGroupMembershipDto {
  @Expose() @ApiProperty(uuid) studyGroupId!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty(uuid) courseOfferingId!: string;
}

@Exclude()
export class ExportedAssessmentResultDto {
  @Expose() @ApiProperty(uuid) assessmentId!: string;
  @Expose() @ApiProperty() assessmentName!: string;
  @Expose() @ApiProperty(nullableNumber) points!: number | null;
  @Expose() @ApiProperty(nullableNumber) normalizedScore!: number | null;
  @Expose() @ApiProperty(nullableText) feedback!: string | null;
  @Expose() @ApiProperty(nullableDateTime) gradedAt!: Date | null;
}

@Exclude()
export class ExportedActivityCompletionDto {
  @Expose() @ApiProperty(uuid) learningActivityId!: string;
  @Expose() @ApiProperty() activityName!: string;
  @Expose() @ApiProperty({ enum: ACTIVITY_COMPLETION_STATES }) state!: string;
  @Expose() @ApiProperty(nullableDateTime) completedAt!: Date | null;
}

@Exclude()
export class ExportedFileDto {
  @Expose() @ApiProperty() storageKey!: string;
  @Expose() @ApiProperty() filename!: string;
  @Expose() @ApiProperty() contentType!: string;
  @Expose() @ApiProperty() sizeBytes!: number;
}

@Exclude()
export class ExportedSubmissionDto {
  @Expose() @ApiProperty(uuid) id!: string;
  @Expose() @ApiProperty(uuid) learningActivityId!: string;
  @Expose() @ApiProperty() activityName!: string;
  @Expose() @ApiProperty({ enum: SUBMISSION_STATES }) state!: string;
  @Expose() @ApiProperty() attempt!: number;
  @Expose() @ApiProperty(nullableDateTime) submittedAt!: Date | null;
  @Expose() @ApiProperty() isLate!: boolean;
  @Expose() @ApiProperty(nullableText) notes!: string | null;

  @Expose()
  @Type(() => ExportedFileDto)
  @ApiProperty({ type: ExportedFileDto, isArray: true })
  files!: ExportedFile[];
}

@Exclude()
export class ExportedNotificationDto {
  @Expose() @ApiProperty({ enum: NOTIFICATION_TYPES }) type!: string;
  @Expose() @ApiProperty(dateTime) occurredAt!: Date;
  @Expose() @ApiProperty({ type: Object }) payload!: Record<string, unknown>;
  @Expose() @ApiProperty(nullableDateTime) readAt!: Date | null;
}
