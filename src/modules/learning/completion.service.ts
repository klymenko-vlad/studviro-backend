import { Injectable } from '@nestjs/common';

import type { ActivityCompletionState } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import {
  completedAtOf,
  completionKey,
  completionStateOf,
  isCompleteState,
  type CompletionItem,
} from './completion-rule';
import {
  CompletionRepository,
  type CompletionWrite,
  type RecordedCompletion,
} from './completion.repository';

export interface OwnCompletion {
  readonly state: ActivityCompletionState;
  readonly completedAt: Date | null;
}

@Injectable()
export class CompletionService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly repository: CompletionRepository,
  ) {}

  async isComplete(userId: string, item: CompletionItem): Promise<boolean> {
    const [row] = await this.repository.recorded([userId], [item]);

    return isCompleteState(row?.state ?? null);
  }

  async completedItems(userId: string, spaceId: string): Promise<ReadonlySet<string>> {
    const items = await this.repository.completedInSpace(userId, spaceId);

    return new Set(items.map(completionKey));
  }

  recorded(
    userIds: readonly string[],
    items: readonly CompletionItem[],
  ): Promise<RecordedCompletion[]> {
    return this.repository.recorded(userIds, items);
  }

  async recompute(item: CompletionItem, userIds?: readonly string[]): Promise<void> {
    const subject = await this.repository.subject(item);
    if (!subject) return;

    const writes = (await this.repository.facts(item, userIds)).flatMap(
      (facts): CompletionWrite[] => {
        const state = completionStateOf(subject, facts);
        if (state === facts.recorded || (facts.recorded === null && state === 'incomplete')) {
          return [];
        }

        return [{ userId: facts.userId, state, completedAt: completedAtOf(subject, facts) }];
      },
    );

    await this.repository.writeStates(item, subject.institutionId, writes);
  }

  async recordView(
    institutionId: string,
    userId: string,
    item: CompletionItem,
    now = new Date(),
  ): Promise<void> {
    await this.txHost.run(async () => {
      await this.repository.recordFact(item, institutionId, userId, 'viewedAt', now);
      await this.recompute(item, [userId]);
    });
  }

  async markDone(
    institutionId: string,
    userId: string,
    item: CompletionItem,
    done: boolean,
    now = new Date(),
  ): Promise<OwnCompletion> {
    return this.txHost.run(async () => {
      await this.repository.recordFact(
        item,
        institutionId,
        userId,
        'markedDoneAt',
        done ? now : null,
      );
      await this.recompute(item, [userId]);

      const [row] = await this.repository.recorded([userId], [item]);

      return { state: row?.state ?? 'incomplete', completedAt: row?.completedAt ?? null };
    });
  }
}
