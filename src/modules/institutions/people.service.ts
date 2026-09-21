import { Injectable } from '@nestjs/common';
import { inArray, type SQL } from 'drizzle-orm';

import { CursorPageMetaDto } from '../../common/dto/pagination.dto';
import { encodeCursor } from '../../database/repository/cursor';
import { roleAssignments, type User } from '../../database/schema';
import {
  DerivedRolesRepository,
  type DerivedRole,
} from '../authorization/derived-roles.repository';
import { RoleAssignmentResponseDto } from '../authorization/dto/role-assignment-response.dto';
import { RoleAssignmentsRepository } from '../authorization/role-assignments.repository';

import type { ListPeopleQueryDto } from './dto/list-people.query.dto';
import {
  PersonDirectoryEntryDto,
  PersonDirectoryPageDto,
} from './dto/person-directory-entry.dto';
import { PeopleRepository } from './people.repository';

@Injectable()
export class PeopleService {
  constructor(
    private readonly people: PeopleRepository,
    private readonly assignments: RoleAssignmentsRepository,
    private readonly derivedRoles: DerivedRolesRepository,
  ) {}

  /**
   * A page of people, then the roles of exactly those people.
   *
   * It used to read every role assignment and every derived role in the
   * institution, union the user ids and answer with all of them. That is fine
   * at a hundred and seventy people and is not at twenty thousand — and the
   * roles were being assembled for the whole institution to render one screen.
   */
  async listForInstitution(
    institutionId: string,
    query: ListPeopleQueryDto,
  ): Promise<PersonDirectoryPageDto> {
    const { people, hasNextPage } = await this.people.findPage(institutionId, {
      limit: query.limit,
      cursor: query.cursor,
      search: query.q,
      userIds: query.userIds,
    });

    const items = await this.withRoles(institutionId, people);
    const last = people.at(-1);

    return new PersonDirectoryPageDto(
      items,
      new CursorPageMetaDto(
        query.limit,
        hasNextPage,
        hasNextPage && last ? encodeCursor({ value: last.displayName, id: last.id }) : null,
      ),
    );
  }

  private async withRoles(
    institutionId: string,
    people: readonly User[],
  ): Promise<PersonDirectoryEntryDto[]> {
    if (people.length === 0) return [];

    const userIds = people.map((person) => person.id);
    const [granted, derivedByUser] = await Promise.all([
      this.assignments.findManyIn(institutionId, {
        where: inUserIds(userIds),
        orderBy: roleAssignments.createdAt,
      }),
      this.derivedRoles.findForUsers(institutionId, userIds),
    ]);

    const grantedByUser = new Map<string, RoleAssignmentResponseDto[]>();
    for (const assignment of granted) {
      const dto = RoleAssignmentResponseDto.fromEntity(assignment);
      const existing = grantedByUser.get(assignment.userId);
      if (existing) existing.push(dto);
      else grantedByUser.set(assignment.userId, [dto]);
    }

    return people.map((person) => {
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

function inUserIds(userIds: readonly string[]): SQL {
  return inArray(roleAssignments.userId, [...userIds]);
}
