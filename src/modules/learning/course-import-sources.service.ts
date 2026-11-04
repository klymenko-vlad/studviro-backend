import { Injectable } from '@nestjs/common';

import { AuthorizationService } from '../authorization/authorization.service';

import { CourseImportSnapshotRepository } from './course-import-snapshot.repository';
import {
  CourseImportSourcesRepository,
  type ImportSource,
} from './course-import-sources.repository';
import { LearningAccessService } from './learning-access.service';

export interface ImportSourcePage {
  readonly sources: ImportSource[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

@Injectable()
export class CourseImportSourcesService {
  constructor(
    private readonly access: LearningAccessService,
    private readonly authorization: AuthorizationService,
    private readonly snapshots: CourseImportSnapshotRepository,
    private readonly repository: CourseImportSourcesRepository,
  ) {}

  async page(
    institutionId: string,
    spaceId: string,
    userId: string,
    query: { page: number; limit: number; q?: string },
  ): Promise<ImportSourcePage> {
    const target = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(target);
    const [term, administers] = await Promise.all([
      this.snapshots.termOf(target.offeringId),
      this.authorization.can({
        userId,
        permission: 'offering:manage',
        scope: { type: 'institution', id: institutionId },
      }),
    ]);

    const { sources, total } = await this.repository.page({
      institutionId,
      targetSpaceId: spaceId,
      targetCourseId: term?.courseId ?? null,
      userId,
      administers,
      ...query,
    });

    return { sources, total, page: query.page, limit: query.limit };
  }
}
