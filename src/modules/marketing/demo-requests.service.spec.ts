import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DemoRequestsRepository } from './demo-requests.repository';
import { DemoRequestsService } from './demo-requests.service';
import type { CreateDemoRequestDto } from './dto/create-demo-request.dto';

const NOW = new Date('2026-09-12T10:00:00.000Z');

const dto = (overrides: Partial<CreateDemoRequestDto> = {}): CreateDemoRequestDto => ({
  institutionName: 'Comenius University',
  contactName: 'Ada Lovelace',
  email: 'ada@university.edu',
  role: 'Vice-dean for study affairs',
  ...overrides,
});

describe(DemoRequestsService.name, () => {
  const record = vi.fn();
  const repository = { record } as unknown as DemoRequestsRepository;
  let service: DemoRequestsService;

  beforeEach(() => {
    service = new DemoRequestsService(repository);
  });

  it('records a submission with the trimmed contact details', async () => {
    await service.submit(dto(), {}, NOW);

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        institutionName: 'Comenius University',
        contactName: 'Ada Lovelace',
        email: 'ada@university.edu',
        role: 'Vice-dean for study affairs',
      }),
      NOW,
    );
  });

  it('hashes the caller address rather than storing it', async () => {
    await service.submit(dto(), { ipAddress: '203.0.113.7', userAgent: 'Mozilla/5.0' }, NOW);

    const [record_] = record.mock.calls[0] as [Record<string, unknown>];
    expect(record_.ipHash).toBe(createHash('sha256').update('203.0.113.7').digest('hex'));
    expect(JSON.stringify(record_)).not.toContain('203.0.113.7');
    expect(record_.userAgent).toBe('Mozilla/5.0');
  });

  it('leaves the address undefined when the request carried none', async () => {
    await service.submit(dto(), {}, NOW);

    const [record_] = record.mock.calls[0] as [Record<string, unknown>];
    expect(record_.ipHash).toBeUndefined();
  });

  it('passes an omitted message through as undefined rather than an empty string', async () => {
    await service.submit(dto(), {}, NOW);

    const [record_] = record.mock.calls[0] as [Record<string, unknown>];
    expect(record_.message).toBeUndefined();
  });

  it('keeps a supplied message', async () => {
    await service.submit(dto({ message: 'We run AIS2 and Moodle.' }), {}, NOW);

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'We run AIS2 and Moodle.' }),
      NOW,
    );
  });

  it('drops a submission whose honeypot was filled, without touching the database', async () => {
    await service.submit(dto({ website: 'https://spam.example' }), {}, NOW);

    expect(record).not.toHaveBeenCalled();
  });

  it('records a submission whose honeypot was present but empty', async () => {
    await service.submit(dto({ website: '' }), {}, NOW);

    expect(record).toHaveBeenCalledOnce();
  });

  it('resolves with nothing a caller could echo back', async () => {
    await expect(service.submit(dto(), {}, NOW)).resolves.toBeUndefined();
  });
});
