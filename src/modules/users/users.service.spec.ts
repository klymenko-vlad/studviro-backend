import { Test } from '@nestjs/testing';
import { PostgresError } from 'postgres';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PasswordService } from '../../common/crypto/password.service';
import { PageDto, PageMetaDto, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ConflictError } from '../../common/errors/domain.error';

import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

/** Builds the driver error Postgres raises for a unique-index violation. */
function uniqueViolation(): PostgresError {
  const error = Object.create(PostgresError.prototype) as PostgresError & { code: string };
  error.code = '23505';
  error.message = 'duplicate key value violates unique constraint';

  return error;
}

describe('UsersService', () => {
  const repository = {
    create: vi.fn(),
    findPaginated: vi.fn(),
    findByCursor: vi.fn(),
    findByIdOrFail: vi.fn(),
    softDelete: vi.fn(),
    hardDelete: vi.fn(),
  };

  const passwords = {
    hash: vi.fn(() => Promise.resolve('$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$ZGlnZXN0')),
    verify: vi.fn(),
    needsRehash: vi.fn(),
  };

  let service: UsersService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: repository },
        { provide: PasswordService, useValue: passwords },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  const dto = {
    email: 'ada@example.com',
    displayName: 'Ada',
    password: 'correct horse battery',
  };

  describe('create', () => {
    it('stores a hash rather than the plaintext password', async () => {
      repository.create.mockImplementation((values: Record<string, string>) =>
        Promise.resolve({ ...values, id: 'id-1', createdAt: new Date() }),
      );

      const result = await service.create(dto);
      const stored = repository.create.mock.calls[0]![0] as { passwordHash: string };

      expect(stored.passwordHash).not.toContain(dto.password);
      expect(passwords.hash).toHaveBeenCalledWith(dto.password);
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('translates the unique-index violation into a domain conflict', async () => {
      repository.create.mockRejectedValue(uniqueViolation());

      // The insert is the check: a read-then-write guard would let two
      // concurrent signups both observe "free" and race past it.
      await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictError);
      await expect(service.create(dto)).rejects.toMatchObject({
        code: 'USER_EMAIL_TAKEN',
      });
    });

    it('propagates any other driver error untouched', async () => {
      const boom = new Error('connection reset');
      repository.create.mockRejectedValue(boom);

      await expect(service.create(dto)).rejects.toBe(boom);
    });
  });

  it('findAll maps rows to the response DTO and preserves page metadata', async () => {
    const meta = new PageMetaDto(2, 20, 42);
    repository.findPaginated.mockResolvedValue(
      new PageDto(
        [
          {
            id: 'id-1',
            email: 'ada@example.com',
            displayName: 'Ada',
            passwordHash: 'secret',
            createdAt: new Date(),
          },
        ],
        meta,
      ),
    );

    const page = await service.findAll(new PaginationQueryDto());

    expect(page.meta).toBe(meta);
    expect(page.items[0]).not.toHaveProperty('passwordHash');
  });

  it('deactivates by soft-deleting, and never hard-deletes the person', async () => {
    repository.softDelete.mockResolvedValue(undefined);

    await service.deactivate('id-1');

    expect(repository.softDelete).toHaveBeenCalledWith('id-1');
    expect(repository.hardDelete).not.toHaveBeenCalled();
  });
});
