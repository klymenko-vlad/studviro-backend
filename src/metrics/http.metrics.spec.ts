import type { Counter, Histogram } from 'prom-client';
import { describe, expect, it, vi } from 'vitest';

import { HttpMetricsRecorder } from './http.metrics';

describe('HttpMetricsRecorder', () => {
  const observe = vi.fn();
  const inc = vi.fn();

  const recorder = () =>
    new HttpMetricsRecorder(
      { observe } as unknown as Histogram<'method' | 'route' | 'status'>,
      { inc } as unknown as Counter<'method' | 'route' | 'status_class'>,
    );

  const handled = {
    method: 'GET',
    route: '/api/v1/institutions/:institutionId',
    status: 200,
    durationMs: 250,
  };

  it('labels with the route pattern and converts the duration to seconds', () => {
    recorder().record(handled);

    expect(observe).toHaveBeenCalledWith(
      { method: 'GET', route: '/api/v1/institutions/:institutionId', status: 200 },
      0.25,
    );
  });

  it.each([
    [204, '2xx'],
    [304, '3xx'],
    [401, '4xx'],
    [503, '5xx'],
  ])('reduces status %i to the class %s', (status, statusClass) => {
    recorder().record({ ...handled, status });

    expect(inc).toHaveBeenCalledWith({
      method: 'GET',
      route: '/api/v1/institutions/:institutionId',
      status_class: statusClass,
    });
  });

  it('labels a request that matched no route as unmatched', () => {
    recorder().record({ ...handled, route: undefined, status: 404 });

    expect(inc.mock.calls[0]?.[0]).toMatchObject({ route: 'unmatched' });
  });

  it('labels a request with no method as unknown', () => {
    recorder().record({ ...handled, method: undefined });

    expect(inc.mock.calls[0]?.[0]).toMatchObject({ method: 'UNKNOWN' });
  });

  it('never observes a negative duration', () => {
    recorder().record({ ...handled, durationMs: -1 });

    expect(observe.mock.calls[0]?.[1]).toBe(0);
  });
});
