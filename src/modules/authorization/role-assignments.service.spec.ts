import { describe, expect, it, vi } from 'vitest';

import {
  ConflictError,
  EntityNotFoundError,
  InvalidInputError,
} from '../../common/errors/domain.error';
import type { RoleAssignment } from '../../database/schema';
import type { UsersRepository } from '../users/users.repository';

import type { AuthorizationService } from './authorization.service';
import type { DerivedRole, DerivedRolesRepository } from './derived-roles.repository';
import type { GrantRoleDto } from './dto/grant-role.dto';
import type { RoleAssignmentsRepository } from './role-assignments.repository';
import { RoleAssignmentsService } from './role-assignments.service';
import type { ScopeHierarchyService } from './scope-hierarchy.service';

const INSTITUTION = '11111111-1111-1111-1111-111111111111';
const OTHER_INSTITUTION = '99999999-9999-9999-9999-999999999999';
const FACULTY = '22222222-2222-2222-2222-222222222222';
const USER = '44444444-4444-4444-4444-444444444444';
const GRANTER = '55555555-5555-5555-5555-555555555555';

const grant = (overrides: Partial<GrantRoleDto> = {}): GrantRoleDto => ({
  userId: USER,
  role: 'org_unit_manager',
  scopeType: 'org_unit',
  scopeId: FACULTY,
  ...overrides,
});

const stored = (overrides: Partial<RoleAssignment> = {}): RoleAssignment =>
  ({
    id: 'assignment',
    institutionId: INSTITUTION,
    userId: USER,
    role: 'org_unit_manager',
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
    mayAssign?: boolean;
    granterPermissions?: string[];
    findByIdResult?: RoleAssignment;
    activeInstitutionAdmins?: RoleAssignment[];
    derived?: DerivedRole[];
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
    findByIdInOrFail: vi.fn().mockResolvedValue(options.findByIdResult ?? stored()),
    findActiveByRole: vi.fn().mockResolvedValue(options.activeInstitutionAdmins ?? []),
    softDelete: vi.fn().mockResolvedValue(stored()),
  };
  const users = { existsById: vi.fn().mockResolvedValue(options.userExists ?? true) };
  const authorization = {
    can: vi.fn().mockResolvedValue(options.mayAssign ?? true),
    permissionsIn: vi.fn().mockResolvedValue(options.granterPermissions ?? []),
  };
  const derivedRoles = {
    findFor: vi.fn().mockResolvedValue(options.derived ?? []),
    institutionsFor: vi.fn().mockResolvedValue([]),
  };

  return {
    assignments,
    hierarchy,
    users,
    authorization,
    derivedRoles,
    service: new RoleAssignmentsService(
      assignments as unknown as RoleAssignmentsRepository,
      users as unknown as UsersRepository,
      hierarchy as unknown as ScopeHierarchyService,
      authorization as unknown as AuthorizationService,
      derivedRoles as unknown as DerivedRolesRepository,
    ),
  };
}

const ALL_PERMISSIONS = [
  'program:read',
  'program:manage',
  'course:read',
  'course:manage',
  'offering:read',
  'offering:manage',
  'enrollment:read',
  'enrollment:manage',
  'grade:read',
  'grade:propose',
  'grade:publish',
  'schedule:read',
  'schedule:manage',
  'notification:read',
  'exam:register',
  'role:read',
  'role:assign',
  'institution:read',
  'institution:manage',
  'sync:read',
  'sync:run',
  'connector:configure',
];

const ORG_UNIT_MANAGER_PERMISSIONS = [
  'institution:read',
  'program:read',
  'course:read',
  'offering:read',
  'enrollment:read',
  'grade:read',
  'schedule:read',
  'notification:read',
  'exam:register',
  'role:read',
  'grade:propose',
  'grade:publish',
  'course:manage',
  'offering:manage',
  'schedule:manage',
  'enrollment:manage',
  'program:manage',
  'role:assign',
  'sync:read',
];

describe('RoleAssignmentsService', () => {
  describe('grant', () => {
    it('stores a scoped assignment when the granter holds role:assign there and holds the role', async () => {
      const { service, assignments } = serviceWith({
        scopeInstitution: INSTITUTION,
        granterPermissions: ORG_UNIT_MANAGER_PERMISSIONS,
      });

      const created = await service.grant(INSTITUTION, grant(), GRANTER);

      expect(assignments.create).toHaveBeenCalledWith(
        expect.objectContaining({
          institutionId: INSTITUTION,
          userId: USER,
          role: 'org_unit_manager',
          scopeType: 'org_unit',
          scopeId: FACULTY,
        }),
      );
      expect(created.role).toBe('org_unit_manager');
    });

    it('checks role:assign at the scope being granted on, not at the institution', async () => {
      const { service, authorization } = serviceWith({
        scopeInstitution: INSTITUTION,
        granterPermissions: ORG_UNIT_MANAGER_PERMISSIONS,
      });

      await service.grant(INSTITUTION, grant(), GRANTER);

      expect(authorization.can).toHaveBeenCalledWith({
        userId: GRANTER,
        permission: 'role:assign',
        scope: { type: 'org_unit', id: FACULTY },
      });
    });

    it('refuses to grant when the caller does not hold role:assign at that scope', async () => {
      const { service, assignments } = serviceWith({
        scopeInstitution: INSTITUTION,
        mayAssign: false,
        granterPermissions: ORG_UNIT_MANAGER_PERMISSIONS,
      });

      await expect(service.grant(INSTITUTION, grant(), GRANTER)).rejects.toMatchObject({
        code: 'ROLE_ASSIGN_SCOPE_DENIED',
      });
      expect(assignments.create).not.toHaveBeenCalled();
    });

    it('refuses to grant a role the caller does not themselves hold', async () => {
      const { service, assignments } = serviceWith({
        scopeInstitution: INSTITUTION,
        granterPermissions: ['institution:read', 'role:assign'],
      });

      await expect(
        service.grant(
          INSTITUTION,
          grant({ role: 'institution_admin', scopeType: 'institution', scopeId: undefined }),
          GRANTER,
        ),
      ).rejects.toMatchObject({ code: 'ROLE_NOT_HELD_BY_GRANTER' });
      expect(assignments.create).not.toHaveBeenCalled();
    });

    it('lets an institution_admin grant institution_admin to another person', async () => {
      const { service, assignments } = serviceWith({
        scopeInstitution: INSTITUTION,
        granterPermissions: ALL_PERMISSIONS,
      });

      await service.grant(
        INSTITUTION,
        grant({ role: 'institution_admin', scopeType: 'institution', scopeId: undefined }),
        GRANTER,
      );

      expect(assignments.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'institution_admin' }),
      );
    });

    it('stores an institution-wide assignment with no scope id', async () => {
      const { service, assignments } = serviceWith({
        scopeInstitution: INSTITUTION,
        granterPermissions: ALL_PERMISSIONS,
      });

      await service.grant(
        INSTITUTION,
        grant({ scopeType: 'institution', scopeId: undefined, role: 'institution_admin' }),
        GRANTER,
      );

      expect(assignments.create).toHaveBeenCalledWith(
        expect.objectContaining({ scopeType: 'institution', scopeId: null }),
      );
    });

    it('rejects an institution-wide assignment that names a scope', async () => {
      const { service } = serviceWith({ scopeInstitution: INSTITUTION });

      await expect(
        service.grant(INSTITUTION, grant({ scopeType: 'institution' }), GRANTER),
      ).rejects.toBeInstanceOf(InvalidInputError);
    });

    it('rejects a narrower assignment that names no scope', async () => {
      const { service } = serviceWith({ scopeInstitution: INSTITUTION });

      await expect(
        service.grant(INSTITUTION, grant({ scopeId: undefined }), GRANTER),
      ).rejects.toBeInstanceOf(InvalidInputError);
    });

    it('rejects a scope that belongs to another institution', async () => {
      const { service, assignments } = serviceWith({ scopeInstitution: OTHER_INSTITUTION });

      await expect(service.grant(INSTITUTION, grant(), GRANTER)).rejects.toBeInstanceOf(
        InvalidInputError,
      );
      expect(assignments.create).not.toHaveBeenCalled();
    });

    it('rejects a scope that does not exist', async () => {
      const { service } = serviceWith({ scopeInstitution: undefined });

      await expect(service.grant(INSTITUTION, grant(), GRANTER)).rejects.toBeInstanceOf(
        EntityNotFoundError,
      );
    });

    it('rejects an unknown user', async () => {
      const { service } = serviceWith({
        scopeInstitution: INSTITUTION,
        userExists: false,
        granterPermissions: ORG_UNIT_MANAGER_PERMISSIONS,
      });

      await expect(service.grant(INSTITUTION, grant(), GRANTER)).rejects.toBeInstanceOf(
        EntityNotFoundError,
      );
    });

    it('rejects a validity window that ends before it starts', async () => {
      const { service } = serviceWith({
        scopeInstitution: INSTITUTION,
        granterPermissions: ORG_UNIT_MANAGER_PERMISSIONS,
      });

      await expect(
        service.grant(
          INSTITUTION,
          grant({
            validFrom: new Date('2026-09-01T00:00:00.000Z'),
            validUntil: new Date('2026-08-01T00:00:00.000Z'),
          }),
          GRANTER,
        ),
      ).rejects.toBeInstanceOf(InvalidInputError);
    });

    it('refuses to grant the same role twice in the same scope', async () => {
      const { service, assignments } = serviceWith({
        scopeInstitution: INSTITUTION,
        existingAssignment: stored(),
        granterPermissions: ORG_UNIT_MANAGER_PERMISSIONS,
      });

      await expect(service.grant(INSTITUTION, grant(), GRANTER)).rejects.toBeInstanceOf(
        ConflictError,
      );
      expect(assignments.create).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('soft-deletes an assignment when the revoker holds role:assign at its scope', async () => {
      const { service, assignments } = serviceWith();

      await service.revoke(INSTITUTION, 'assignment', GRANTER);

      expect(assignments.findByIdInOrFail).toHaveBeenCalledWith(INSTITUTION, 'assignment');
      expect(assignments.softDelete).toHaveBeenCalledWith('assignment');
    });

    it('checks role:assign at the assignment scope, not the institution', async () => {
      const { service, authorization } = serviceWith();

      await service.revoke(INSTITUTION, 'assignment', GRANTER);

      expect(authorization.can).toHaveBeenCalledWith({
        userId: GRANTER,
        permission: 'role:assign',
        scope: { type: 'org_unit', id: FACULTY },
      });
    });

    it('refuses to revoke without role:assign at that scope', async () => {
      const { service, assignments } = serviceWith({ mayAssign: false });

      await expect(service.revoke(INSTITUTION, 'assignment', GRANTER)).rejects.toMatchObject({
        code: 'ROLE_ASSIGN_SCOPE_DENIED',
      });
      expect(assignments.softDelete).not.toHaveBeenCalled();
    });

    it('refuses to revoke the last institution_admin of an institution', async () => {
      const lastAdmin = stored({
        id: 'admin-1',
        role: 'institution_admin',
        scopeType: 'institution',
        scopeId: null,
      });
      const { service, assignments } = serviceWith({
        findByIdResult: lastAdmin,
        activeInstitutionAdmins: [lastAdmin],
      });

      await expect(service.revoke(INSTITUTION, 'admin-1', GRANTER)).rejects.toMatchObject({
        code: 'LAST_INSTITUTION_ADMIN',
      });
      expect(assignments.softDelete).not.toHaveBeenCalled();
    });

    it('allows revoking an institution_admin when another one remains', async () => {
      const target = stored({
        id: 'admin-1',
        role: 'institution_admin',
        scopeType: 'institution',
        scopeId: null,
      });
      const other = stored({ id: 'admin-2', role: 'institution_admin' });
      const { service, assignments } = serviceWith({
        findByIdResult: target,
        activeInstitutionAdmins: [target, other],
      });

      await service.revoke(INSTITUTION, 'admin-1', GRANTER);

      expect(assignments.softDelete).toHaveBeenCalledWith('admin-1');
    });
  });

  describe('reads', () => {
    it('lists the assignments of one institution', async () => {
      const { service, assignments } = serviceWith();

      const listed = await service.listForInstitution(INSTITUTION);

      expect(assignments.findManyIn).toHaveBeenCalledWith(INSTITUTION, expect.anything());
      expect(listed).toHaveLength(1);
    });

    it('includes derived, non-revocable roles when listing one person', async () => {
      const { service } = serviceWith({
        derived: [{ role: 'student', scope: { type: 'institution', id: INSTITUTION } }],
      });

      const listed = await service.listForInstitution(INSTITUTION, USER);

      const derivedEntry = listed.find((entry) => entry.source === 'derived');
      expect(derivedEntry).toMatchObject({ role: 'student', revocable: false, id: null });
    });

    it('lists a principal own assignments across every institution', async () => {
      const { service, assignments } = serviceWith();

      const listed = await service.listForUser(USER);

      expect(assignments.findActiveForUserAnywhere).toHaveBeenCalledWith(USER);
      expect(listed[0]?.userId).toBe(USER);
    });
  });
});
