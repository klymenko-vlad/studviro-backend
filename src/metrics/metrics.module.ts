import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { makeHistogramProvider, PrometheusModule } from '@willsoto/nestjs-prometheus';

import { MetricsController } from './metrics.controller';
import { MetricsGuard } from './metrics.guard';
import { HTTP_DURATION_HISTOGRAM, MetricsInterceptor } from './metrics.interceptor';

/**
 * Health checks answer up/down. Metrics answer "how badly", which is the
 * question that actually precedes an incident.
 */
@Module({
  imports: [
    PrometheusModule.register({
      controller: MetricsController,
      defaultMetrics: { enabled: true },
      // The scrape endpoint is infrastructure, not API surface: excluded from
      // the global prefix in `bootstrap`, and never in the OpenAPI document.
      global: false,
    }),
  ],
  providers: [
    MetricsGuard,
    makeHistogramProvider({
      name: HTTP_DURATION_HISTOGRAM,
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      // Tuned around a 15s request timeout: dense where healthy traffic lives,
      // sparse in the tail, so p99 stays meaningful without exploding
      // cardinality.
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    }),
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class MetricsModule {}
