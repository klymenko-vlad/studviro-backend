import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import type {
  ExportedAccount,
  ExportedActivityCompletion,
  ExportedAssessmentResult,
  ExportedCourseResult,
  ExportedEmail,
  ExportedEnrollment,
  ExportedExamRegistration,
  ExportedExternalIdentity,
  ExportedFile,
  ExportedInvitation,
  ExportedNotification,
  ExportedPasswordReset,
  ExportedProgramMembership,
  ExportedRole,
  ExportedSession,
  ExportedStudyGroupMembership,
  ExportedSubmission,
  ExportedDiscussionPost,
  ExportedTeachingAssignment,
  PersonalDataExport,
} from '../personal-data.types';

import {
  ExportedAccountDto,
  ExportedActivityCompletionDto,
  ExportedAssessmentResultDto,
  ExportedCourseResultDto,
  ExportedEmailDto,
  ExportedEnrollmentDto,
  ExportedExamRegistrationDto,
  ExportedExternalIdentityDto,
  ExportedFileDto,
  ExportedInvitationDto,
  ExportedNotificationDto,
  ExportedPasswordResetDto,
  ExportedProgramMembershipDto,
  ExportedRoleDto,
  ExportedSessionDto,
  ExportedStudyGroupMembershipDto,
  ExportedSubmissionDto,
  ExportedDiscussionPostDto,
  ExportedTeachingAssignmentDto,
} from './personal-data-sections.dto';

/**
 * Everything one institution holds about one person, in the order the GDPR
 * data inventory lists it: who they are, how they sign in, what they are on,
 * what they scored, and which objects in the store are theirs.
 */
@Exclude()
export class PersonalDataExportDto {
  @Expose() @ApiProperty({ format: 'uuid' }) institutionId!: string;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) generatedAt!: Date;

  @Expose()
  @Type(() => ExportedAccountDto)
  @ApiProperty({ type: ExportedAccountDto })
  account!: ExportedAccount;

  @Expose()
  @Type(() => ExportedEmailDto)
  @ApiProperty({ type: ExportedEmailDto, isArray: true })
  emails!: ExportedEmail[];

  @Expose()
  @Type(() => ExportedExternalIdentityDto)
  @ApiProperty({ type: ExportedExternalIdentityDto, isArray: true })
  externalIdentities!: ExportedExternalIdentity[];

  @Expose()
  @Type(() => ExportedSessionDto)
  @ApiProperty({ type: ExportedSessionDto, isArray: true })
  sessions!: ExportedSession[];

  @Expose()
  @Type(() => ExportedPasswordResetDto)
  @ApiProperty({ type: ExportedPasswordResetDto, isArray: true })
  passwordResets!: ExportedPasswordReset[];

  @Expose()
  @Type(() => ExportedInvitationDto)
  @ApiProperty({ type: ExportedInvitationDto, isArray: true })
  invitations!: ExportedInvitation[];

  @Expose()
  @Type(() => ExportedRoleDto)
  @ApiProperty({ type: ExportedRoleDto, isArray: true })
  roles!: ExportedRole[];

  @Expose()
  @Type(() => ExportedTeachingAssignmentDto)
  @ApiProperty({ type: ExportedTeachingAssignmentDto, isArray: true })
  teachingAssignments!: ExportedTeachingAssignment[];

  @Expose()
  @Type(() => ExportedProgramMembershipDto)
  @ApiProperty({ type: ExportedProgramMembershipDto, isArray: true })
  programMemberships!: ExportedProgramMembership[];

  @Expose()
  @Type(() => ExportedEnrollmentDto)
  @ApiProperty({ type: ExportedEnrollmentDto, isArray: true })
  enrollments!: ExportedEnrollment[];

  @Expose()
  @Type(() => ExportedCourseResultDto)
  @ApiProperty({ type: ExportedCourseResultDto, isArray: true })
  courseResults!: ExportedCourseResult[];

  @Expose()
  @Type(() => ExportedExamRegistrationDto)
  @ApiProperty({ type: ExportedExamRegistrationDto, isArray: true })
  examRegistrations!: ExportedExamRegistration[];

  @Expose()
  @Type(() => ExportedStudyGroupMembershipDto)
  @ApiProperty({ type: ExportedStudyGroupMembershipDto, isArray: true })
  studyGroupMemberships!: ExportedStudyGroupMembership[];

  @Expose()
  @Type(() => ExportedAssessmentResultDto)
  @ApiProperty({ type: ExportedAssessmentResultDto, isArray: true })
  assessmentResults!: ExportedAssessmentResult[];

  @Expose()
  @Type(() => ExportedActivityCompletionDto)
  @ApiProperty({ type: ExportedActivityCompletionDto, isArray: true })
  activityCompletions!: ExportedActivityCompletion[];

  @Expose()
  @Type(() => ExportedSubmissionDto)
  @ApiProperty({ type: ExportedSubmissionDto, isArray: true })
  submissions!: ExportedSubmission[];

  @Expose()
  @Type(() => ExportedDiscussionPostDto)
  @ApiProperty({ type: ExportedDiscussionPostDto, isArray: true })
  discussionPosts!: ExportedDiscussionPost[];

  @Expose()
  @Type(() => ExportedNotificationDto)
  @ApiProperty({ type: ExportedNotificationDto, isArray: true })
  notifications!: ExportedNotification[];

  @Expose()
  @Type(() => ExportedFileDto)
  @ApiProperty({ type: ExportedFileDto, isArray: true })
  files!: ExportedFile[];

  static from(document: PersonalDataExport): PersonalDataExportDto {
    return Object.assign(new PersonalDataExportDto(), document);
  }
}
