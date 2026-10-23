import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';

import { AssignmentAnnouncementsService } from './assignment-announcements.service';

const SWEEP_INTERVAL_MS = 60 * 1000;

@Injectable()
export class AssignmentAnnouncementSweepService {
  private running = false;

  constructor(
    private readonly announcements: AssignmentAnnouncementsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AssignmentAnnouncementSweepService.name);
  }

  @Interval(SWEEP_INTERVAL_MS)
  async sweep(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;

    try {
      return await this.announcements.announceNewlySeen(now);
    } catch (error) {
      this.logger.warn({ err: error }, 'assignment announcement sweep failed');

      return 0;
    } finally {
      this.running = false;
    }
  }
}
