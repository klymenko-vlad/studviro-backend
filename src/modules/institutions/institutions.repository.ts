import { Injectable } from '@nestjs/common';

import { BaseRepository } from '../../database/repository/base.repository';
import { institutions } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

@Injectable()
export class InstitutionsRepository extends BaseRepository<typeof institutions> {
  protected override readonly sortable = {
    createdAt: institutions.createdAt,
    code: institutions.code,
    name: institutions.name,
  };

  constructor(txHost: TransactionHost) {
    super(txHost, institutions);
  }
}
