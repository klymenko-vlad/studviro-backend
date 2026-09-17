import { describe, expect, it, vi } from 'vitest';

import { InvalidInputError } from '../../common/errors/domain.error';
import type { ConnectorRegistry } from '../connectors/connector-registry.service';
import type { ConnectorRecord } from '../connectors/connector.types';
import type { InstitutionConfigurationService } from '../institutions/configuration/institution-configuration.service';

import type { CanonicalRepositories } from './canonical.repositories';
import type { AcademicImporter } from './importers/academic.importer';
import type { LearningImporter } from './importers/learning.importer';
import type { ProvenanceSnapshot } from './provenance.repository';
import { MAX_DISCREPANCIES_PER_DOMAIN, ReconciliationService } from './reconciliation.service';

const INSTITUTION = '11111111-1111-1111-1111-111111111111';
const EARLIER = new Date('2026-01-01T00:00:00.000Z');
const LATER = new Date('2026-02-01T00:00:00.000Z');

function record(externalId: string, overrides: Partial<ConnectorRecord<unknown>> = {}) {
  return {
    externalId,
    sourceVersion: '1',
    sourceUpdatedAt: EARLIER,
    deleted: false,
    data: {},
    ...overrides,
  } satisfies ConnectorRecord<unknown>;
}

function row(externalId: string | null, overrides: Partial<ProvenanceSnapshot> = {}) {
  return {
    id: `id-${externalId}`,
    externalId,
    sourceUpdatedAt: EARLIER,
    lastSynchronizedAt: EARLIER,
    synchronizationStatus: 'in_sync',
    ...overrides,
  } satisfies ProvenanceSnapshot;
}

function serviceWith(options: {
  records?: ConnectorRecord<unknown>[];
  rows?: ProvenanceSnapshot[];
  capable?: boolean;
  academicSystem?: string | null;
  learningSystem?: string | null;
  installed?: boolean;
  fetchError?: Error;
}) {
  const configuration = {
    resolve: vi.fn().mockResolvedValue({
      connectors: {
        academicSystem:
          options.academicSystem === undefined ? 'mock-sis' : options.academicSystem,
        learningSystem:
          options.learningSystem === undefined ? 'mock-lms' : options.learningSystem,
      },
    }),
  };
  const fetch = options.fetchError
    ? vi.fn().mockRejectedValue(options.fetchError)
    : vi.fn().mockResolvedValue(options.records ?? []);
  const academicConnector = {
    capabilities: vi.fn().mockReturnValue({ 'courses.read': options.capable ?? true }),
  };
  const learningConnector = {
    capabilities: vi.fn().mockReturnValue({ 'courses.read': options.capable ?? true }),
  };
  const missing = options.installed === false;
  const registry = {
    academicSystem: vi.fn().mockReturnValue(missing ? undefined : academicConnector),
    learningSystem: vi.fn().mockReturnValue(missing ? undefined : learningConnector),
  };
  const importer = {
    domain: 'courses',
    capability: 'courses.read',
    fetch,
    apply: vi.fn(),
  } satisfies AcademicImporter;
  const learningImporter = {
    domain: 'learningSpaces',
    capability: 'courses.read',
    fetch,
    apply: vi.fn(),
  } satisfies LearningImporter;
  const listProvenance = vi.fn().mockResolvedValue(options.rows ?? []);
  const repositories = { of: vi.fn().mockReturnValue({ listProvenance }) };

  return {
    importer,
    learningImporter,
    registry,
    listProvenance,
    repositories,
    service: new ReconciliationService(
      configuration as unknown as InstitutionConfigurationService,
      registry as unknown as ConnectorRegistry,
      repositories as unknown as CanonicalRepositories,
      [importer],
      [learningImporter],
    ),
  };
}

describe('ReconciliationService', () => {
  it('reports a source record the platform never took in', async () => {
    const { service } = serviceWith({ records: [record('C-1')], rows: [] });

    const report = await service.report(INSTITUTION, 'sis');

    expect(report.discrepancyCount).toBe(1);
    expect(report.domains[0]).toMatchObject({
      domain: 'courses',
      status: 'checked',
      sourceCount: 1,
      platformCount: 0,
      matched: 0,
    });
    expect(report.domains[0]?.discrepancies[0]).toMatchObject({
      kind: 'missing_in_platform',
      externalId: 'C-1',
      canonicalId: null,
    });
  });

  it('reports a live canonical row the source no longer offers', async () => {
    const { service } = serviceWith({ records: [], rows: [row('C-9')] });

    const report = await service.report(INSTITUTION, 'sis');

    expect(report.domains[0]?.discrepancies[0]).toMatchObject({
      kind: 'missing_in_source',
      externalId: 'C-9',
      canonicalId: 'id-C-9',
    });
  });

  it('reports a source-owned row with no external identifier as a conflict', async () => {
    const { service } = serviceWith({
      records: [record('C-1')],
      rows: [row('C-1'), row(null, { id: 'id-orphan' })],
    });

    const report = await service.report(INSTITUTION, 'sis');

    expect(report.domains[0]?.matched).toBe(1);
    expect(report.domains[0]?.discrepancies).toHaveLength(1);
    expect(report.domains[0]?.discrepancies[0]).toMatchObject({
      kind: 'conflict',
      externalId: null,
      canonicalId: 'id-orphan',
    });
  });

  it('never matches a source record against a row with no external identifier', async () => {
    const { service } = serviceWith({
      records: [record('C-1')],
      rows: [row(null, { id: 'id-orphan' })],
    });

    const report = await service.report(INSTITUTION, 'sis');

    expect(report.domains[0]?.matched).toBe(0);
    expect(report.domains[0]?.discrepancies.map((one) => one.kind).sort()).toEqual([
      'conflict',
      'missing_in_platform',
    ]);
  });

  it('reports a row whose source has moved on as stale', async () => {
    const { service } = serviceWith({
      records: [record('C-1', { sourceUpdatedAt: LATER })],
      rows: [row('C-1')],
    });

    const report = await service.report(INSTITUTION, 'sis');

    expect(report.domains[0]?.matched).toBe(1);
    expect(report.domains[0]?.discrepancies[0]).toMatchObject({
      kind: 'stale',
      sourceUpdatedAt: LATER,
      platformUpdatedAt: EARLIER,
    });
  });

  it('reports a row marked anything but in sync as a conflict', async () => {
    const { service } = serviceWith({
      records: [record('C-1')],
      rows: [row('C-1', { synchronizationStatus: 'conflict' })],
    });

    const report = await service.report(INSTITUTION, 'sis');

    expect(report.domains[0]?.discrepancies[0]?.kind).toBe('conflict');
  });

  it('says nothing when both populations agree', async () => {
    const { service } = serviceWith({ records: [record('C-1')], rows: [row('C-1')] });

    const report = await service.report(INSTITUTION, 'sis');

    expect(report.discrepancyCount).toBe(0);
    expect(report.domains[0]).toMatchObject({ matched: 1, truncated: false });
  });

  it('ignores a deleted source record the platform has already tombstoned', async () => {
    const { service } = serviceWith({
      records: [record('C-1', { deleted: true })],
      rows: [],
    });

    const report = await service.report(INSTITUTION, 'sis');

    expect(report.discrepancyCount).toBe(0);
    expect(report.domains[0]?.sourceCount).toBe(0);
  });

  it('compares whole populations rather than a changed window', async () => {
    const { service, importer } = serviceWith({});

    await service.report(INSTITUTION, 'sis');

    expect(importer.fetch).toHaveBeenCalledWith(expect.anything(), {});
  });

  it('counts every discrepancy but lists only the first page of them', async () => {
    const overflow = MAX_DISCREPANCIES_PER_DOMAIN + 3;
    const { service } = serviceWith({
      records: Array.from({ length: overflow }, (_, index) => record(`C-${index}`)),
      rows: [],
    });

    const report = await service.report(INSTITUTION, 'sis');

    expect(report.domains[0]?.discrepancyCount).toBe(overflow);
    expect(report.domains[0]?.discrepancies).toHaveLength(MAX_DISCREPANCIES_PER_DOMAIN);
    expect(report.domains[0]?.truncated).toBe(true);
  });

  it('skips a domain the connector cannot read instead of calling it missing', async () => {
    const { service, importer, listProvenance } = serviceWith({
      capable: false,
      rows: [row('C-1')],
    });

    const report = await service.report(INSTITUTION, 'sis');

    expect(report.domains[0]).toMatchObject({ status: 'skipped', discrepancyCount: 0 });
    expect(importer.fetch).not.toHaveBeenCalled();
    expect(listProvenance).not.toHaveBeenCalled();
  });

  it('records a domain whose fetch failed rather than aborting the report', async () => {
    const { service } = serviceWith({ fetchError: new Error('source unreachable') });

    const report = await service.report(INSTITUTION, 'sis');

    expect(report.domains[0]).toMatchObject({
      status: 'failed',
      errorMessage: 'source unreachable',
    });
  });

  it('refuses when the institution has no academic connector configured', async () => {
    const { service } = serviceWith({ academicSystem: null });

    await expect(service.report(INSTITUTION, 'sis')).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('refuses when the configured connector is not installed', async () => {
    const { service } = serviceWith({ installed: false });

    await expect(service.report(INSTITUTION, 'sis')).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('compares the learning half against the learning connector when asked', async () => {
    const { service, registry, learningImporter, repositories } = serviceWith({
      records: [record('LS-1')],
      rows: [],
    });

    const report = await service.report(INSTITUTION, 'lms');

    expect(report.sourceSystem).toBe('lms');
    expect(report.connectorName).toBe('mock-lms');
    expect(registry.learningSystem).toHaveBeenCalledWith('mock-lms');
    expect(registry.academicSystem).not.toHaveBeenCalled();
    expect(learningImporter.fetch).toHaveBeenCalled();
    expect(repositories.of).toHaveBeenCalledWith('learningSpaces');
    expect(report.domains[0]?.domain).toBe('learningSpaces');
  });

  it('scopes the provenance read to the source system it is comparing', async () => {
    const { service, listProvenance } = serviceWith({ records: [], rows: [] });

    await service.report(INSTITUTION, 'lms');

    expect(listProvenance).toHaveBeenCalledWith(
      expect.objectContaining({ sourceSystem: 'lms', connectorName: 'mock-lms' }),
    );
  });

  it('refuses when the institution has no learning connector configured', async () => {
    const { service } = serviceWith({ learningSystem: null });

    await expect(service.report(INSTITUTION, 'lms')).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('reads a pending row as a decision awaiting a run, not as a fresh conflict', async () => {
    const { service } = serviceWith({
      records: [record('C-1')],
      rows: [row('C-1', { synchronizationStatus: 'pending' })],
    });

    const report = await service.report(INSTITUTION, 'sis');

    expect(report.domains[0]?.discrepancies[0]).toMatchObject({ kind: 'conflict' });
    expect(report.domains[0]?.discrepancies[0]?.detail).toContain('waiting to be overwritten');
  });
});
