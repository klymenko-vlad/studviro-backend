import { Injectable } from '@nestjs/common';

import { PasswordService } from '../../common/crypto/password.service';
import {
  CursorPageDto,
  CursorPaginationQueryDto,
  PageDto,
  PaginationQueryDto,
} from '../../common/dto/pagination.dto';
import { ConflictError } from '../../common/errors/domain.error';
import type { Transaction } from '../../database/database.tokens';
import { isUniqueViolation } from '../../database/repository/database-error';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly passwords: PasswordService,
  ) {}

  /**
   * No `emailTaken` pre-check: it costs a round-trip and still races, because
   * two concurrent signups can both observe "free" before either inserts. The
   * unique index is the actual guarantee, so the violation is what we handle.
   */
  async create(dto: CreateUserDto, tx?: Transaction): Promise<UserResponseDto> {
    try {
      const created = await this.usersRepository.create(
        {
          email: dto.email,
          displayName: dto.displayName,
          passwordHash: await this.passwords.hash(dto.password),
        },
        tx,
      );

      return UserResponseDto.fromEntity(created);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('USER_EMAIL_TAKEN', 'A user with this email already exists', {
          field: 'email',
        });
      }

      throw error;
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PageDto<UserResponseDto>> {
    const page = await this.usersRepository.findPaginated(query);

    return page.map((user) => UserResponseDto.fromEntity(user));
  }

  async findByCursor(query: CursorPaginationQueryDto): Promise<CursorPageDto<UserResponseDto>> {
    const page = await this.usersRepository.findByCursor(query);

    return page.map((user) => UserResponseDto.fromEntity(user));
  }

  /**
   * A no-op patch must not touch the row: `update` would otherwise bump
   * `updated_at` and burn a write on every locale switch that changed nothing.
   */
  async updateProfile(id: string, dto: UpdateMeDto): Promise<UserResponseDto> {
    const changes = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    );

    if (Object.keys(changes).length === 0) return this.findOne(id);

    return UserResponseDto.fromEntity(await this.usersRepository.update(id, changes));
  }

  async findOne(id: string): Promise<UserResponseDto> {
    return UserResponseDto.fromEntity(await this.usersRepository.findByIdOrFail(id));
  }

  async deactivate(id: string): Promise<void> {
    await this.usersRepository.softDelete(id);
  }
}
