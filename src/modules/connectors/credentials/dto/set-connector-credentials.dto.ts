import { ApiProperty } from '@nestjs/swagger';

import { IsStringRecord } from '../../../../common/validators/is-string-record.validator';

export class SetConnectorCredentialsDto {
  @ApiProperty({
    description: 'Credential field keys to their new values. An empty object is rejected.',
    additionalProperties: { type: 'string' },
    example: { apiToken: 'super-secret-value' },
  })
  @IsStringRecord()
  values!: Record<string, string>;
}
