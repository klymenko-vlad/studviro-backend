import { setTimeout as delay } from 'node:timers/promises';

import { isRetryableDatabaseError } from './repository/database-error';

export interface SerializableRetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const DEFAULTS = {
  attempts: 3,
  baseDelayMs: 20,
  maxDelayMs: 200,
  sleep: (ms: number) => delay(ms),
  random: Math.random,
} satisfies Required<SerializableRetryOptions>;

/**
 * Replays work that Postgres refused to commit because it raced another
 * transaction. Only `40001` and `40P01` are replayed: both mean "nothing
 * happened, ask again", while every other failure is an answer.
 *
 * The wait is exponential with full jitter, because the callers that need this
 * are herds — an unjittered backoff re-collides the same herd on the same
 * millisecond.
 */
export async function retryOnSerializationFailure<T>(
  work: () => Promise<T>,
  options: SerializableRetryOptions = {},
): Promise<T> {
  const { attempts, baseDelayMs, maxDelayMs, sleep, random } = { ...DEFAULTS, ...options };

  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      if (attempt >= attempts || !isRetryableDatabaseError(error)) throw error;

      const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      await sleep(Math.round(ceiling * random()));
    }
  }
}
