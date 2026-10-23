import { Injectable } from '@nestjs/common';

import {
  ConflictError,
  EntityNotFoundError,
  PermissionDeniedError,
} from '../../common/errors/domain.error';
import type { ActivityCompletionState } from '../../database/schema';

import { completionKey, isCompleteState, type CompletionItem } from './completion-rule';
import { CompletionService } from './completion.service';
import { LearningAccessService, type LearningSpaceContext } from './learning-access.service';
import { AvailabilityService, viewerOf } from './learning-availability.service';
import { TrackedItemsRepository, type TrackedItem } from './tracked-items.repository';

export interface ItemProgress extends CompletionItem {
  readonly sectionId: string | null;
  readonly rule: TrackedItem['rule'];
  readonly state: ActivityCompletionState;
  readonly completedAt: Date | null;
}

export interface Tally {
  readonly done: number;
  readonly total: number;
}

export interface SectionProgress extends Tally {
  readonly sectionId: string | null;
}

export interface Progress extends Tally {
  readonly sections: SectionProgress[];
  readonly items: ItemProgress[];
}

@Injectable()
export class MyProgressService {
  constructor(
    private readonly access: LearningAccessService,
    private readonly availability: AvailabilityService,
    private readonly tracked: TrackedItemsRepository,
    private readonly completion: CompletionService,
  ) {}

  async forSpace(
    institutionId: string,
    spaceId: string,
    userId: string,
    now = new Date(),
  ): Promise<Progress> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    const items = await this.openItems(context, now);
    const recorded = new Map(
      (await this.completion.recorded([userId], items)).map((row) => [
        completionKey(row.item),
        row,
      ]),
    );

    const progress = items.map((item): ItemProgress => {
      const row = recorded.get(completionKey(item));

      return {
        kind: item.kind,
        id: item.id,
        sectionId: item.sectionId,
        rule: item.rule,
        state: row?.state ?? 'incomplete',
        completedAt: row?.completedAt ?? null,
      };
    });

    return { ...tally(progress), sections: bySection(progress), items: progress };
  }

  async markDone(
    institutionId: string,
    spaceId: string,
    userId: string,
    item: CompletionItem,
    done: boolean,
    now = new Date(),
  ): Promise<ItemProgress> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    if (context.stance !== 'participant') {
      throw new PermissionDeniedError(
        'COMPLETION_STUDENTS_ONLY',
        'Only a student on this course keeps track of their own progress in it',
      );
    }

    const tracked = await this.tracked.find(spaceId, item);
    if (!tracked || !(await this.availability.isOpenTo(context, tracked, now))) {
      throw new EntityNotFoundError(item.kind, item.id);
    }
    if (tracked.rule !== 'manual') {
      throw new ConflictError(
        'COMPLETION_NOT_MANUAL',
        'This item is completed by what the student does, not by ticking it',
        { rule: tracked.rule },
      );
    }

    const own = await this.completion.markDone(institutionId, userId, item, done, now);

    return { ...item, sectionId: tracked.sectionId, rule: tracked.rule, ...own };
  }

  private async openItems(context: LearningSpaceContext, now: Date): Promise<TrackedItem[]> {
    const items = await this.tracked.inOutlineOrder(context.space.id);

    return this.availability.openItems(viewerOf(context), items, now);
  }
}

function tally(items: readonly ItemProgress[]): Tally {
  return {
    done: items.filter((item) => isCompleteState(item.state)).length,
    total: items.length,
  };
}

function bySection(items: readonly ItemProgress[]): SectionProgress[] {
  const groups = new Map<string | null, ItemProgress[]>();
  for (const item of items) {
    const bucket = groups.get(item.sectionId);
    if (bucket) bucket.push(item);
    else groups.set(item.sectionId, [item]);
  }

  return [...groups].map(([sectionId, group]) => ({ sectionId, ...tally(group) }));
}
