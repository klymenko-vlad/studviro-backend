import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

import { SYNC_RUN_MODES, type SourceSystem, type SyncRunMode } from '../../../database/schema';

export const SYNCHRONIZED_SOURCE_SYSTEMS = ['sis', 'lms'] as const;
export type SynchronizedSourceSystem = Extract<SourceSystem, 'sis' | 'lms'>;

export class StartSyncRunDto {
  @ApiPropertyOptional({
    enum: SYNC_RUN_MODES,
    default: 'incremental',
    description:
      'A full run ignores the stored watermarks and re-reads every record the connector offers.',
  })
  @IsOptional()
  @IsIn(SYNC_RUN_MODES)
  mode?: SyncRunMode;

  @ApiPropertyOptional({
    enum: SYNCHRONIZED_SOURCE_SYSTEMS,
    default: 'sis',
    description:
      'Which half of the model to import: the student information system or the learning management system.',
  })
  @IsOptional()
  @IsIn(SYNCHRONIZED_SOURCE_SYSTEMS)
  sourceSystem?: SynchronizedSourceSystem;
}
