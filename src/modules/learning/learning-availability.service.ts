import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import {
  learningSections,
  type LearningSection,
  type Restriction,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import type { Access } from './access-explanation';
import { AvailabilityLens, type OutlineItem, type Restricted } from './availability-lens';
import type { LearningSpaceContext, LearningStance } from './learning-access.service';
import { referencesOf } from './restriction';
import {
  RestrictionFactsRepository,
  type RestrictionScope,
} from './restriction-facts.repository';
import { NO_FACTS, type StudentFacts } from './restriction-verdict';
import { NO_NAMES, type RestrictionView } from './restriction-view';

export type Gated<T> = T & { readonly gate: RestrictionView | null };

export interface OutlineView<T> {
  readonly itemOf: (row: T) => OutlineItem;
  readonly teaser: (row: T) => T;
}

export type ExplainSubject =
  | { readonly kind: 'section'; readonly section: LearningSection }
  | { readonly kind: 'item'; readonly item: OutlineItem };

export interface Viewer extends RestrictionScope {
  readonly stance: LearningStance;
  readonly userId: string;
}

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly facts: RestrictionFactsRepository,
  ) {}

  async sift<T>(
    context: LearningSpaceContext,
    rows: readonly T[],
    view: OutlineView<T>,
    now = new Date(),
  ): Promise<Gated<T>[]> {
    const lens = await this.lensFor(viewerOf(context), rows.map(view.itemOf), now);

    return rows.flatMap((row) => {
      const gate = lens.itemGate(view.itemOf(row));
      if (gate.sight === 'none') return [];

      return [{ ...(gate.sight === 'title' ? view.teaser(row) : row), gate: gate.restriction }];
    });
  }

  async siftSections(
    context: LearningSpaceContext,
    teaser: (row: LearningSection) => LearningSection,
    now = new Date(),
  ): Promise<Gated<LearningSection>[]> {
    const sections = await this.sectionsOf(context.space.id);
    const lens = await this.lensFor(viewerOf(context), [], now, sections);

    return sections.flatMap((section) => {
      const gate = lens.sectionGate(section);
      if (gate.sight === 'none') return [];

      return [
        { ...(gate.sight === 'title' ? teaser(section) : section), gate: gate.restriction },
      ];
    });
  }

  async gated<T extends Restricted>(
    context: LearningSpaceContext,
    row: T,
    now = new Date(),
  ): Promise<Gated<T>> {
    const lens = await this.lensFor(viewerOf(context), [], now, [], [row.restriction]);

    return { ...row, gate: lens.gateOf(row).restriction };
  }

  async isOpenTo(
    context: LearningSpaceContext,
    item: OutlineItem,
    now = new Date(),
  ): Promise<boolean> {
    if (context.stance === 'author') return true;

    const lens = await this.lensFor(viewerOf(context), [item], now);

    return lens.itemGate(item).sight === 'full';
  }

  async openItems<T extends OutlineItem>(
    viewer: Viewer,
    items: readonly T[],
    now = new Date(),
  ): Promise<T[]> {
    if (viewer.stance === 'author') return [...items];

    const lens = await this.lensFor(viewer, items, now);

    return items.filter((item) => lens.itemGate(item).sight === 'full');
  }

  async whoCanOpen(
    scope: RestrictionScope,
    item: OutlineItem,
    userIds: readonly string[],
    now = new Date(),
  ): Promise<string[]> {
    const sections = await this.sectionsOf(scope.spaceId);
    const restrictions = [item.restriction, ...sections.map((section) => section.restriction)];
    const [facts, names] = await Promise.all([
      this.facts.factsOf(scope, userIds),
      this.facts.namesOf(scope, referencesOf(restrictions)),
    ]);

    return userIds.filter((userId) => {
      const lens = new AvailabilityLens(
        'participant',
        sections,
        facts.get(userId) ?? NO_FACTS,
        names,
        now,
      );

      return lens.itemGate(item).sight === 'full';
    });
  }

  async explain(
    scope: RestrictionScope,
    subject: ExplainSubject,
    userIds: readonly string[],
    now = new Date(),
  ): Promise<Map<string, Access>> {
    const sections = await this.sectionsOf(scope.spaceId);
    const section =
      subject.kind === 'section'
        ? subject.section
        : (sections.find((row) => row.id === subject.item.sectionId) ?? null);
    const restrictions = [
      section?.restriction ?? null,
      subject.kind === 'item' ? subject.item.restriction : null,
    ];
    const restricted = restrictions.some((restriction) => restriction !== null);
    const [facts, names] = restricted
      ? await Promise.all([
          this.facts.factsOf(scope, userIds),
          this.facts.namesOf(scope, referencesOf(restrictions)),
        ])
      : [new Map<string, StudentFacts>(), NO_NAMES];

    return new Map(
      userIds.map((userId) => {
        const lens = new AvailabilityLens(
          'participant',
          [],
          facts.get(userId) ?? NO_FACTS,
          names,
          now,
        );
        const access =
          subject.kind === 'section'
            ? lens.explainSection(subject.section)
            : lens.explainItem(subject.item, section);

        return [userId, access];
      }),
    );
  }

  private async lensFor(
    viewer: Viewer,
    items: readonly OutlineItem[],
    now: Date,
    known?: readonly LearningSection[],
    extra: readonly (Restriction | null)[] = [],
  ): Promise<AvailabilityLens> {
    const sections = known ?? (await this.sectionsOf(viewer.spaceId));
    const restrictions = [
      ...sections.map((section) => section.restriction),
      ...items.map((item) => item.restriction),
      ...extra,
    ];
    if (restrictions.every((restriction) => restriction === null)) {
      return new AvailabilityLens(viewer.stance, sections, NO_FACTS, NO_NAMES, now);
    }

    const [facts, names] = await Promise.all([
      this.studentFacts(viewer),
      this.facts.namesOf(viewer, referencesOf(restrictions)),
    ]);

    return new AvailabilityLens(viewer.stance, sections, facts, names, now);
  }

  private async studentFacts(viewer: Viewer): Promise<StudentFacts> {
    if (viewer.stance === 'author') return NO_FACTS;

    return (await this.facts.factsOf(viewer, [viewer.userId])).get(viewer.userId) ?? NO_FACTS;
  }

  private sectionsOf(spaceId: string): Promise<LearningSection[]> {
    return this.txHost
      .reader()
      .select()
      .from(learningSections)
      .where(
        and(eq(learningSections.learningSpaceId, spaceId), isNull(learningSections.deletedAt)),
      )
      .orderBy(learningSections.position, learningSections.createdAt);
  }
}

export function viewerOf(context: LearningSpaceContext): Viewer {
  return {
    spaceId: context.space.id,
    offeringId: context.offeringId,
    stance: context.stance,
    userId: context.userId,
  };
}
