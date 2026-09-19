import { Controller, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrometheusController } from '@willsoto/nestjs-prometheus';

import { Public } from '../modules/auth/decorators/public.decorator';

import { MetricsGuard } from './metrics.guard';

@ApiExcludeController()
@Public()
@SkipThrottle()
@UseGuards(MetricsGuard)
// Version-neutral, like the probes: URI versioning would otherwise put the
// scrape endpoint at `/v1/metrics` and move it on every API version bump,
// while the global-prefix exclusion in `bootstrap` only strips `/api`.
@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
export class MetricsController extends PrometheusController {}
