import { Injectable } from '@nestjs/common';

import { roleAssignments, type User } from '../../database/schema';
import {
  DerivedRolesRepository,
  type DerivedRole,
} from '../authorization/derived-roles.repository';
import { RoleAssignmentResponseDto } from '../authorization/dto/role-assignment-response.dto';
import { RoleAssignmentsRepository } from '../authorization/role-assignments.repository';
import { UsersRepository } from '../users/users.repository';

import { PersonDirectoryEntryDto } from './dto/person-directory-entry.dto';

@Injectable()
export class PeopleService {
  constructor(
    private readonly users: UsersRepository,
    private readonly assignments: RoleAssignmentsRepository,
    private readonly derivedRoles: DerivedRolesRepository,
  ) {}

  async listForInstitution(institutionId: string): Promise<PersonDirectoryEntryDto[]> {
    const [granted, derivedByUser] = await Promise.all([
      this.assignments.findManyIn(institutionId, { orderBy: roleAssignments.createdAt }),
      this.derivedRoles.findAllForInstitution(institutionId),
    ]);

    const grantedByUser = new Map<string, RoleAssignmentResponseDto[]>();
    for (const assignment of granted) {
      const dto = RoleAssignmentResponseDto.fromEntity(assignment);
      const existing = grantedByUser.get(assignment.userId);
      if (existing) existing.push(dto);
      else grantedByUser.set(assignment.userId, [dto]);
    }

    const userIds = new Set<string>([...grantedByUser.keys(), ...derivedByUser.keys()]);
    if (userIds.size === 0) return [];

    const people = await this.users.findByIds([...userIds]);
    const peopleById = new Map<string, User>(people.map((person) => [person.id, person]));

    return [...userIds]
      .map((userId) => peopleById.get(userId))
      .filter((person): person is User => person !== undefined)
      .map((person) => {
        const derived = (derivedByUser.get(person.id) ?? []).map((entry: DerivedRole) =>
          RoleAssignmentResponseDto.fromDerived(institutionId, person.id, entry),
        );

        return PersonDirectoryEntryDto.fromEntity(person, [
          ...(grantedByUser.get(person.id) ?? []),
          ...derived,
        ]);
      });
  }
}
