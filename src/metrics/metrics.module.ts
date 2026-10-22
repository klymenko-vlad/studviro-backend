import { Global, Module } from '@nestjs/common';
import {
  makeCounterProvider,
  makeGaugeProvider,
  makeHistogramProvider,
  PrometheusModule,
} from '@willsoto/nestjs-prometheus';

import { HealthModule } from '../health/health.module';

import { DatabasePoolGauge } from './database.gauges';
import { HttpMetricsRecorder } from './http.metrics';
import { InstitutionCountSampler } from './institution-count.sampler';
import {
  DATABASE_POOL_MAX_GAUGE,
  HTTP_DURATION_HISTOGRAM,
  HTTP_REQUESTS_COUNTER,
  INSTITUTIONS_GAUGE,
  MIGRATIONS_APPLIED_GAUGE,
  MIGRATIONS_EXPECTED_GAUGE,
  QUEUE_COMPLETED_COUNTER,
  QUEUE_FAILED_COUNTER,
  QUEUE_OLDEST_WAITING_GAUGE,
  QUEUE_WAITING_GAUGE,
} from './metric.names';
import { MetricsController } from './metrics.controller';
import { MetricsGuard } from './metrics.guard';
import { MigrationDriftSampler } from './migration-drift.sampler';
import { QueueDepthSampler } from './queue-depth.sampler';
import { QueueMetrics } from './queue.metrics';

/**
 * Health checks answer up/down. Metrics answer "how badly", which is the
 * question that actually precedes an incident.
 *
 * Every label below is drawn from a set the code itself enumerates — a route
 * pattern, a method, a status class, a queue name, a job name. Nothing
 * identifying a row is ever a label: a user id, an institution id, an email or
 * a resolved path would mint a time series per subject, and Prometheus keeps
 * every series it has ever seen for the whole retention window. The question
 * "which institution is slow" is answered from the logs, which are correlated
 * by request id and can be discarded.
 */
@Global()
@Module({
  imports: [
    HealthModule,
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
      help: 'HTTP request duration in seconds, by method, route pattern and status code',
      labelNames: ['method', 'route', 'status'],
      // Tuned around a 15s request timeout: dense where healthy traffic lives,
      // sparse in the tail, so p99 stays meaningful without exploding
      // cardinality.
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    }),
    makeCounterProvider({
      name: HTTP_REQUESTS_COUNTER,
      help: 'HTTP requests handled, by method, route pattern and status class',
      labelNames: ['method', 'route', 'status_class'],
    }),
    makeCounterProvider({
      name: QUEUE_COMPLETED_COUNTER,
      help: 'Background jobs that finished successfully, by queue and job name',
      labelNames: ['queue', 'job_name'],
    }),
    makeCounterProvider({
      name: QUEUE_FAILED_COUNTER,
      help: 'Background job attempts that failed, by queue and job name; terminal marks an attempt with no retry left',
      labelNames: ['queue', 'job_name', 'terminal'],
    }),
    makeGaugeProvider({
      name: QUEUE_WAITING_GAUGE,
      help: 'Jobs waiting to be picked up, by queue',
      labelNames: ['queue'],
    }),
    makeGaugeProvider({
      name: QUEUE_OLDEST_WAITING_GAUGE,
      help: 'Age in seconds of the oldest job still waiting, by queue; zero when the queue is empty',
      labelNames: ['queue'],
    }),
    makeGaugeProvider({
      name: DATABASE_POOL_MAX_GAUGE,
      help: 'Configured maximum size of the PostgreSQL connection pool in this process',
    }),
    makeGaugeProvider({
      name: INSTITUTIONS_GAUGE,
      help: 'Institutions that have not been soft-deleted',
    }),
    makeGaugeProvider({
      name: MIGRATIONS_APPLIED_GAUGE,
      help: 'Migrations recorded as applied in the database',
    }),
    makeGaugeProvider({
      name: MIGRATIONS_EXPECTED_GAUGE,
      help: 'Migrations present in the journal shipped with this build',
    }),
    DatabasePoolGauge,
    HttpMetricsRecorder,
    InstitutionCountSampler,
    MigrationDriftSampler,
    QueueDepthSampler,
    QueueMetrics,
  ],
  exports: [HttpMetricsRecorder, QueueMetrics],
})
export class MetricsModule {}
