import { Injectable } from '@nestjs/common';

import { TransactionHost } from '../../database/transaction.host';
import { LearningActivityNotificationsService } from '../notifications/learning-activity-notifications.service';

import { AssignmentAnnouncementsRepository } from './assignment-announcements.repository';

@Injectable()
export class AssignmentAnnouncementsService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly repository: AssignmentAnnouncementsRepository,
    private readonly notifications: LearningActivityNotificationsService,
  ) {}

  announceNewlySeen(now: Date, spaceId?: string): Promise<number> {
    return this.txHost.run(async () => {
      const claimed = await this.repository.claimNewlySeen(now, spaceId);
      for (const activity of claimed) {
        await this.notifications.published(activity.institutionId, activity, now);
      }

      return claimed.length;
    });
  }
}
