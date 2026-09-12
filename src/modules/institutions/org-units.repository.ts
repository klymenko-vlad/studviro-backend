import { Injectable } from '@nestjs/common';

import { InstitutionScopedRepository } from '../../database/repository/institution-scoped.repository';
import { orgUnits } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

@Injectable()
export class OrgUnitsRepository extends InstitutionScopedRepository<typeof orgUnits> {
  protected override readonly sortable = {
    createdAt: orgUnits.createdAt,
    code: orgUnits.code,
    name: orgUnits.name,
  };

  constructor(txHost: TransactionHost) {
    super(txHost, orgUnits);
  }
}
