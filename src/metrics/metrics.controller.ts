import { Controller, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrometheusController } from '@willsoto/nestjs-prometheus';

import { Public } from '../modules/auth/decorators/public.decorator';

import { MetricsGuard } from './metrics.guard';

@ApiExcludeController()
@Public()
@SkipThrottle()
@UseGuards(MetricsGuard)
@Controller('metrics')
export class MetricsController extends PrometheusController {}
