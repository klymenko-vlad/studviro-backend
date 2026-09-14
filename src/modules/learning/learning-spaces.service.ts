import { Injectable } from '@nestjs/common';

import { LearningSpacesRepository, type LearningSpaceRow } from './learning-spaces.repository';

export const LEARNING_SPACE_PAGE_SIZE = 100;

export interface LearningSpaceSummary {
  readonly total: number;
  readonly linked: number;
  readonly unlinked: number;
  readonly spaces: readonly LearningSpaceRow[];
}

@Injectable()
export class LearningSpacesService {
  constructor(private readonly spaces: LearningSpacesRepository) {}

  async listForInstitution(institutionId: string): Promise<LearningSpaceSummary> {
    const [rows, total] = await Promise.all([
      this.spaces.findSpaces(institutionId, LEARNING_SPACE_PAGE_SIZE),
      this.spaces.countSpaces(institutionId),
    ]);

    const linked = rows.filter((row) => row.offeringId !== null).length;

    return { total, linked, unlinked: rows.length - linked, spaces: rows };
  }
}
