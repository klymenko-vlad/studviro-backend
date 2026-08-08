import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { UpdateMeDto } from './dto/update-me.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

/**
 * Self-service, separate from `UsersController` because that one is `@Roles('admin')`
 * wholesale — an ordinary user must be able to read and edit exactly one row,
 * their own, and the id therefore comes from the verified token rather than
 * from the path.
 *
 * `users/me` is registered ahead of `users/:id`; Fastify's router ranks a static
 * segment above a parametric one, so "me" can never be parsed as an id.
 */
@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller({ path: 'users/me', version: '1' })
export class MeController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current user' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiErrorResponses()
  findMe(@CurrentUser('id') userId: string): Promise<UserResponseDto> {
    return this.usersService.findOne(userId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update the current user' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiErrorResponses()
  updateMe(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateMeDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateProfile(userId, dto);
  }
}
