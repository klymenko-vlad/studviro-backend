import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import {
  examRegistrations,
  examTerms,
  externalIdentities,
  type ExamRegistration,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface ExamRegistrationWriteContext {
  readonly registrationId: string;
  readonly registrationExternalId: string | null;
  readonly examTermExternalId: string | null;
  readonly personExternalId: string | null;
}

@Injectable()
export class ExamRegistrationWriteRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async findContext(
    institutionId: string,
    registrationId: string,
    connectorName: string,
  ): Promise<ExamRegistrationWriteContext | undefined> {
    const [row] = await this.txHost
      .client()
      .select({
        registrationId: examRegistrations.id,
        registrationExternalId: examRegistrations.externalId,
        examTermExternalId: examTerms.externalId,
        personExternalId: externalIdentities.subject,
      })
      .from(examRegistrations)
      .innerJoin(examTerms, eq(examTerms.id, examRegistrations.examTermId))
      .leftJoin(
        externalIdentities,
        and(
          eq(externalIdentities.userId, examRegistrations.userId),
          eq(externalIdentities.institutionId, institutionId),
          eq(externalIdentities.issuer, connectorName),
          isNull(externalIdentities.deletedAt),
        ),
      )
      .where(
        and(
          eq(examRegistrations.id, registrationId),
          eq(examRegistrations.institutionId, institutionId),
          isNull(examTerms.deletedAt),
        ),
      )
      .limit(1);

    return row;
  }

  async markPending(registrationId: string): Promise<void> {
    await this.txHost
      .client()
      .update(examRegistrations)
      .set({ synchronizationStatus: 'pending' })
      .where(eq(examRegistrations.id, registrationId));
  }

  /**
   * Until the row carries the identifier the source assigned, the next import
   * of that domain cannot match it and would create a second row beside ours.
   */
  async stampAcknowledged(
    registrationId: string,
    sourceSystem: 'sis' | 'lms',
    externalId: string | null,
    now: Date,
  ): Promise<void> {
    await this.txHost
      .client()
      .update(examRegistrations)
      .set({
        synchronizationStatus: 'in_sync',
        lastSynchronizedAt: now,
        ...(externalId === null ? {} : { sourceSystem, externalId }),
      })
      .where(eq(examRegistrations.id, registrationId));
  }

  async markFailed(registrationId: string): Promise<void> {
    await this.txHost
      .client()
      .update(examRegistrations)
      .set({ synchronizationStatus: 'failed' })
      .where(eq(examRegistrations.id, registrationId));
  }

  /** The source refused the registration, so it is not a registration. */
  async compensateCreate(
    registrationId: string,
    now: Date,
  ): Promise<ExamRegistration | undefined> {
    const [reversed] = await this.txHost
      .client()
      .update(examRegistrations)
      .set({ status: 'cancelled', cancelledAt: now, synchronizationStatus: 'in_sync' })
      .where(and(eq(examRegistrations.id, registrationId), isNull(examRegistrations.deletedAt)))
      .returning();

    return reversed;
  }
}
