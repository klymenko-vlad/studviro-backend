import { Injectable } from '@nestjs/common';

import { windowState } from '../enrollment/enrollable-offerings.service';

import { NotificationEmitterService } from './notification-emitter.service';
import { WaitlistNotificationsRepository } from './waitlist-notifications.repository';

const ON_OFFER = ['planned', 'open', 'running'];

@Injectable()
export class WaitlistNotificationsService {
  constructor(
    private readonly repository: WaitlistNotificationsRepository,
    private readonly emitter: NotificationEmitterService,
  ) {}

  /**
   * Tells everyone queueing for a course that a place may be theirs. Called
   * after anything that can free a seat; it checks for itself whether one is
   * free and whether a queueing student could take it now, so a caller need
   * not. Everyone waiting hears at once, because the place goes to whoever asks
   * first while the window is open (ADR 0034) — the queue's order is for the
   * registrar, not a promise.
   */
  async placeMayHaveFreed(
    institutionId: string,
    offeringId: string,
    now = new Date(),
  ): Promise<number> {
    const offering = await this.repository.findOffering(institutionId, offeringId);
    if (!offering || !ON_OFFER.includes(offering.status)) return 0;
    if (offering.capacity !== null && offering.occupiedSeats >= offering.capacity) return 0;
    if (windowState(offering, now) !== 'open') return 0;

    const waiting = await this.repository.findWaiting(institutionId, offeringId);
    if (waiting.length === 0) return 0;

    return this.emitter.emit({
      institutionId,
      type: 'waitlist_place_free',
      subjectId: offeringId,
      courseOfferingId: offeringId,
      examTermId: null,
      learningActivityId: null,
      recipients: waiting,
      payload: {},
      occurredAt: now,
    });
  }

  /**
   * A student who has left the queue — by taking the place, leaving, or being
   * admitted or refused — has no use for "a place came free" any more.
   */
  async leftQueue(
    institutionId: string,
    userId: string,
    offeringId: string,
    now = new Date(),
  ): Promise<void> {
    await this.repository.markPlaceFreeRead(institutionId, userId, offeringId, now);
  }
}
