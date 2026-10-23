import { Injectable } from '@nestjs/common';

import { TransactionHost } from '../../database/transaction.host';
import { LearningActivityNotificationsService } from '../notifications/learning-activity-notifications.service';

import {
  AssignmentAnnouncementsRepository,
  type RestrictedCandidate,
} from './assignment-announcements.repository';
import { AvailabilityService } from './learning-availability.service';
import { RestrictionFactsRepository } from './restriction-facts.repository';

@Injectable()
export class AssignmentAnnouncementsService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly repository: AssignmentAnnouncementsRepository,
    private readonly notifications: LearningActivityNotificationsService,
    private readonly availability: AvailabilityService,
    private readonly facts: RestrictionFactsRepository,
  ) {}

  announceNewlySeen(now: Date, spaceId?: string): Promise<number> {
    return this.txHost.run(async () => {
      const claimed = await this.repository.claimNewlySeen(now, spaceId);
      for (const activity of claimed) {
        await this.notifications.published(activity.institutionId, activity, now);
      }

      let restricted = 0;
      for (const candidate of await this.repository.restrictedCandidates(now, spaceId)) {
        if (await this.announceToThoseLetIn(candidate, now)) restricted += 1;
      }

      return claimed.length + restricted;
    });
  }

  private async announceToThoseLetIn(
    { activity, offeringId }: RestrictedCandidate,
    now: Date,
  ): Promise<boolean> {
    if (offeringId === null) return false;

    const recipients = await this.availability.whoCanOpen(
      { spaceId: activity.learningSpaceId, offeringId },
      activity,
      await this.facts.enrolledStudents(offeringId),
      now,
    );
    if (recipients.length === 0) return false;

    const claimed = await this.repository.claim(activity.id, now);
    if (!claimed) return false;

    await this.notifications.published(claimed.institutionId, claimed, now, recipients);

    return true;
  }
}
