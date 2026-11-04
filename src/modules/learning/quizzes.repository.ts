import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, type SQL } from 'drizzle-orm';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import {
  assessments,
  learningActivities,
  quizSlots,
  quizzes,
  type Assessment,
  type LearningActivity,
  type Quiz,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { slotTotals, type SlotTotals } from './quiz-policy';

export interface QuizEntry {
  readonly activity: LearningActivity;
  readonly assessment: Assessment;
  readonly quiz: Quiz | null;
  readonly totals: SlotTotals | null;
}

@Injectable()
export class QuizzesRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async inSpace(spaceId: string): Promise<QuizEntry[]> {
    const rows = await this.joined(this.txHost.reader())
      .where(and(eq(learningActivities.learningSpaceId, spaceId), live()))
      .orderBy(asc(learningActivities.position), asc(learningActivities.createdAt));

    return this.withTotals(rows);
  }

  async findOrFail(spaceId: string, quizId: string): Promise<QuizEntry> {
    const [row] = await this.joined(this.txHost.client())
      .where(
        and(
          eq(learningActivities.id, quizId),
          eq(learningActivities.learningSpaceId, spaceId),
          live(),
        ),
      )
      .limit(1);
    if (!row) throw new EntityNotFoundError('quiz', quizId);

    const [entry] = await this.withTotals([row]);
    if (!entry) throw new EntityNotFoundError('quiz', quizId);

    return entry;
  }

  async insertSettings(values: typeof quizzes.$inferInsert): Promise<void> {
    await this.txHost.client().insert(quizzes).values(values);
  }

  async updateSettings(quizId: string, changes: Partial<Quiz>): Promise<void> {
    if (Object.keys(changes).length === 0) return;

    await this.txHost
      .client()
      .update(quizzes)
      .set(changes)
      .where(eq(quizzes.learningActivityId, quizId));
  }

  private joined(db: ReturnType<TransactionHost['reader']>) {
    return db
      .select({ activity: learningActivities, assessment: assessments, quiz: quizzes })
      .from(learningActivities)
      .innerJoin(quizzes, eq(quizzes.learningActivityId, learningActivities.id))
      .innerJoin(
        assessments,
        and(
          eq(assessments.learningActivityId, learningActivities.id),
          isNull(assessments.deletedAt),
        ),
      );
  }

  private async withTotals(
    rows: { activity: LearningActivity; assessment: Assessment; quiz: Quiz }[],
  ): Promise<QuizEntry[]> {
    if (rows.length === 0) return [];

    const slots = await this.txHost
      .client()
      .select({
        quizId: quizSlots.learningActivityId,
        kind: quizSlots.kind,
        pickCount: quizSlots.pickCount,
        mark: quizSlots.mark,
      })
      .from(quizSlots)
      .where(
        inArray(
          quizSlots.learningActivityId,
          rows.map((row) => row.activity.id),
        ),
      );

    return rows.map((row) => ({
      ...row,
      totals: slotTotals(slots.filter((slot) => slot.quizId === row.activity.id)),
    }));
  }
}

function live(): SQL | undefined {
  return and(eq(learningActivities.type, 'quiz'), isNull(learningActivities.deletedAt));
}
