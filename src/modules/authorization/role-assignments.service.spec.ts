import { describe, expect, it, vi } from 'vitest';

import {
  ConflictError,
  EntityNotFoundError,
  InvalidInputError,
} from '../../common/errors/domain.error';
import type { RoleAssignment } from '../../database/schema';
import type { UsersRepository } from '../users/users.repository';

import type { GrantRoleDto } from './dto/grant-role.dto';
import type { RoleAssignmentsRepository } from './role-assignments.repository';
import { RoleAssignmentsService } from './role-assignments.service';
import type { ScopeHierarchyService } from './scope-hierarchy.service';

const INSTITUTION = '11111111-1111-1111-1111-111111111111';
const OTHER_INSTITUTION = '99999999-9999-9999-9999-999999999999';
const FACULTY = '22222222-2222-2222-2222-222222222222';
const USER = '44444444-4444-4444-4444-444444444444';

const grant = (overrides: Partial<GrantRoleDto> = {}): GrantRoleDto => ({
  userId: USER,
  role: 'teacher',
  scopeType: 'org_unit',
  scopeId: FACULTY,
  ...overrides,
});

const stored = (overrides: Partial<RoleAssignment> = {}): RoleAssignment =>
  ({
    id: 'assignment',
    institutionId: INSTITUTION,
    userId: USER,
    role: 'teacher',
    scopeType: 'org_unit',
    scopeId: FACULTY,
    validFrom: null,
    validUntil: null,
    ...overrides,
  }) as RoleAssignment;

function serviceWith(
  options: {
    scopeInstitution?: string | undefined;
    userExists?: boolean;
    existingAssignment?: RoleAssignment | undefined;
  } = {},
) {
  const hierarchy = {
    resolve: vi
      .fn()
      .mockResolvedValue(
        options.scopeInstitution === undefined
          ? undefined
          : { institutionId: options.scopeInstitution, keys: new Set<string>() },
      ),
  };
  const assignments = {
    create: vi.fn().mockImplementation((values) => Promise.resolve(stored(values))),
    findOneIn: vi.fn().mockResolvedValue(options.existingAssignment),
    findManyIn: vi.fn().mockResolvedValue([stored()]),
    findActiveForUserAnywhere: vi.fn().mockResolvedValue([stored()]),
    findByIdInOrFail: vi.fn().mockResolvedValue(stored()),
    softDelete: vi.fn().mockResolvedValue(stored()),
  };
  const users = { existsById: vi.fn().mockResolvedValue(options.userExists ?? true) };

  return {
    assignments,
    hierarchy,
    users,
    service: new RoleAssignmentsService(
      assignments as unknown as RoleAssignmentsRepository,
      users as unknown as UsersRepository,
      hierarchy as unknown as ScopeHierarchyService,
    ),
  };
}

describe('RoleAssignmentsService', () => {
  describe('grant', () => {
    it('stores a scoped assignment', async () => {
      const { service, assignments } = serviceWith({ scopeInstitution: INSTITUTION });

      const created = await service.grant(INSTITUTION, grant());

      expect(assignments.create).toHaveBeenCalledWith(
        expect.objectContaining({
          institutionId: INSTITUTION,
          userId: USER,
          role: 'teacher',
          scopeType: 'org_unit',
          scopeId: FACULTY,
        }),
      );
      expect(created.role).toBe('teacher');
    });

    it('stores an institution-wide assignment with no scope id', async () => {
      const { service, assignments } = serviceWith({ scopeInstitution: INSTITUTION });

      await service.grant(
        INSTITUTION,
        grant({ scopeType: 'institution', scopeId: undefined, role: 'institution_admin' }),
      );

      expect(assignments.create).toHaveBeenCalledWith(
        expect.objectContaining({ scopeType: 'institution', scopeId: null }),
      );
    });

    it('rejects an institution-wide assignment that names a scope', async () => {
      const { service } = serviceWith({ scopeInstitution: INSTITUTION });

      await expect(
        service.grant(INSTITUTION, grant({ scopeType: 'institution' })),
      ).rejects.toBeInstanceOf(InvalidInputError);
    });

    it('rejects a narrower assignment that names no scope', async () => {
      const { service } = serviceWith({ scopeInstitution: INSTITUTION });

      await expect(
        service.grant(INSTITUTION, grant({ scopeId: undefined })),
      ).rejects.toBeInstanceOf(InvalidInputError);
    });

    it('rejects a scope that belongs to another institution', async () => {
      const { service, assignments } = serviceWith({ scopeInstitution: OTHER_INSTITUTION });

      await expect(service.grant(INSTITUTION, grant())).rejects.toBeInstanceOf(
        InvalidInputError,
      );
      expect(assignments.create).not.toHaveBeenCalled();
    });

    it('rejects a scope that does not exist', async () => {
      const { service } = serviceWith({ scopeInstitution: undefined });

      await expect(service.grant(INSTITUTION, grant())).rejects.toBeInstanceOf(
        EntityNotFoundError,
      );
    });

    it('rejects an unknown user', async () => {
      const { service } = serviceWith({ scopeInstitution: INSTITUTION, userExists: false });

      await expect(service.grant(INSTITUTION, grant())).rejects.toBeInstanceOf(
        EntityNotFoundError,
      );
    });

    it('rejects a validity window that ends before it starts', async () => {
      const { service } = serviceWith({ scopeInstitution: INSTITUTION });

      await expect(
        service.grant(
          INSTITUTION,
          grant({
            validFrom: new Date('2026-09-01T00:00:00.000Z'),
            validUntil: new Date('2026-08-01T00:00:00.000Z'),
          }),
        ),
      ).rejects.toBeInstanceOf(InvalidInputError);
    });

    it('refuses to grant the same role twice in the same scope', async () => {
      const { service, assignments } = serviceWith({
        scopeInstitution: INSTITUTION,
        existingAssignment: stored(),
      });

      await expect(service.grant(INSTITUTION, grant())).rejects.toBeInstanceOf(ConflictError);
      expect(assignments.create).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('soft-deletes an assignment of the institution it was asked about', async () => {
      const { service, assignments } = serviceWith();

      await service.revoke(INSTITUTION, 'assignment');

      expect(assignments.findByIdInOrFail).toHaveBeenCalledWith(INSTITUTION, 'assignment');
      expect(assignments.softDelete).toHaveBeenCalledWith('assignment');
    });
  });

  describe('reads', () => {
    it('lists the assignments of one institution', async () => {
      const { service, assignments } = serviceWith();

      const listed = await service.listForInstitution(INSTITUTION);

      expect(assignments.findManyIn).toHaveBeenCalledWith(INSTITUTION, expect.anything());
      expect(listed).toHaveLength(1);
    });

    it('lists a principal own assignments across every institution', async () => {
      const { service, assignments } = serviceWith();

      const listed = await service.listForUser(USER);

      expect(assignments.findActiveForUserAnywhere).toHaveBeenCalledWith(USER);
      expect(listed[0]?.userId).toBe(USER);
    });
  });
});
