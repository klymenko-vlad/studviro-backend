import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import {
  SUPPORTED_LOCALES,
  USER_ROLES,
  type User,
  type UserRole,
} from '../../../database/schema';

/**
 * Excluded by default, exposed field by field. An allowlist fails closed: a
 * column added to the entity later cannot reach a response until someone opts
 * it in here.
 */
@Exclude()
export class UserResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() email!: string;
  @Expose() @ApiProperty() displayName!: string;

  /**
   * The interface language this account is served in. It is part of the user
   * rather than a client-side preference so it follows them across devices —
   * the browser cookie is a cache of this value, not the source of truth.
   */
  @Expose() @ApiProperty({ enum: SUPPORTED_LOCALES }) locale!: string;

  @Expose() @ApiProperty({ enum: USER_ROLES }) role!: UserRole;

  @Expose() @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;

  /**
   * Returns a real instance, not an object literal. `ClassSerializerInterceptor`
   * resolves `@Exclude`/`@Expose` through the constructor, so a plain object
   * silently bypasses every serialization rule declared here — which turns the
   * first `@Exclude()` anyone adds into a leak that no test would catch.
   */
  static fromEntity(user: User): UserResponseDto {
    const dto = new UserResponseDto();

    dto.id = user.id;
    dto.email = user.email;
    dto.displayName = user.displayName;
    dto.locale = user.locale;
    dto.role = user.role;
    dto.createdAt = user.createdAt;

    return dto;
  }
}
