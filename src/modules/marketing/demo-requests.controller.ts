import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiAcceptedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { PublicFormThrottle } from '../../common/throttling';
import { Public } from '../auth/decorators/public.decorator';
import { RequireCaptcha } from '../captcha/decorators/require-captcha.decorator';
import { CaptchaGuard } from '../captcha/guards/captcha.guard';

import { DemoRequestsService, type DemoRequestContext } from './demo-requests.service';
import { CreateDemoRequestDto } from './dto/create-demo-request.dto';
import { DemoRequestAcceptedDto } from './dto/demo-request-accepted.dto';

const ACCEPTED: DemoRequestAcceptedDto = { status: 'accepted' };

@ApiTags('marketing')
@Controller({ path: 'demo-requests', version: '1' })
export class DemoRequestsController {
  constructor(private readonly demoRequests: DemoRequestsService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @PublicFormThrottle()
  @UseGuards(CaptchaGuard)
  @RequireCaptcha()
  @ApiOperation({ summary: 'Ask for a demonstration of the platform' })
  @ApiAcceptedResponse({ type: DemoRequestAcceptedDto })
  @ApiErrorResponses()
  async createDemoRequest(
    @Body() dto: CreateDemoRequestDto,
    @Req() request: unknown,
  ): Promise<DemoRequestAcceptedDto> {
    await this.demoRequests.submit(dto, contextOf(request));

    // Constant whether the lead was stored, deduplicated or dropped as spam:
    // anything else lets a caller enumerate which addresses are already known.
    return ACCEPTED;
  }
}

function contextOf(request: unknown): DemoRequestContext {
  const { headers, ip } = request as {
    headers?: Record<string, string | string[] | undefined>;
    ip?: string;
  };
  const agent = headers?.['user-agent'];

  return { userAgent: Array.isArray(agent) ? agent[0] : agent, ipAddress: ip };
}
