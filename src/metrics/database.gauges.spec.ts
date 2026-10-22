import type { Gauge } from 'prom-client';
import { describe, expect, it, vi } from 'vitest';

import type { AppConfigService } from '../config/app-config.service';

import { DatabasePoolGauge } from './database.gauges';

describe('DatabasePoolGauge', () => {
  it('publishes the configured pool ceiling once the module starts', () => {
    const set = vi.fn();
    const config = { database: { poolMax: 12 } } as AppConfigService;

    new DatabasePoolGauge(config, { set } as unknown as Gauge).onModuleInit();

    expect(set).toHaveBeenCalledWith(12);
  });
});
