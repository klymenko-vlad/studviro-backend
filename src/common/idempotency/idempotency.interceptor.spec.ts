import { ConflictException, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type Redis from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import { firstValueFrom, of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppConfigService } from '../../config/app-config.service';

import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IDEMPOTENCY_HEADER, IDEMPOTENT_KEY } from './idempotent.decorator';

/**
 * Enough of Redis to exercise the paths that matter: `SET NX` has to fail when
 * a key is already claimed, and the release script has to compare the token
 * before deleting. Anything weaker would let the interceptor pass while still
 * admitting the duplicate writes it exists to stop.
 */
class FakeRedis {
  readonly store = new Map<string, string>();

  set(key: string, value: string, _px: 'PX', _ttl: number, nx?: 'NX'): Promise<'OK' | null> {
    if (nx === 'NX' && this.store.has(key)) return Promise.resolve(null);

    this.store.set(key, value);

    return Promise.resolve('OK');
  }

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.store.get(key) ?? null);
  }

  /** Mirrors the compare-and-delete the real Lua script performs. */
  eval(_script: string, _keys: number, key: string, token: string): Promise<number> {
    const current = this.store.get(key);
    if (current === undefined) return Promise.resolve(0);

    const entry = JSON.parse(current) as { state: string; token?: string };
    if (entry.state === 'in_progress' && entry.token === token) {
      this.store.delete(key);

      return Promise.resolve(1);
    }

    return Promise.resolve(0);
  }
}

interface RequestOverrides {
  body?: unknown;
  userId?: string | undefined;
}

/**
 * Stand-in for the route the interceptor reads its metadata from. Only its
 * identity matters — `Reflect.defineMetadata` is applied to the function
 * itself, exactly as `@Idempotent()` would.
 */
function createOrder(): string {
  return 'created';
}

class OrdersController {
  readonly create = createOrder;
}

const handler = createOrder;

function contextFor({ body = { amount: 10 }, userId }: RequestOverrides = {}) {
  const response = { statusCode: 201, status: vi.fn() };
  const request = {
    headers: { [IDEMPOTENCY_HEADER]: 'k-1' },
    method: 'POST',
    url: '/api/v1/orders',
    body,
    ...(userId === undefined ? {} : { user: { id: userId } }),
  };

  return {
    response,
    context: {
      getType: () => 'http',
      getHandler: () => handler,
      getClass: () => OrdersController,
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as unknown as ExecutionContext,
  };
}

describe('IdempotencyInterceptor', () => {
  let redis: FakeRedis;
  let interceptor: IdempotencyInterceptor;

  beforeEach(() => {
    Reflect.defineMetadata(IDEMPOTENT_KEY, true, handler);
    redis = new FakeRedis();

    const config = {
      idempotencyTtlMs: 86_400_000,
      http: { requestTimeoutMs: 15_000 },
    } as AppConfigService;
    const logger = { setContext: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;

    interceptor = new IdempotencyInterceptor(
      new Reflector(),
      config,
      redis as unknown as Redis,
      logger,
    );
  });

  const call = async (overrides: RequestOverrides, next: CallHandler) => {
    const { context } = contextFor(overrides);

    return firstValueFrom(interceptor.intercept(context, next));
  };

  it('replays the stored response instead of running the handler twice', async () => {
    const next = { handle: vi.fn(() => of({ id: 'order-1' })) };

    await call({}, next);
    const replayed = await call({}, next);

    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(replayed).toEqual({ id: 'order-1' });
  });

  it('rejects a second request while the first is still in flight', async () => {
    // The first request has claimed the key but not yet emitted, which is
    // exactly the state a client retry produces after a timeout.
    const inFlight = new Subject<unknown>();
    void call({}, { handle: () => inFlight.asObservable() });
    // Let the first request's SET NX land before the second one races it.
    await Promise.resolve();

    await expect(call({}, { handle: vi.fn(() => of({ id: 'order-2' })) })).rejects.toThrow(
      ConflictException,
    );
  });

  it('frees the key when the handler fails, so the client can retry', async () => {
    const failing = { handle: () => throwError(() => new Error('boom')) };

    await expect(call({}, failing)).rejects.toThrow('boom');
    expect(redis.store.size).toBe(0);

    const next = { handle: vi.fn(() => of({ id: 'order-3' })) };
    await expect(call({}, next)).resolves.toEqual({ id: 'order-3' });
  });

  it('rejects the same key reused with a different body', async () => {
    await call({}, { handle: () => of({ id: 'order-4' }) });

    await expect(
      call({ body: { amount: 999 } }, { handle: () => of({ id: 'order-5' }) }),
    ).rejects.toThrow(ConflictException);
  });

  /**
   * `Idempotency-Key` is client-chosen and routinely a small counter, so two
   * users colliding on one is ordinary. Keying on route alone would serve the
   * second user the first user's response body.
   */
  it('does not let one user replay another user’s response', async () => {
    const first = { handle: vi.fn(() => of({ id: 'order-alice' })) };
    const second = { handle: vi.fn(() => of({ id: 'order-bob' })) };

    await call({ userId: 'alice' }, first);
    const bob = await call({ userId: 'bob' }, second);

    expect(second.handle).toHaveBeenCalledTimes(1);
    expect(bob).toEqual({ id: 'order-bob' });
  });

  it('ignores routes that are not marked idempotent', async () => {
    Reflect.deleteMetadata(IDEMPOTENT_KEY, handler);
    const next = { handle: vi.fn(() => of({ id: 'order-6' })) };

    await call({}, next);
    await call({}, next);

    expect(next.handle).toHaveBeenCalledTimes(2);
    expect(redis.store.size).toBe(0);
  });
});
