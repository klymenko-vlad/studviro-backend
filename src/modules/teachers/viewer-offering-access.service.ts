import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import {
  ENROLLMENT_RECORDED_STATUSES,
  enrollments,
  teachingAssignments,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { AuthorizationService } from '../authorization/authorization.service';
import { administersOfferings } from '../courses/administers-offering';

@Injectable()
export class ViewerOfferingAccessService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly authorization: AuthorizationService,
  ) {}

  async openableBy(
    institutionId: string,
    viewerId: string,
    offeringIds: readonly string[],
  ): Promise<(offeringId: string) => boolean> {
    if (offeringIds.length === 0) return () => false;
    if (await administersOfferings(this.authorization, viewerId, institutionId)) {
      return () => true;
    }

    const [teaches, enrolled] = await Promise.all([
      this.reader
        .select({ offeringId: teachingAssignments.courseOfferingId })
        .from(teachingAssignments)
        .where(
          and(
            eq(teachingAssignments.userId, viewerId),
            inArray(teachingAssignments.courseOfferingId, [...offeringIds]),
            isNull(teachingAssignments.deletedAt),
          ),
        ),
      this.reader
        .select({ offeringId: enrollments.courseOfferingId })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.userId, viewerId),
            inArray(enrollments.courseOfferingId, [...offeringIds]),
            inArray(enrollments.status, [...ENROLLMENT_RECORDED_STATUSES]),
            isNull(enrollments.deletedAt),
          ),
        ),
    ]);
    const open = new Set([...teaches, ...enrolled].map((row) => row.offeringId));

    return (offeringId) => open.has(offeringId);
  }

  private get reader() {
    return this.txHost.reader();
  }
}
