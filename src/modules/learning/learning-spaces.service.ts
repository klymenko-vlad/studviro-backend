import { Injectable } from '@nestjs/common';

import { PermissionDeniedError } from '../../common/errors/domain.error';
import { AuthorizationService } from '../authorization/authorization.service';

import { LearningSpacesRepository, type LearningSpaceRow } from './learning-spaces.repository';

export const LEARNING_SPACE_PAGE_SIZE = 100;

export interface LearningSpaceSummary {
  readonly total: number;
  /** Offerings in this term's institution that nobody has written a page for. */
  readonly offeringsWithoutPage: number;
  readonly spaces: readonly LearningSpaceRow[];
}

/**
 * Two questions behind one route, and they are not the same question.
 *
 * _Which page is on this offering?_ is asked by the course page itself, so
 * every reader of the offering may ask it — that is what `offering:read` on
 * the route means.
 *
 * _Which offerings have a page at all?_ is an administrator's index of the
 * whole institution: the names, codes and workload of courses the caller has
 * nothing to do with. `offering:read` is held by every student, so gating it
 * there offered every student a tab listing every course in the university.
 */
@Injectable()
export class LearningSpacesService {
  constructor(
    private readonly spaces: LearningSpacesRepository,
    private readonly authorization: AuthorizationService,
  ) {}

  async listForInstitution(
    institutionId: string,
    userId: string,
    offeringId?: string,
  ): Promise<LearningSpaceSummary> {
    if (offeringId === undefined) {
      await this.assertMayIndex(institutionId, userId);
    }

    const [spaces, counts] = await Promise.all([
      this.spaces.findSpaces(institutionId, LEARNING_SPACE_PAGE_SIZE, offeringId),
      this.spaces.countSpaces(institutionId),
    ]);

    return {
      total: counts.spaces,
      offeringsWithoutPage: Math.max(counts.offerings - counts.spaces, 0),
      spaces,
    };
  }

  private async assertMayIndex(institutionId: string, userId: string): Promise<void> {
    const mayIndex = await this.authorization.can({
      userId,
      permission: 'offering:manage',
      scope: { type: 'institution', id: institutionId },
    });

    if (mayIndex) return;

    throw new PermissionDeniedError(
      'LEARNING_INDEX_DENIED',
      'Only somebody who administers this institution can list every course page',
    );
  }
}
