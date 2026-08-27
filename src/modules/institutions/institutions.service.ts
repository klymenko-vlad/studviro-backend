import { Injectable } from '@nestjs/common';

import { institutions } from '../../database/schema';
import { RoleAssignmentsRepository } from '../authorization/role-assignments.repository';

import { InstitutionResponseDto } from './dto/institution-response.dto';
import { InstitutionsRepository } from './institutions.repository';

@Injectable()
export class InstitutionsService {
  constructor(
    private readonly repository: InstitutionsRepository,
    private readonly assignments: RoleAssignmentsRepository,
  ) {}

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
