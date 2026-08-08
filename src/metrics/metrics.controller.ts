import { Controller } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrometheusController } from '@willsoto/nestjs-prometheus';

import { Public } from '../modules/auth/decorators/public.decorator';

/**
 * Subclassed only to opt the scrape endpoint out of the global auth guard and
 * the rate limiter. Prometheus scrapes on a fixed interval with no credentials,
 * and reach to this port is controlled at the network layer, not by a token.
 */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller('metrics')
export class MetricsController extends PrometheusController {}
