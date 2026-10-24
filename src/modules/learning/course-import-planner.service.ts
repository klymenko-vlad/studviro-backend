import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { InvalidInputError } from '../../common/errors/domain.error';
import { StorageKeys } from '../storage/storage.keys';

import { dateShiftBetween } from './course-import-dates';
import { matchGroups } from './course-import-names';
import { planImport } from './course-import-plan';
import { CourseImportSnapshotRepository } from './course-import-snapshot.repository';
import type { ImportPlan, ImportVisibility } from './course-import.types';
import { LearningAccessService } from './learning-access.service';
import { MATERIAL_PURPOSE } from './learning-materials.service';
import { referencesOf } from './restriction';

export interface ImportOrigin {
  readonly spaceId: string;
  readonly name: string;
  readonly termName: string | null;
}

export interface ImportRequest {
  readonly institutionId: string;
  readonly spaceId: string;
  readonly userId: string;
  readonly fromSpaceId: string;
  readonly visibility: ImportVisibility;
}

@Injectable()
export class CourseImportPlanner {
  constructor(
    private readonly access: LearningAccessService,
    private readonly snapshots: CourseImportSnapshotRepository,
  ) {}

  async plan(request: ImportRequest): Promise<{ source: ImportOrigin; plan: ImportPlan }> {
    const { institutionId, spaceId, userId, fromSpaceId } = request;
    const target = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(target);
    if (fromSpaceId === spaceId) {
      throw new InvalidInputError(
        'COURSE_IMPORT_SAME_PAGE',
        'A course page cannot be imported into itself',
      );
    }
    const origin = await this.access.contextForSpace(institutionId, fromSpaceId, userId);
    this.access.assertAuthor(origin);

    const [snapshot, sourceTerm, targetTerm, targetGroups, takenCategoryNames] =
      await Promise.all([
        this.snapshots.snapshotOf(fromSpaceId),
        this.snapshots.termOf(origin.offeringId),
        this.snapshots.termOf(target.offeringId),
        this.snapshots.groupsOf(target.offeringId),
        this.snapshots.categoryNamesOf(spaceId),
      ]);
    const referenced = referencesOf([
      ...snapshot.sections.map((row) => row.restriction),
      ...snapshot.materials.map((row) => row.restriction),
      ...snapshot.activities.map((row) => row.activity.restriction),
    ]);
    const sourceGroups = await this.snapshots.groupsByIds(referenced.groupIds);

    const plan = planImport({
      snapshot,
      institutionId,
      spaceId,
      userId,
      shift: dateShiftBetween(sourceTerm?.startsAt ?? null, targetTerm?.startsAt ?? null),
      groups: matchGroups(sourceGroups, targetGroups),
      takenCategoryNames,
      categorySuffix: sourceTerm?.termCode ?? 'imported',
      visibility: request.visibility,
      newId: randomUUID,
      newKey: (filename) =>
        StorageKeys.for({ institutionId, purpose: MATERIAL_PURPOSE, filename }),
    });

    return {
      source: {
        spaceId: fromSpaceId,
        name: origin.space.name,
        termName: sourceTerm?.termName ?? null,
      },
      plan,
    };
  }
}
