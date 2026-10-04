import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class TwoFactorStatusDto {
  @Expose() @ApiProperty() enabled!: boolean;

  @Expose()
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  enabledAt!: Date | null;

  @Expose() @ApiProperty({ minimum: 0 }) recoveryCodesRemaining!: number;

  static of(enabledAt: Date | null, recoveryCodesRemaining: number): TwoFactorStatusDto {
    const dto = new TwoFactorStatusDto();

    dto.enabled = enabledAt !== null;
    dto.enabledAt = enabledAt;
    dto.recoveryCodesRemaining = recoveryCodesRemaining;

    return dto;
  }
}
