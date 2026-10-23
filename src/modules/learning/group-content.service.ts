import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql, type AnyColumn } from 'drizzle-orm';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import {
  learningActivities,
  learningMaterials,
  learningSections,
  learningSpaces,
  studyGroups,
  type Restriction,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import type { StudentPageQuery } from './course-students.repository';
import { LearningAccessService } from './learning-access.service';
import { referencesOf } from './restriction';
import { conditionsOf } from './restriction-audience';
import type { SightSubjectKind } from './sight-report.service';

export const GROUP_CONTENT_VIAS = ['audience', 'condition'] as const;
export type GroupContentVia = (typeof GROUP_CONTENT_VIAS)[number];

export interface GroupContentItem {
  readonly kind: SightSubjectKind;
  readonly id: string;
  readonly title: string;
  readonly spaceId: string;
  readonly sectionId: string | null;
  readonly sectionTitle: string | null;
  readonly via: GroupContentVia[];
  readonly hideFromOthers: boolean;
}

export interface GroupContent {
  readonly group: { id: string; code: string; name: string | null };
  readonly items: GroupContentItem[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

interface Candidate {
  readonly kind: SightSubjectKind;
  readonly id: string;
  readonly title: string;
  readonly spaceId: string;
  readonly sectionId: string | null;
  readonly position: number | null;
  readonly restriction: Restriction | null;
}

@Injectable()
export class GroupContentService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly access: LearningAccessService,
  ) {}

  async forGroup(
    institutionId: string,
    offeringId: string,
    groupId: string,
    userId: string,
    query: StudentPageQuery,
  ): Promise<GroupContent> {
    await this.access.assertOffering(institutionId, offeringId);
    await this.access.assertAuthorOfOffering(institutionId, offeringId, userId);

    const [group] = await this.reader
      .select({ id: studyGroups.id, code: studyGroups.code, name: studyGroups.name })
      .from(studyGroups)
      .where(
        and(
          eq(studyGroups.id, groupId),
          eq(studyGroups.courseOfferingId, offeringId),
          isNull(studyGroups.deletedAt),
        ),
      );
    if (!group) throw new EntityNotFoundError('study_group', groupId);

    const spaceIds = (
      await this.reader
        .select({ id: learningSpaces.id })
        .from(learningSpaces)
        .where(
          and(
            eq(learningSpaces.courseOfferingId, offeringId),
            eq(learningSpaces.institutionId, institutionId),
            isNull(learningSpaces.deletedAt),
          ),
        )
    ).map((row) => row.id);
    const empty = { group, items: [], total: 0, page: query.page, limit: query.limit };
    if (spaceIds.length === 0) return empty;

    const [sections, candidates] = await Promise.all([
      this.sectionsOf(spaceIds),
      this.candidates(spaceIds, groupId, query.q),
    ]);
    const sectionOrder = new Map(sections.map((row, at) => [row.id, at]));
    const sectionTitles = new Map(sections.map((row) => [row.id, row.title]));

    const items = candidates.flatMap((candidate): GroupContentItem[] => {
      const via = viaOf(candidate.restriction, groupId);
      if (via.length === 0) return [];

      const sectionId = candidate.kind === 'section' ? candidate.id : candidate.sectionId;

      return [
        {
          kind: candidate.kind,
          id: candidate.id,
          title: candidate.title,
          spaceId: candidate.spaceId,
          sectionId,
          sectionTitle: sectionId === null ? null : (sectionTitles.get(sectionId) ?? null),
          via,
          hideFromOthers: candidate.restriction?.audience?.hideFromOthers ?? false,
        },
      ];
    });

    const rank = (item: GroupContentItem) => {
      const candidate = candidates.find((row) => row.id === item.id);

      return [
        item.sectionId === null ? -1 : (sectionOrder.get(item.sectionId) ?? -1),
        item.kind === 'section' ? -1 : (candidate?.position ?? 0),
      ] as const;
    };

    const ordered = [...items].sort((left, right) => {
      const [leftSection, leftPosition] = rank(left);
      const [rightSection, rightPosition] = rank(right);

      return leftSection - rightSection || leftPosition - rightPosition;
    });
    const from = (query.page - 1) * query.limit;

    return {
      ...empty,
      items: ordered.slice(from, from + query.limit),
      total: ordered.length,
    };
  }

  private sectionsOf(spaceIds: string[]) {
    return this.reader
      .select({ id: learningSections.id, title: learningSections.title })
      .from(learningSections)
      .where(
        and(
          inArray(learningSections.learningSpaceId, spaceIds),
          isNull(learningSections.deletedAt),
        ),
      )
      .orderBy(learningSections.position, learningSections.createdAt);
  }

  private async candidates(
    spaceIds: string[],
    groupId: string,
    q: string | undefined,
  ): Promise<Candidate[]> {
    const search = q?.trim();
    const pattern = search
      ? `%${search.replaceAll(/[\\%_]/gu, (match) => `\\${match}`)}%`
      : null;
    const naming = (column: AnyColumn, title: AnyColumn) =>
      and(
        sql`${column}::text like ${`%${groupId}%`}`,
        pattern === null ? undefined : sql`${title} ilike ${pattern}`,
      );

    const [sections, materials, activities] = await Promise.all([
      this.reader
        .select({
          id: learningSections.id,
          title: learningSections.title,
          spaceId: learningSections.learningSpaceId,
          position: learningSections.position,
          restriction: learningSections.restriction,
        })
        .from(learningSections)
        .where(
          and(
            inArray(learningSections.learningSpaceId, spaceIds),
            isNull(learningSections.deletedAt),
            naming(learningSections.restriction, learningSections.title),
          ),
        ),
      this.reader
        .select({
          id: learningMaterials.id,
          title: learningMaterials.title,
          spaceId: learningMaterials.learningSpaceId,
          sectionId: learningMaterials.sectionId,
          position: learningMaterials.position,
          restriction: learningMaterials.restriction,
        })
        .from(learningMaterials)
        .where(
          and(
            inArray(learningMaterials.learningSpaceId, spaceIds),
            isNull(learningMaterials.deletedAt),
            naming(learningMaterials.restriction, learningMaterials.title),
          ),
        ),
      this.reader
        .select({
          id: learningActivities.id,
          title: learningActivities.name,
          spaceId: learningActivities.learningSpaceId,
          sectionId: learningActivities.sectionId,
          position: learningActivities.position,
          restriction: learningActivities.restriction,
        })
        .from(learningActivities)
        .where(
          and(
            inArray(learningActivities.learningSpaceId, spaceIds),
            eq(learningActivities.type, 'assignment'),
            isNull(learningActivities.deletedAt),
            naming(learningActivities.restriction, learningActivities.name),
          ),
        ),
    ]);

    return [
      ...sections.map((row) => ({ ...row, kind: 'section' as const, sectionId: null })),
      ...materials.map((row) => ({ ...row, kind: 'material' as const })),
      ...activities.map((row) => ({ ...row, kind: 'assignment' as const })),
    ];
  }

  private get reader() {
    return this.txHost.reader();
  }
}

function viaOf(restriction: Restriction | null, groupId: string): GroupContentVia[] {
  return [
    ...(restriction?.audience?.groupIds.includes(groupId) ? (['audience'] as const) : []),
    ...(referencesOf([conditionsOf(restriction)]).groupIds.includes(groupId)
      ? (['condition'] as const)
      : []),
  ];
}
