import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class RecoveryCodesDto {
  @Expose()
  @ApiProperty({ type: [String], description: 'Shown once. Each works a single time.' })
  recoveryCodes!: string[];

  static of(recoveryCodes: string[]): RecoveryCodesDto {
    const dto = new RecoveryCodesDto();
    dto.recoveryCodes = recoveryCodes;

    return dto;
  }
}
