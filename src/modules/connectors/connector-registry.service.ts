import { Inject, Injectable } from '@nestjs/common';

import {
  ACADEMIC_SYSTEM_CONNECTORS,
  type AcademicSystemConnector,
} from './academic-system.connector';
import type { ConnectorKind } from './connector.types';
import {
  LEARNING_SYSTEM_CONNECTORS,
  type LearningSystemConnector,
} from './learning-system.connector';

export interface RegisteredConnector {
  readonly kind: ConnectorKind;
  readonly name: string;
}

@Injectable()
export class ConnectorRegistry {
  constructor(
    @Inject(ACADEMIC_SYSTEM_CONNECTORS)
    private readonly academic: readonly AcademicSystemConnector[],
    @Inject(LEARNING_SYSTEM_CONNECTORS)
    private readonly learning: readonly LearningSystemConnector[],
  ) {}

  academicSystem(name: string | null): AcademicSystemConnector | undefined {
    return this.academic.find((connector) => connector.name === name);
  }

  learningSystem(name: string | null): LearningSystemConnector | undefined {
    return this.learning.find((connector) => connector.name === name);
  }

  list(): RegisteredConnector[] {
    return [
      ...this.academic.map((connector) => ({
        kind: 'academic' as const,
        name: connector.name,
      })),
      ...this.learning.map((connector) => ({
        kind: 'learning' as const,
        name: connector.name,
      })),
    ];
  }
}
