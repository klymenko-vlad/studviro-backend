import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { ExternalIdentityResponseDto } from './dto/external-identity-response.dto';
import { ExternalIdentitiesService } from './external-identities.service';

@ApiTags('identities')
@ApiBearerAuth('access-token')
@Controller({ path: 'users/me/identities', version: '1' })
export class MyIdentitiesController {
  constructor(private readonly identities: ExternalIdentitiesService) {}

  @Get()
  @ApiOperation({
    operationId: 'listMyIdentities',
    summary: 'List the accounts linked to the current user',
  })
  @ApiOkResponse({ type: ExternalIdentityResponseDto, isArray: true })
  @ApiErrorResponses()
  findMine(@CurrentUser('id') userId: string): Promise<ExternalIdentityResponseDto[]> {
    return this.identities.listForUser(userId);
  }
}
