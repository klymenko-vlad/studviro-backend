import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

import { SYNC_RUN_MODES, type SyncRunMode } from '../../../database/schema';

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
}
