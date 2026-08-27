import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import type { Institution } from '../../../database/schema';

@Exclude()
export class InstitutionResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty() defaultLocale!: string;
  @Expose() @ApiProperty() timezone!: string;

  static fromEntity(institution: Institution): InstitutionResponseDto {
    const dto = new InstitutionResponseDto();

    dto.id = institution.id;
    dto.code = institution.code;
    dto.name = institution.name;
    dto.defaultLocale = institution.defaultLocale;
    dto.timezone = institution.timezone;

    return dto;
  }
}
