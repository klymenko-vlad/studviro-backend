import { Injectable } from '@nestjs/common';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import { orgUnits, type OrgUnitType } from '../../database/schema';

import { OrgUnitResponseDto } from './dto/org-unit-response.dto';
import { OrgUnitsRepository } from './org-units.repository';

export interface OrgUnitInput {
  readonly code: string;
  readonly name: string;
  readonly type?: OrgUnitType;
  readonly parentId?: string | null;
}

/**
 * The org unit tree is what a programme, a course, a room and a scoped role
 * grant all hang off. It previously only ever arrived by import, so a fresh
 * institution had no faculties and nowhere to put anything.
 */
@Injectable()
export class OrgUnitsService {
  constructor(private readonly orgUnits: OrgUnitsRepository) {}

  async listForInstitution(institutionId: string): Promise<OrgUnitResponseDto[]> {
    const found = await this.orgUnits.findManyIn(institutionId, {
      orderBy: orgUnits.name,
    });

    return found.map((orgUnit) => OrgUnitResponseDto.fromEntity(orgUnit));
  }

  async findOne(institutionId: string, id: string): Promise<OrgUnitResponseDto> {
    const found = await this.orgUnits.findByIdInOrFail(institutionId, id);

    return OrgUnitResponseDto.fromEntity(found);
  }

  async create(institutionId: string, input: OrgUnitInput): Promise<OrgUnitResponseDto> {
    await this.orgUnits.assertCodeFree(institutionId, input.code);
    await this.assertParentExists(institutionId, input.parentId ?? null);

    const created = await this.orgUnits.create({
      institutionId,
      code: input.code,
      name: input.name,
      ...(input.type === undefined ? {} : { type: input.type }),
      parentId: input.parentId ?? null,
    });

    return OrgUnitResponseDto.fromEntity(created);
  }

  async update(
    institutionId: string,
    id: string,
    input: Partial<OrgUnitInput>,
  ): Promise<OrgUnitResponseDto> {
    const existing = await this.orgUnits.findByIdIn(institutionId, id, { consistent: true });
    if (!existing) throw new EntityNotFoundError('org_unit', id);

    if (input.code !== undefined) {
      await this.orgUnits.assertCodeFree(institutionId, input.code, id);
    }

    if (input.parentId !== undefined) {
      await this.assertParentExists(institutionId, input.parentId);
      await this.assertNoCycle(institutionId, id, input.parentId);
    }

    const updated = await this.orgUnits.update(id, definedOnly(input));

    return OrgUnitResponseDto.fromEntity(updated);
  }

  async remove(institutionId: string, id: string): Promise<void> {
    const existing = await this.orgUnits.findByIdIn(institutionId, id, { consistent: true });
    if (!existing) throw new EntityNotFoundError('org_unit', id);

    const children = await this.orgUnits.countChildren(id);
    if (children > 0) {
      throw new ConflictError(
        'ORG_UNIT_HAS_CHILDREN',
        'This unit still has units under it; retire or move those first',
        { children },
      );
    }

    const dependants = await this.orgUnits.countDependants(id);
    if (dependants > 0) {
      throw new ConflictError(
        'ORG_UNIT_IN_USE',
        'Programmes, courses or rooms still belong to this unit',
        { dependants },
      );
    }

    await this.orgUnits.softDelete(id);
  }

  private async assertParentExists(
    institutionId: string,
    parentId: string | null,
  ): Promise<void> {
    if (parentId === null) return;

    const exists = await this.orgUnits.hasLiveUnit(institutionId, parentId);
    if (!exists) throw new EntityNotFoundError('org_unit', parentId);
  }

  /**
   * A unit cannot be moved under itself or under one of its own descendants:
   * the tree would close into a ring and every walk of it would never finish.
   */
  private async assertNoCycle(
    institutionId: string,
    id: string,
    parentId: string | null,
  ): Promise<void> {
    if (parentId === null) return;

    if (parentId === id) {
      throw new ConflictError('ORG_UNIT_PARENT_IS_ITSELF', 'A unit cannot be its own parent');
    }

    const ancestorsOfParent = await this.orgUnits.ancestorsOf(institutionId, parentId);
    if (ancestorsOfParent.includes(id)) {
      throw new ConflictError(
        'ORG_UNIT_PARENT_IS_A_DESCENDANT',
        'That would put the unit under one of its own descendants',
      );
    }
  }
}

function definedOnly<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
