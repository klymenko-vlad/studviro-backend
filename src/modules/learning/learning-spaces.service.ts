import { Injectable } from '@nestjs/common';

import { PermissionDeniedError } from '../../common/errors/domain.error';
import { AuthorizationService } from '../authorization/authorization.service';

import { LearningAccessService } from './learning-access.service';
import { LearningSpacesRepository, type LearningSpaceRow } from './learning-spaces.repository';

export const LEARNING_SPACE_PAGE_SIZE = 100;

export interface LearningSpaceSummary {
  readonly total: number;
  /** Offerings in this term's institution that nobody has written a page for. */
  readonly offeringsWithoutPage: number;
  readonly spaces: readonly LearningSpaceRow[];
}

@Injectable()
export class LearningSpacesService {
  constructor(
    private readonly spaces: LearningSpacesRepository,
    private readonly authorization: AuthorizationService,
    private readonly access: LearningAccessService,
  ) {}

  async listForInstitution(
    institutionId: string,
    userId: string,
    offeringId?: string,
  ): Promise<LearningSpaceSummary> {
    if (offeringId === undefined) {
      await this.assertMayIndex(institutionId, userId);
    } else {
      await this.access.assertReaderOfOffering(institutionId, offeringId, userId);
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
