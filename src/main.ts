import { Logger } from 'nestjs-pino';

import { createApp } from './bootstrap';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get(AppConfigService);
  const logger = app.get(Logger);

  // Without these, a rejection thrown after boot kills the process through
  // Node's default handler, which writes to stderr and never reaches the log
  // pipeline — so the one event worth alerting on is the one that is invisible.
  installProcessGuards(logger);

  if (!config.servesHttp) {
    logger.log(`worker-only role, not binding a port (env=${config.nodeEnv})`, 'Bootstrap');
    return;
  }

  const { host, port } = config.http;
  await app.listen(port, host);

  logger.log(
    `listening on http://${host}:${port} (env=${config.nodeEnv}, role=${config.role})`,
    'Bootstrap',
  );
}

function installProcessGuards(logger: Logger): void {
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandled promise rejection');
  });

  process.on('uncaughtException', (error) => {
    logger.error({ err: error }, 'uncaught exception — exiting');
    // The process is in an undefined state; keeping it alive risks serving
    // corrupted responses. Exit non-zero and let the orchestrator restart it.
    process.exit(1);
  });
}

bootstrap().catch((error: unknown) => {
  console.error('failed to start application', error);
  process.exit(1);
});
