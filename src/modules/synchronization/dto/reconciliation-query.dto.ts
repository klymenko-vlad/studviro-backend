import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

import {
  RECONCILIATION_SOURCE_SYSTEMS,
  type ReconciliationSourceSystem,
} from '../reconciliation.types';

export class ReconciliationQueryDto {
  @ApiPropertyOptional({
    enum: RECONCILIATION_SOURCE_SYSTEMS,
    default: 'sis',
    description:
      'Which half of the model to compare: the student information system or the learning management system. Each has its own connector and its own domains.',
  })
  @IsOptional()
  @IsIn(RECONCILIATION_SOURCE_SYSTEMS)
  sourceSystem?: ReconciliationSourceSystem;
}
