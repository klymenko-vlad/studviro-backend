import { config as loadDotenv } from 'dotenv';

/**
 * Side-effect only: populates `process.env` from the dotenv files.
 *
 * This has to happen before the Nest module graph is *imported*, not before it
 * is instantiated. Decorators and module-level constants are evaluated at
 * import time, so anything that reads `process.env` while a module is being
 * defined — `@Throttle`, a `DynamicModule` chosen by `ROLE` — would otherwise
 * see an environment that dotenv has not filled in yet and silently fall back
 * to its hardcoded defaults.
 *
 * Import it for its side effect, ahead of any module that reaches the
 * application graph. `validateEnv` still runs afterwards and remains the only
 * source of truth for what a value *means*.
 */
for (const path of ['.env.local', '.env']) {
  loadDotenv({ path, quiet: true });
}
