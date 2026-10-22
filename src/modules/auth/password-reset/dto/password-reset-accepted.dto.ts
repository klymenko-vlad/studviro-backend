import { ApiPropertyOptional } from '@nestjs/swagger';

export class PasswordResetAcceptedDto {
  @ApiPropertyOptional({
    description:
      'The raw reset token, present only outside production where there is no mail ' +
      'transport to deliver it through instead.',
  })
  devToken?: string;
}
