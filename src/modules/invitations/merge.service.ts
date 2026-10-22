import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { Transaction } from '../../database/database.tokens';
import {
  enrollments,
  examRegistrations,
  externalIdentities,
  notificationDeliveries,
  programMemberships,
  roleAssignments,
  studyGroupMemberships,
  teachingAssignments,
} from '../../database/schema';
import { UsersRepository } from '../users/users.repository';

/**
 * Every live table that owns a `user_id` pointing at an ordinary account (not
 * a nullable "who did this" attribution such as `official_course_results
 * .proposed_by_id`, which is unaffected by which student the row is about).
 * `official_course_results` is deliberately absent: it hangs off
 * `enrollments.id`, so repointing `enrollments.user_id` carries it along for
 * free.
 *
 * Adding a table that owns a `user_id` without adding it here is a merge bug,
 * not a style nit — see ADR 0018.
 */
const MERGED_TABLES = [
  externalIdentities,
  roleAssignments,
  programMemberships,
  enrollments,
  teachingAssignments,
  examRegistrations,
  studyGroupMemberships,
  notificationDeliveries,
] as const;

@Injectable()
export class MergeService {
  constructor(private readonly users: UsersRepository) {}

  /**
   * Repoints every row the shadow (the `invited` import) owns onto the
   * survivor (the account that proved control of the mailbox), then
   * soft-deletes the shadow with `merged_into_user_id` set so the trail
   * survives. One transaction: a crash half-way through must not leave a
   * course result pointing at a user notifications no longer reach.
   *
   * A unique-constraint collision (the survivor already holds the exact row
   * the shadow held — e.g. the same role in the same scope) fails the whole
   * transaction rather than silently dropping the shadow's copy; see the ADR's
   * "known limitation" note.
   */
  async merge(shadowId: string, survivorId: string, tx: Transaction): Promise<void> {
    for (const table of MERGED_TABLES) {
      await tx.update(table).set({ userId: survivorId }).where(eq(table.userId, shadowId));
    }

    await this.users.update(shadowId, { mergedIntoUserId: survivorId }, tx);
    await this.users.softDelete(shadowId, tx);
  }
}
