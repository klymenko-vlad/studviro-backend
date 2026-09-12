import { Injectable } from '@nestjs/common';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import { isUniqueViolation } from '../../database/repository/database-error';
import { institutions } from '../../database/schema';
import { RoleAssignmentsRepository } from '../authorization/role-assignments.repository';
import { UsersRepository } from '../users/users.repository';

import { CreateInstitutionDto } from './dto/create-institution.dto';
import { InstitutionResponseDto } from './dto/institution-response.dto';
import { InstitutionsRepository } from './institutions.repository';

@Injectable()
export class InstitutionsService {
  constructor(
    private readonly repository: InstitutionsRepository,
    private readonly assignments: RoleAssignmentsRepository,
    private readonly users: UsersRepository,
  ) {}

  async create(dto: CreateInstitutionDto): Promise<InstitutionResponseDto> {
    if (!(await this.users.existsById(dto.firstAdminUserId))) {
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

  async listForUser(userId: string): Promise<InstitutionResponseDto[]> {
    const active = await this.assignments.findActiveForUserAnywhere(userId);
    const ids = [...new Set(active.map((assignment) => assignment.institutionId))];

    if (ids.length === 0) return [];

    const found = await this.repository.findByIds(ids, { orderBy: institutions.name });

    return found.map((institution) => InstitutionResponseDto.fromEntity(institution));
  }

  async findOne(id: string): Promise<InstitutionResponseDto> {
    return InstitutionResponseDto.fromEntity(await this.repository.findByIdOrFail(id));
  }
}
