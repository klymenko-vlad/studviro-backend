import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { EntityNotFoundError, PermissionDeniedError } from '../../common/errors/domain.error';
import {
  courseOfferings,
  ENROLLMENT_PARTICIPATING_STATUSES,
  enrollments,
  learningSpaces,
  teachingAssignments,
  type LearningSpace,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { AuthorizationService } from '../authorization/authorization.service';
import { administersOfferings } from '../courses/administers-offering';

export const LEARNING_STANCES = ['author', 'participant', 'observer'] as const;
export type LearningStance = (typeof LEARNING_STANCES)[number];

export interface LearningSpaceContext {
  readonly space: LearningSpace;
  readonly offeringId: string | null;
  readonly stance: LearningStance;
  readonly userId: string;
}

/**
 * Who the caller is to a course, which is a different question from what the
 * guard already asked. `offering:read` says they may look at course data at
 * all; this says whether this particular course is theirs to author, theirs to
 * sit, or somebody else's.
 */
@Injectable()
export class LearningAccessService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly authorization: AuthorizationService,
  ) {}

  async contextForSpace(
    institutionId: string,
    spaceId: string,
    userId: string,
  ): Promise<LearningSpaceContext> {
    const [space] = await this.reader
      .select()
      .from(learningSpaces)
      .where(
        and(
          eq(learningSpaces.id, spaceId),
          eq(learningSpaces.institutionId, institutionId),
          isNull(learningSpaces.deletedAt),
        ),
      )
      .limit(1);

    if (!space) throw new EntityNotFoundError('learning_space', spaceId);

    const stance = await this.stance(institutionId, space.courseOfferingId, userId);

    // An unpublished space does not exist for anyone who cannot publish it.
    if (!space.visible && stance !== 'author') {
      throw new EntityNotFoundError('learning_space', spaceId);
    }

    await this.assertReader(institutionId, stance, userId);

    return { space, offeringId: space.courseOfferingId, stance, userId };
  }

  async assertReaderOfOffering(
    institutionId: string,
    offeringId: string,
    userId: string,
  ): Promise<void> {
    const stance = await this.stance(institutionId, offeringId, userId);
    await this.assertReader(institutionId, stance, userId);
  }

  private async assertReader(
    institutionId: string,
    stance: LearningStance,
    userId: string,
  ): Promise<void> {
    if (stance !== 'observer') return;
    if (await administersOfferings(this.authorization, userId, institutionId)) return;

    throw new PermissionDeniedError(
      'LEARNING_SPACE_NOT_YOURS',
      'Only somebody taking, teaching or administering this course may read its page',
    );
  }

  async stance(
    institutionId: string,
    offeringId: string | null,
    userId: string,
  ): Promise<LearningStance> {
    if (offeringId !== null && (await this.teaches(offeringId, userId))) return 'author';

    const administers = await this.authorization.can({
      userId,
      permission: 'offering:manage',
      scope: { type: 'institution', id: institutionId },
    });
    if (administers) return 'author';

    if (offeringId !== null && (await this.isEnrolled(offeringId, userId)))
      return 'participant';

    return 'observer';
  }

  assertAuthor(context: LearningSpaceContext): void {
    if (context.stance === 'author') return;

    throw authoringDenied();
  }

  /**
   * The same question before a space exists to ask it about. Creating one is
   * the only authoring act with no space to hang the check on, so it is
   * answered against the offering instead.
   */
  async assertAuthorOfOffering(
    institutionId: string,
    offeringId: string,
    userId: string,
  ): Promise<void> {
    if ((await this.stance(institutionId, offeringId, userId)) === 'author') return;

    throw authoringDenied();
  }

  async assertOffering(institutionId: string, offeringId: string): Promise<void> {
    const [row] = await this.reader
      .select({ id: courseOfferings.id })
      .from(courseOfferings)
      .where(
        and(
          eq(courseOfferings.id, offeringId),
          eq(courseOfferings.institutionId, institutionId),
          isNull(courseOfferings.deletedAt),
        ),
      )
      .limit(1);

    if (!row) throw new EntityNotFoundError('course offering', offeringId);
  }

  async isEnrolled(offeringId: string, userId: string): Promise<boolean> {
    const [row] = await this.reader
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.courseOfferingId, offeringId),
          eq(enrollments.userId, userId),
          inArray(enrollments.status, [...ENROLLMENT_PARTICIPATING_STATUSES]),
          isNull(enrollments.deletedAt),
        ),
      )
      .limit(1);

    return row !== undefined;
  }

  private async teaches(offeringId: string, userId: string): Promise<boolean> {
    const [row] = await this.reader
      .select({ id: teachingAssignments.id })
      .from(teachingAssignments)
      .where(
        and(
          eq(teachingAssignments.courseOfferingId, offeringId),
          eq(teachingAssignments.userId, userId),
          isNull(teachingAssignments.deletedAt),
        ),
      )
      .limit(1);

    return row !== undefined;
  }

  private get reader() {
    return this.txHost.reader();
  }
}

function authoringDenied(): PermissionDeniedError {
  return new PermissionDeniedError(
    'LEARNING_AUTHORING_DENIED',
    'Only somebody teaching this course, or administering its offerings, may change its space',
  );
}
