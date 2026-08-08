import { createHash, randomUUID } from 'node:crypto';

import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { from, Observable, of, switchMap, tap } from 'rxjs';

import { AppConfigService } from '../../config/app-config.service';
import { REDIS_CLIENT } from '../redis/redis.tokens';

import { IDEMPOTENCY_HEADER, IDEMPOTENT_KEY } from './idempotent.decorator';

/** The request is still running in some replica; nothing to replay yet. */
interface Reservation {
  state: 'in_progress';
  fingerprint: string;
  /** Identifies the holder, so only it may release the reservation. */
  token: string;
}

interface CompletedResponse {
  state: 'completed';
  status: number;
  body: unknown;
  fingerprint: string;
}

type Entry = Reservation | CompletedResponse;

/**
 * Releases a reservation only if this request still owns it — matched on the
 * token, so a handler that failed after its own reservation lapsed cannot
 * delete the reservation, or the stored response, of the retry that replaced
 * it. A bare `DEL` would do exactly that.
 */
const RELEASE = `
local current = redis.call('get', KEYS[1])
if not current then return 0 end
local ok, entry = pcall(cjson.decode, current)
if ok and entry.state == 'in_progress' and entry.token == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

interface IdempotentRequest {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  url?: string;
  body?: unknown;
  user?: { id?: string };
}

/**
 * Replay protection for unsafe routes marked `@Idempotent()`.
 *
 * A client that never sees a response cannot know whether the write landed, so
 * its only safe move is to retry — and without this, retrying a payment or an
 * enrolment performs it twice.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(IdempotencyInterceptor.name);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const enabled = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!enabled) return next.handle();

    const request = context.switchToHttp().getRequest<IdempotentRequest>();

    const header = request.headers[IDEMPOTENCY_HEADER];
    const key = Array.isArray(header) ? header[0] : header;
    if (!key) return next.handle();

    const cacheKey = cacheKeyFor(request, key);
    const fingerprint = fingerprintOf(request.body);
    const token = randomUUID();

    return from(this.reserve(cacheKey, fingerprint, token)).pipe(
      switchMap((existing) => {
        if (existing) return of(this.replay(context, existing));

        return next.handle().pipe(
          tap({
            next: (body: unknown) => {
              const status = context
                .switchToHttp()
                .getResponse<{ statusCode?: number }>().statusCode;

              this.settle(this.complete(cacheKey, status ?? 200, body, fingerprint));
            },
            // A failed handler performed no write worth replaying, so the key
            // must become usable again — otherwise a transient 500 would lock
            // the client out of retrying for the whole idempotency window.
            error: () => {
              this.settle(this.release(cacheKey, token));
            },
          }),
        );
      }),
    );
  }

  /**
   * Claims the key, or reports what is already stored under it. The claim is
   * `SET NX`, so of two concurrent requests exactly one proceeds — which is the
   * case a store-after-the-fact cache cannot cover, and the one a retrying
   * client actually produces.
   */
  private async reserve(
    key: string,
    fingerprint: string,
    token: string,
  ): Promise<CompletedResponse | undefined> {
    const reservation: Reservation = { state: 'in_progress', fingerprint, token };

    const claimed = await this.redis.set(
      key,
      JSON.stringify(reservation),
      'PX',
      // Deliberately not the full idempotency TTL: a replica that dies
      // mid-request would otherwise hold the key hostage for a day. The
      // response, once stored, does get the full window.
      this.reservationTtlMs,
      'NX',
    );
    if (claimed === 'OK') return undefined;

    const cached = await this.redis.get(key);
    // Lost the claim, then the winner's reservation lapsed before this read.
    // Rare, and proceeding is the same risk the very first request runs.
    if (!cached) return undefined;

    const entry = JSON.parse(cached) as Entry;

    // Same key, different payload: the client reused a key for a different
    // operation. Replaying the stored response would silently drop the new
    // write, so this has to be an error rather than a cache hit — and it is
    // checked before the in-flight branch, because a mismatched body is a
    // client bug either way.
    if (entry.fingerprint !== fingerprint) throw keyReused();

    if (entry.state === 'in_progress') {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_IN_FLIGHT',
        message: 'A request with this Idempotency-Key is still being processed — retry shortly',
      });
    }

    return entry;
  }

  /** Only reached once `reserve` has confirmed the fingerprint matches. */
  private replay(context: ExecutionContext, stored: CompletedResponse): unknown {
    context
      .switchToHttp()
      .getResponse<{ status?: (code: number) => unknown }>()
      .status?.(stored.status);

    return stored.body;
  }

  private async complete(
    key: string,
    status: number,
    body: unknown,
    fingerprint: string,
  ): Promise<void> {
    const completed: CompletedResponse = { state: 'completed', status, body, fingerprint };

    // Unconditional: even if this request's reservation lapsed mid-flight, the
    // response it produced is the authoritative result for this key.
    await this.redis.set(key, JSON.stringify(completed), 'PX', this.config.idempotencyTtlMs);
  }

  private async release(key: string, token: string): Promise<void> {
    await this.redis.eval(RELEASE, 1, key, token);
  }

  private get reservationTtlMs(): number {
    // A margin over the request timeout: the handler cannot still be running
    // once the timeout interceptor has cut it off.
    return this.config.http.requestTimeoutMs + 5_000;
  }

  /**
   * Redis bookkeeping must never take down the request it is bookkeeping for.
   * Left unhandled these reject into `process.on('unhandledRejection')`, which
   * reports a routine cache blip as the one event worth paging on.
   */
  private settle(work: Promise<void>): void {
    work.catch((error: unknown) => {
      this.logger.warn({ err: error }, 'idempotency bookkeeping failed');
    });
  }
}

/**
 * Scoped to the caller, not just to the route.
 *
 * `Idempotency-Key` is client-chosen and routinely low-entropy — a local
 * counter, a retry index. Keying on method and URL alone would let two users
 * who happen to pick the same value collide, and identical bodies would serve
 * one user the other's response.
 */
function cacheKeyFor(request: IdempotentRequest, key: string): string {
  const principal = request.user?.id ?? 'anonymous';

  return `idem:${principal}:${request.method ?? ''}:${request.url ?? ''}:${key}`;
}

function fingerprintOf(body: unknown): string {
  return createHash('sha256')
    .update(body === undefined ? '' : JSON.stringify(body))
    .digest('hex');
}

function keyReused(): ConflictException {
  return new ConflictException({
    code: 'IDEMPOTENCY_KEY_REUSED',
    message: 'This Idempotency-Key was already used with a different request body',
  });
}
