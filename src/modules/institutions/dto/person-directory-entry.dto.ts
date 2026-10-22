import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import { CursorPageMetaDto } from '../../../common/dto/pagination.dto';
import { USER_STATUSES, type User, type UserStatus } from '../../../database/schema';
import { RoleAssignmentResponseDto } from '../../authorization/dto/role-assignment-response.dto';

@Exclude()
export class PersonDirectoryEntryDto {
  @Expose() @ApiProperty({ format: 'uuid' }) userId!: string;
  @Expose() @ApiProperty() email!: string;
  @Expose() @ApiProperty() displayName!: string;
  @Expose() @ApiProperty({ enum: USER_STATUSES }) status!: UserStatus;

  @Expose()
  @Type(() => RoleAssignmentResponseDto)
  @ApiProperty({ type: RoleAssignmentResponseDto, isArray: true })
  roles!: RoleAssignmentResponseDto[];

  static fromEntity(user: User, roles: RoleAssignmentResponseDto[]): PersonDirectoryEntryDto {
    const dto = new PersonDirectoryEntryDto();

    dto.userId = user.id;
    dto.email = user.email;
    dto.displayName = user.displayName;
    dto.status = user.status;
    dto.roles = roles;

    return dto;
  }
}

/**
 * Named rather than `CursorPageDto<PersonDirectoryEntryDto>`, for the reason
 * `AuditEventPageDto` is: the generic's `items` carries no type, so the
 * generated client validates it as an array of arrays and rejects every real
 * response.
 */
export class PersonDirectoryPageDto {
  @ApiProperty({ type: PersonDirectoryEntryDto, isArray: true })
  readonly items: PersonDirectoryEntryDto[];

  @ApiProperty({ type: CursorPageMetaDto })
  readonly meta: CursorPageMetaDto;

  constructor(items: PersonDirectoryEntryDto[], meta: CursorPageMetaDto) {
    this.items = items;
    this.meta = meta;
  }
}
