import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import type { Institution } from '../../../database/schema';

@Exclude()
export class InstitutionResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty() defaultLocale!: string;
  @Expose() @ApiProperty() timezone!: string;
  @Expose()
  @ApiPropertyOptional({
    description:
      'The raw token of the first-admin invitation created via firstAdminEmail, present ' +
      'only outside production where there is no mail transport to deliver it through.',
  })
  firstAdminInvitationDevToken?: string;

  static fromEntity(
    institution: Institution,
    firstAdminInvitationDevToken?: string,
  ): InstitutionResponseDto {
    const dto = new InstitutionResponseDto();

    dto.id = institution.id;
    dto.code = institution.code;
    dto.name = institution.name;
    dto.defaultLocale = institution.defaultLocale;
    dto.timezone = institution.timezone;
    if (firstAdminInvitationDevToken)
      dto.firstAdminInvitationDevToken = firstAdminInvitationDevToken;

    return dto;
  }
}
