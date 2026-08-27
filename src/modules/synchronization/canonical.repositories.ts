import { Injectable } from '@nestjs/common';

import { TransactionHost } from '../../database/transaction.host';

import {
  CANONICAL_TABLES,
  type CanonicalTable,
  type CanonicalTableName,
} from './canonical-tables';
import { ProvenanceRepository, type ProvenancedTable } from './provenance.repository';

type RepositoryMap = {
  [TName in CanonicalTableName]: ProvenanceRepository<CanonicalTable<TName>>;
};

@Injectable()
export class CanonicalRepositories {
  private readonly repositories: RepositoryMap;

  constructor(txHost: TransactionHost) {
    this.repositories = Object.fromEntries(
      Object.entries(CANONICAL_TABLES).map(([name, table]) => [
        name,
        new ProvenanceRepository(txHost, table as unknown as ProvenancedTable),
      ]),
    ) as RepositoryMap;
  }

  of<TName extends CanonicalTableName>(
    name: TName,
  ): ProvenanceRepository<CanonicalTable<TName>> {
    return this.repositories[name];
  }
}
