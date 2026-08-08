import { Injectable, type BeforeApplicationShutdown } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';

/**
 * Orchestrators send SIGTERM and remove the pod from the load balancer
 * concurrently, not in order. Without a drain window the readiness probe keeps
 * reporting healthy while Nest is already tearing providers down, so traffic
 * routed during that gap is answered by a half-closed application.
 *
 * Failing readiness first, then waiting, gives the balancer time to notice
 * before anything is actually shut down.
 */
@Injectable()
export class ShutdownService implements BeforeApplicationShutdown {
  private shuttingDown = false;

  constructor(
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ShutdownService.name);
  }

  get isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  async beforeApplicationShutdown(signal?: string): Promise<void> {
    this.shuttingDown = true;

    const drainMs = this.config.http.shutdownDrainMs;
    this.logger.info({ signal, drainMs }, 'draining: readiness now reports unavailable');

    if (drainMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, drainMs));
    }
  }
}
