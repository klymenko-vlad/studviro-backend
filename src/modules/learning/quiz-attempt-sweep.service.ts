import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';

import { QuizAttemptClosingService } from './quiz-attempt-closing.service';

const SWEEP_INTERVAL_MS = 60 * 1000;

@Injectable()
export class QuizAttemptSweepService {
  private running = false;

  constructor(
    private readonly closing: QuizAttemptClosingService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QuizAttemptSweepService.name);
  }

  @Interval(SWEEP_INTERVAL_MS)
  async sweep(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;

    try {
      return await this.closing.closeOverdue(now);
    } catch (error) {
      this.logger.warn({ err: error }, 'quiz attempt sweep failed');

      return 0;
    } finally {
      this.running = false;
    }
  }
}
