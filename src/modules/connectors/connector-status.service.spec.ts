import { describe, expect, it, vi } from 'vitest';

import type { InstitutionConfigurationService } from '../institutions/configuration/institution-configuration.service';

import type { AcademicSystemConnector } from './academic-system.connector';
import type { ConnectorRegistry } from './connector-registry.service';
import { ConnectorStatusService } from './connector-status.service';

const UPJS = '11111111-1111-1111-1111-111111111111';

const academicConnector = (name: string, reachable = true): AcademicSystemConnector =>
  ({
    name,
    healthCheck: vi.fn().mockResolvedValue({ reachable, checkedAt: new Date(), detail: null }),
    capabilities: () => ({ 'courses.read': true, 'examRegistration.write': false }),
  }) as unknown as AcademicSystemConnector;

function serviceWith(
  connectors: { academicSystem: string | null; learningSystem: string | null },
  installed: AcademicSystemConnector[] = [],
) {
  const configuration = { resolve: vi.fn().mockResolvedValue({ connectors }) };
  const registry = {
    academicSystem: vi.fn((name: string | null) =>
      installed.find((connector) => connector.name === name),
    ),
    learningSystem: vi.fn().mockReturnValue(undefined),
    list: vi.fn().mockReturnValue(installed.map((c) => ({ kind: 'academic', name: c.name }))),
  };

  return {
    registry,
    service: new ConnectorStatusService(
      configuration as unknown as InstitutionConfigurationService,
      registry as unknown as ConnectorRegistry,
    ),
  };
}

describe('ConnectorStatusService', () => {
  it('reports both kinds even when nothing is configured', async () => {
    const { service } = serviceWith({ academicSystem: null, learningSystem: null });

    const statuses = await service.listForInstitution(UPJS);

    expect(statuses.map((status) => status.kind)).toEqual(['academic', 'learning']);
    expect(statuses[0]).toMatchObject({ name: null, installed: false, healthy: false });
    expect(statuses[0]?.capabilities).toEqual([]);
    expect(statuses[0]?.alternatives).toEqual([]);
  });

  it('reports a configured connector as installed, healthy and capable', async () => {
    const { service } = serviceWith({ academicSystem: 'mock-sis', learningSystem: null }, [
      academicConnector('mock-sis'),
    ]);

    const [academic] = await service.listForInstitution(UPJS);

    expect(academic).toMatchObject({ name: 'mock-sis', installed: true, healthy: true });
    expect(academic?.capabilities).toEqual(['courses.read']);
  });

  it('reports a configured connector that is not installed as unhealthy', async () => {
    const { service } = serviceWith({ academicSystem: 'ais2', learningSystem: null }, []);

    const [academic] = await service.listForInstitution(UPJS);

    expect(academic).toMatchObject({ name: 'ais2', installed: false, healthy: false });
  });

  it('reports an installed connector that cannot be reached as unhealthy', async () => {
    const { service } = serviceWith({ academicSystem: 'mock-sis', learningSystem: null }, [
      academicConnector('mock-sis', false),
    ]);

    const [academic] = await service.listForInstitution(UPJS);

    expect(academic).toMatchObject({ installed: true, healthy: false });
  });

  it('offers the connectors of that kind the deployment could be pointed at', async () => {
    const { service } = serviceWith({ academicSystem: null, learningSystem: null }, [
      academicConnector('mock-sis'),
    ]);

    const [academic, learning] = await service.listForInstitution(UPJS);

    expect(academic?.alternatives).toEqual(['mock-sis']);
    expect(learning?.alternatives).toEqual([]);
  });
});
