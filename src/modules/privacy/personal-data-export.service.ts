import { Injectable } from '@nestjs/common';

import { UsersRepository } from '../users/users.repository';

import { AcademicDataRepository } from './academic-data.repository';
import { AccountDataRepository } from './account-data.repository';
import { DiscussionDataRepository } from './discussion-data.repository';
import { LearningDataRepository } from './learning-data.repository';
import type { PersonalDataExport } from './personal-data.types';

/**
 * Article 15 in one document. Scoped to one institution, because that is the
 * controller answering — the account itself is global and is reported as it
 * stands.
 */
@Injectable()
export class PersonalDataExportService {
  constructor(
    private readonly users: UsersRepository,
    private readonly account: AccountDataRepository,
    private readonly academic: AcademicDataRepository,
    private readonly learning: LearningDataRepository,
    private readonly discussions: DiscussionDataRepository,
  ) {}

  async exportFor(institutionId: string, userId: string): Promise<PersonalDataExport> {
    const person = await this.users.findByIdOrFail(userId);

    const [
      emails,
      externalIdentities,
      sessions,
      passwordResets,
      invitations,
      roles,
      teachingAssignments,
      programMemberships,
      enrollments,
      courseResults,
      examRegistrations,
      studyGroupMemberships,
      assessmentResults,
      activityCompletions,
      submissions,
      notifications,
      files,
      discussionPosts,
    ] = await Promise.all([
      this.account.emails(institutionId, userId),
      this.account.externalIdentities(institutionId, userId),
      this.account.sessions(userId),
      this.account.passwordResets(userId),
      this.account.invitations(institutionId, userId, person.email),
      this.account.roles(institutionId, userId),
      this.academic.teachingAssignments(institutionId, userId),
      this.academic.programMemberships(institutionId, userId),
      this.academic.enrollments(institutionId, userId),
      this.academic.courseResults(institutionId, userId),
      this.academic.examRegistrations(institutionId, userId),
      this.academic.studyGroupMemberships(institutionId, userId),
      this.learning.assessmentResults(institutionId, userId),
      this.learning.activityCompletions(institutionId, userId),
      this.learning.submissions(institutionId, userId),
      this.learning.notifications(institutionId, userId),
      Promise.all([
        this.learning.files(institutionId, userId),
        this.discussions.files(institutionId, userId),
      ]).then(([submitted, attached]) => [...submitted, ...attached]),
      this.discussions.posts(institutionId, userId),
    ]);

    return {
      institutionId,
      generatedAt: new Date(),
      account: {
        id: person.id,
        email: person.email,
        displayName: person.displayName,
        locale: person.locale,
        role: person.role,
        status: person.status,
        createdAt: person.createdAt,
        updatedAt: person.updatedAt,
      },
      emails,
      externalIdentities,
      sessions,
      passwordResets,
      invitations,
      roles,
      teachingAssignments,
      programMemberships,
      enrollments,
      courseResults,
      examRegistrations,
      studyGroupMemberships,
      assessmentResults,
      activityCompletions,
      submissions,
      discussionPosts,
      notifications,
      files,
    };
  }
}
