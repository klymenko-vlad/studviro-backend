import { Injectable } from '@nestjs/common';
import { isNull } from 'drizzle-orm';

import { InstitutionScopedRepository } from '../../../database/repository/institution-scoped.repository';
import { institutionSettings } from '../../../database/schema';
import { TransactionHost } from '../../../database/transaction.host';

@Injectable()
export class InstitutionSettingsRepository extends InstitutionScopedRepository<
  typeof institutionSettings
> {
  readonly conflictTarget = {
    target: institutionSettings.institutionId,
    targetWhere: isNull(institutionSettings.deletedAt),
  };

  constructor(txHost: TransactionHost) {
    super(txHost, institutionSettings);
  }
}
