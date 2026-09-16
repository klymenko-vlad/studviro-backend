import { Injectable } from '@nestjs/common';

import {
  ConflictError,
  EntityNotFoundError,
  InvalidInputError,
} from '../../common/errors/domain.error';
import { isUniqueViolation } from '../../database/repository/database-error';
import { institutions } from '../../database/schema';
import { DerivedRolesRepository } from '../authorization/derived-roles.repository';
import { RoleAssignmentsRepository } from '../authorization/role-assignments.repository';
import { InvitationsService } from '../invitations/invitations.service';
import { UsersRepository } from '../users/users.repository';

import { CreateInstitutionDto } from './dto/create-institution.dto';
import { InstitutionResponseDto } from './dto/institution-response.dto';
import { InstitutionsRepository } from './institutions.repository';

@Injectable()
export class InstitutionsService {
  constructor(
    private readonly repository: InstitutionsRepository,
    private readonly assignments: RoleAssignmentsRepository,
    private readonly derivedRoles: DerivedRolesRepository,
    private readonly users: UsersRepository,
    private readonly invitations: InvitationsService,
  ) {}

  /**
   * `firstAdminUserId` and `firstAdminEmail` are mutually exclusive (ADR 0017,
   * settled by ADR 0018): the first grants immediately to an account that
   * already exists, the second creates an `institution_admin` invitation for
   * an address that may not have one yet. Neither is deprecated — a platform
   * operator who already knows the account id skips a round trip through
   * email by using it.
   */
  async create(dto: CreateInstitutionDto): Promise<InstitutionResponseDto> {
    if (!dto.firstAdminUserId === !dto.firstAdminEmail) {
      throw new InvalidInputError(
        'FIRST_ADMIN_IDENTIFIER_REQUIRED',
        'Provide exactly one of firstAdminUserId or firstAdminEmail',
      );
    }

    if (dto.firstAdminUserId && !(await this.users.existsById(dto.firstAdminUserId))) {
      throw new EntityNotFoundError('user', dto.firstAdminUserId);
    }

    try {
      return await this.repository.transaction(async (tx) => {
        const created = await this.repository.create(
          {
            code: dto.code,
            name: dto.name,
            defaultLocale: dto.defaultLocale,
            timezone: dto.timezone,
          },
          tx,
        );

        if (dto.firstAdminUserId) {
          await this.assignments.create(
            {
              institutionId: created.id,
              userId: dto.firstAdminUserId,
              role: 'institution_admin',
              scopeType: 'institution',
              scopeId: null,
            },
            tx,
          );

          return InstitutionResponseDto.fromEntity(created);
        }

        const firstAdminEmail = dto.firstAdminEmail;
        if (!firstAdminEmail) {
          throw new InvalidInputError(
            'FIRST_ADMIN_IDENTIFIER_REQUIRED',
            'Provide exactly one of firstAdminUserId or firstAdminEmail',
          );
        }

        const { token } = await this.invitations.createForNewInstitution(
          created.id,
          firstAdminEmail,
          tx,
        );

        return InstitutionResponseDto.fromEntity(
          created,
          this.invitations.isDevToken() ? token : undefined,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          'INSTITUTION_CODE_TAKEN',
          'An institution with this code already exists',
          { field: 'code' },
        );
      }

      throw error;
    }
  }

  /**
   * Belonging is a granted role *or* an academic record (ADR 0016): an imported
   * student holds no `role_assignments` row, and reading only that table left
   * them on an account page saying they belong nowhere, with no way to click
   * through to their own courses.
   */
  async listForUser(userId: string): Promise<InstitutionResponseDto[]> {
    const [active, derived] = await Promise.all([
      this.assignments.findActiveForUserAnywhere(userId),
      this.derivedRoles.institutionsFor(userId),
    ]);
    const ids = [
      ...new Set([...active.map((assignment) => assignment.institutionId), ...derived]),
    ];

    if (ids.length === 0) return [];

    const found = await this.repository.findByIds(ids, { orderBy: institutions.name });

    return found.map((institution) => InstitutionResponseDto.fromEntity(institution));
  }

  async findOne(id: string): Promise<InstitutionResponseDto> {
    return InstitutionResponseDto.fromEntity(await this.repository.findByIdOrFail(id));
  }
}
