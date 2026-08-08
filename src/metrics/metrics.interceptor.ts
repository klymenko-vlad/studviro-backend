import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  type HttpException,
} from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Histogram } from 'prom-client';
import { Observable, tap } from 'rxjs';

export const HTTP_DURATION_HISTOGRAM = 'http_request_duration_seconds';

interface RoutedRequest {
  method?: string;
  routeOptions?: { url?: string };
  routerPath?: string;
  url?: string;
}

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric(HTTP_DURATION_HISTOGRAM)
    private readonly duration: Histogram<'method' | 'route' | 'status'>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<RoutedRequest>();
    const started = process.hrtime.bigint();

    const observe = (status: number): void => {
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;

      this.duration.observe(
        { method: request.method ?? 'UNKNOWN', route: routeOf(request), status },
        seconds,
      );
    };

    return next.handle().pipe(
      tap({
        next: () => {
          observe(http.getResponse<{ statusCode?: number }>().statusCode ?? 200);
        },
        error: (error: unknown) => {
          observe(statusOf(error));
        },
      }),
    );
  }
}

/**
 * The route *pattern*, never the resolved URL. Labelling with `/users/<uuid>`
 * would mint a new time series per user and eventually take Prometheus down.
 */
function routeOf(request: RoutedRequest): string {
  return request.routeOptions?.url ?? request.routerPath ?? 'unmatched';
}

function statusOf(error: unknown): number {
  const status = (error as Partial<HttpException>).getStatus?.();

  return typeof status === 'number' ? status : 500;
}
