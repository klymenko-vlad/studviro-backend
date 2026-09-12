import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { PublicFormThrottle } from '../../common/throttling';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';

import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationResponseDto } from './dto/invitation-response.dto';
import { InvitationsService } from './invitations.service';

const INSTITUTION_SCOPE = { type: 'institution', param: 'institutionId' } as const;

@ApiTags('invitations')
@Controller({ version: '1' })
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post('institutions/:institutionId/invitations')
  @ApiBearerAuth('access-token')
  @RequirePermission('role:assign', INSTITUTION_SCOPE)
  @ApiOperation({
    operationId: 'createInvitation',
    summary: 'Invite a person by email to claim their record and hold a role',
  })
  @ApiCreatedResponse({ type: InvitationResponseDto })
  @ApiErrorResponses({ notFound: true })
  create(
    @Param('institutionId', ParseUUIDPipe) institutionId: string,
    @Body() dto: CreateInvitationDto,
    @CurrentUser('id') inviterId: string,
  ): Promise<InvitationResponseDto> {
    return this.invitations.create(institutionId, dto, inviterId);
  }

  @Public()
  @Post('invitations/:token/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  @PublicFormThrottle()
  @ApiOperation({
    operationId: 'acceptInvitation',
    summary:
      'Prove control of the invited address, set a password if needed, and claim the record',
  })
  @ApiNoContentResponse({ description: 'The invitation was accepted.' })
  @ApiErrorResponses()
  accept(@Param('token') token: string, @Body() dto: AcceptInvitationDto): Promise<void> {
    return this.invitations.accept(token, dto);
  }
}
