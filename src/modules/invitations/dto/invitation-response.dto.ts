import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { CanonicalRole, Invitation, RoleScopeType } from '../../../database/schema';

export class InvitationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  institutionId!: string;

  @ApiProperty()
  address!: string;

  @ApiProperty()
  role!: CanonicalRole;

  @ApiProperty()
  scopeType!: RoleScopeType;

  @ApiPropertyOptional({ format: 'uuid' })
  scopeId!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: Date;

  @ApiPropertyOptional({
    description:
      'The raw invitation token, present only outside production where there is no mail ' +
      'transport to deliver it through instead.',
  })
  devToken?: string;

  static fromEntity(invitation: Invitation, devToken?: string): InvitationResponseDto {
    const dto = new InvitationResponseDto();
    dto.id = invitation.id;
    dto.institutionId = invitation.institutionId;
    dto.address = invitation.address;
    dto.role = invitation.role;
    dto.scopeType = invitation.scopeType;
    dto.scopeId = invitation.scopeId;
    dto.expiresAt = invitation.expiresAt;
    if (devToken) dto.devToken = devToken;

    return dto;
  }
}
