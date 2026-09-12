import { Injectable } from '@nestjs/common';

import { orgUnits } from '../../database/schema';

import { OrgUnitResponseDto } from './dto/org-unit-response.dto';
import { OrgUnitsRepository } from './org-units.repository';

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
}
