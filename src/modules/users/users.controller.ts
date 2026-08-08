import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { ApiPageResponse } from '../../common/decorators/api-page-response.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { Roles } from '../auth/decorators/roles.decorator';

import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

/**
 * Every route declares its success *and* failure schemas explicitly. Nest can
 * infer a lot through the Swagger CLI plugin, but inference silently degrades to
 * `unknown` the moment a return type is not a plain DTO — and `unknown` is
 * exactly what shows up in the generated frontend client.
 */
@ApiTags('users')
@ApiBearerAuth('access-token')
// Administration of arbitrary accounts. Self-service signup lives on
// `POST /auth/register`, which is the only publicly reachable way to create a
// user — these routes must not double as an unauthenticated signup path.
@Roles('admin')
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a user' })
  @ApiCreatedResponse({ description: 'The created user.', type: UserResponseDto })
  @ApiErrorResponses({ conflict: true })
  create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List users' })
  @ApiPageResponse(UserResponseDto)
  @ApiErrorResponses()
  findAll(@Query() query: PaginationQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by id' })
  @ApiOkResponse({ description: 'The requested user.', type: UserResponseDto })
  @ApiErrorResponses({ notFound: true })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return this.usersService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a user' })
  @ApiNoContentResponse({ description: 'The user was soft-deleted.' })
  @ApiErrorResponses({ notFound: true })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.usersService.remove(id);
  }
}
