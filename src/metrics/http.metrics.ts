import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Counter, Histogram } from 'prom-client';

import { HTTP_DURATION_HISTOGRAM, HTTP_REQUESTS_COUNTER } from './metric.names';

export interface HandledRequest {
  readonly method: string | undefined;
  readonly route: string | undefined;
  readonly status: number;
  readonly durationMs: number;
}

/**
 * Recorded from Fastify's `onResponse` hook rather than a Nest interceptor:
 * guards run before interceptors, so an interceptor never sees a request
 * turned away by authentication, authorization or the rate limiter — which is
 * precisely the traffic an operator is looking for during an incident.
 */
@Injectable()
export class HttpMetricsRecorder {
  constructor(
    @InjectMetric(HTTP_DURATION_HISTOGRAM)
    private readonly duration: Histogram<'method' | 'route' | 'status'>,
    @InjectMetric(HTTP_REQUESTS_COUNTER)
    private readonly requests: Counter<'method' | 'route' | 'status_class'>,
  ) {}

  record({ method, route, status, durationMs }: HandledRequest): void {
    const labels = { method: method ?? 'UNKNOWN', route: route ?? 'unmatched' };

    this.duration.observe({ ...labels, status }, Math.max(0, durationMs) / 1000);
    this.requests.inc({ ...labels, status_class: `${Math.floor(status / 100)}xx` });
  }
}
