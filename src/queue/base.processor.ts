import { OnWorkerEvent, WorkerHost } from '@nestjs/bullmq';
import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import type { z } from 'zod';

export abstract class BaseProcessor<
  TSchemas extends Record<string, z.ZodType>,
> extends WorkerHost {
  protected abstract readonly schemas: TSchemas;

  protected abstract readonly handlers: {
    [K in keyof TSchemas]: (payload: z.infer<TSchemas[K]>, job: Job) => Promise<void>;
  };

  constructor(protected readonly logger: PinoLogger) {
    super();
    this.logger.setContext(this.constructor.name);
  }

  async process(job: Job): Promise<void> {
    const name = job.name as keyof TSchemas & string;
    const schema = this.schemas[name];

    if (!schema) {
      throw new UnrecoverableError(`No schema registered for job "${name}"`);
    }

    const parsed = schema.safeParse(job.data);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');

      throw new UnrecoverableError(`Invalid payload for job "${name}": ${issues}`);
    }

    const startedAt = performance.now();
    await this.handlers[name](parsed.data as never, job);

    this.logger.info(
      {
        jobId: job.id,
        jobName: name,
        attempt: job.attemptsMade + 1,
        durationMs: Math.round(performance.now() - startedAt),
      },
      'job completed',
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(
      {
        err: error,
        jobId: job?.id,
        jobName: job?.name,
        attempt: (job?.attemptsMade ?? 0) + 1,
        maxAttempts: job?.opts.attempts,
        terminal: error instanceof UnrecoverableError || !this.willRetry(job),
      },
      'job failed',
    );
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string): void {
    this.logger.warn({ jobId }, 'job stalled — worker died or event loop blocked');
  }

  @OnWorkerEvent('error')
  onError(error: Error): void {
    this.logger.error({ err: error }, 'worker error');
  }

  private willRetry(job: Job | undefined): boolean {
    if (!job) return false;

    return job.attemptsMade + 1 < (job.opts.attempts ?? 1);
  }
}
