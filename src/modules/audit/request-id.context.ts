import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Carries the request id to code far below the controller, so an audit row can
 * name the request that caused it without every service signature growing a
 * parameter it has no other use for.
 */
const storage = new AsyncLocalStorage<string>();

export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return storage.run(requestId, fn);
}

export function currentRequestId(): string | null {
  return storage.getStore() ?? null;
}
