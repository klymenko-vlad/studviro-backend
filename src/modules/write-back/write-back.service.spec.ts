import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SourceWriteIntent } from '../../database/schema';
import type { TransactionHost } from '../../database/transaction.host';
import { ConnectorRejectedError } from '../connectors/connector-rejected.error';

import { backoffMs, MAX_WRITE_ATTEMPTS, WriteBackService } from './write-back.service';
import type { WriteIntentRepository } from './write-intent.repository';
import type { WriteIntentService } from './write-intent.service';
import type { IntentWriter } from './write-intent.types';

const intent = (overrides: Partial<SourceWriteIntent> = {}): SourceWriteIntent =>
  ({
    id: 'intent-1',
    institutionId: 'institution-1',
    canonicalId: 'registration-1',
    kind: 'exam_registration.create',
    state: 'pending',
    attempts: 0,
    payload: {},
    ...overrides,
  }) as SourceWriteIntent;

describe('WriteBackService', () => {
  const findByIdIn = vi.fn();
  const claim = vi.fn();
  const acknowledged = vi.fn();
  const rejected = vi.fn();
  const abandoned = vi.fn();
  const retryLater = vi.fn();

  const execute = vi.fn();
  const acknowledge = vi.fn();
  const compensate = vi.fn();
  const abandon = vi.fn();

  const writer: IntentWriter = {
    kind: 'exam_registration.create',
    execute,
    acknowledge,
    compensate,
    abandon,
  };

  const txHost = {
    run: (fn: () => Promise<unknown>) => fn(),
  } as unknown as TransactionHost;

  const logger = {
    setContext: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as PinoLogger;

  const build = () =>
    new WriteBackService(
      { findByIdIn } as unknown as WriteIntentRepository,
      {
        claim,
        acknowledged,
        rejected,
        abandoned,
        retryLater,
      } as unknown as WriteIntentService,
      txHost,
      logger,
      [writer],
    );

  beforeEach(() => {
    vi.clearAllMocks();
    findByIdIn.mockResolvedValue(intent());
    claim.mockImplementation((pending: SourceWriteIntent) =>
      Promise.resolve({ ...pending, state: 'in_flight', attempts: pending.attempts + 1 }),
    );
  });

  it('stamps the identifier the source assigned and closes the intent', async () => {
    execute.mockResolvedValue({ externalId: 'EXR-1' });

    await expect(build().deliver('institution-1', 'intent-1')).resolves.toMatchObject({
      state: 'acknowledged',
    });
    expect(acknowledge).toHaveBeenCalledWith(expect.anything(), { externalId: 'EXR-1' });
    expect(acknowledged).toHaveBeenCalledWith(expect.anything(), 'EXR-1', expect.any(Date));
  });

  it('does nothing for an intent that is not pending, so a redelivery cannot write twice', async () => {
    findByIdIn.mockResolvedValue(intent({ state: 'in_flight' }));

    await expect(build().deliver('institution-1', 'intent-1')).resolves.toEqual({
      state: 'pending',
      retryInMs: null,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('compensates a business refusal instead of retrying it', async () => {
    execute.mockRejectedValue(new ConnectorRejectedError('NO_SEATS', 'The term is full'));

    await expect(build().deliver('institution-1', 'intent-1')).resolves.toEqual({
      state: 'rejected',
      retryInMs: null,
    });
    expect(compensate).toHaveBeenCalled();
    expect(rejected).toHaveBeenCalledWith(
      expect.anything(),
      'NO_SEATS',
      'The term is full',
      expect.any(Date),
    );
  });

  it('retries a transport failure with a backoff and compensates nothing', async () => {
    execute.mockRejectedValue(new Error('socket hang up'));

    await expect(build().deliver('institution-1', 'intent-1')).resolves.toEqual({
      state: 'pending',
      retryInMs: backoffMs(1),
    });
    expect(compensate).not.toHaveBeenCalled();
    expect(retryLater).toHaveBeenCalled();
  });

  it('abandons a transport failure past the cap, still compensating nothing', async () => {
    findByIdIn.mockResolvedValue(intent({ attempts: MAX_WRITE_ATTEMPTS }));
    execute.mockRejectedValue(new Error('gateway timeout'));

    await expect(build().deliver('institution-1', 'intent-1')).resolves.toEqual({
      state: 'abandoned',
      retryInMs: null,
    });
    expect(compensate).not.toHaveBeenCalled();
    expect(abandon).toHaveBeenCalled();
  });

  it('abandons an intent kind no writer claims', async () => {
    findByIdIn.mockResolvedValue(intent({ kind: 'course_result.publish' }));

    await expect(build().deliver('institution-1', 'intent-1')).resolves.toMatchObject({
      state: 'abandoned',
    });
    expect(abandoned).toHaveBeenCalledWith(
      expect.anything(),
      'WRITE_BACK_UNSUPPORTED_KIND',
      expect.any(String),
    );
  });

  it('grows the backoff with each attempt and caps it', () => {
    expect(backoffMs(1)).toBeLessThan(backoffMs(2));
    expect(backoffMs(50)).toEqual(backoffMs(60));
  });
});
