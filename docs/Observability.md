# Observability

What the running system reports about itself, what each number means, what to alert on,
and what is deliberately not measured.

## What the institution must supply

Everything here depends on a deployment this project does not own. None of it is a code
change; all of it has to be decided by whoever runs the platform.

| Thing                    | What is needed                                                                                                                                                                                             | State               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Scrape endpoint exposure | `GET /metrics` must be reachable by the Prometheus server and by nobody else. Either bind it to a private network or keep it behind `METRICS_TOKEN`, which the scraper sends as `Authorization: Bearer …`. | `TODO(institution)` |
| `METRICS_TOKEN`          | Mandatory in production — the environment schema refuses to boot without it when `METRICS_ENABLED` is true. At least 32 characters, rotated like any other secret.                                         | `TODO(institution)` |
| Scrape interval          | The thresholds below assume 15s. A longer interval blunts every `rate()` window named here.                                                                                                                | `TODO(institution)` |
| Retention                | How long series are kept. Affects nothing in this repository except how far back an incident can be read.                                                                                                  | `TODO(institution)` |
| Alert routing            | Which of the rules below page a human, which raise a ticket, and who receives them out of hours.                                                                                                           | `TODO(institution)` |
| Log retention and search | Metrics say how badly; the Pino logs say for whom. Per-subject questions are answered there, deliberately — see _Cardinality_.                                                                             | `TODO(institution)` |
| Dashboards               | No dashboard definitions ship with this repository. The metric names below are the contract.                                                                                                               | `TODO(institution)` |

## Freshness, reinterpreted

The backlog step that produced this document asked for _freshness_, and it meant one
thing: how far behind the upstream system StudViro's copy of the data had fallen. ADR 0024
removed the upstream. StudViro is the system of record — an institution enters its own
data here, nothing is copied from anywhere, and a row is current the moment it is written.
There is no lag to measure, and a "data freshness" gauge on a system of record would
report a constant zero and mean nothing.

What survives the pivot is the operational half of the same question: **is the system
still doing the work it has been given, and how long has anything been waiting?** That is
what is measured here, under three headings:

- **Queue lag** — jobs accepted but not yet run, and the age of the oldest one. A password
  reset email enqueued eleven minutes ago is the closest thing this system has to stale
  data, and it is a real user waiting at a real screen.
- **Migration drift** — how far the database is behind the build that is talking to it.
  Readiness already refuses traffic on a drifted database; the gauge is what tells a human
  why, and by how much.
- **Liveness of the process itself** — request rate, error rate, latency, event-loop lag.

## What already existed

Before this step the scrape endpoint exposed two things, and this document does not
re-describe them as new:

- **prom-client's default metrics** — `process_cpu_seconds_total`,
  `process_resident_memory_bytes`, `process_open_fds`, `nodejs_heap_size_used_bytes`,
  `nodejs_eventloop_lag_seconds` and its quantiles, `nodejs_gc_duration_seconds`,
  `nodejs_version_info`. Registered by `PrometheusModule.register({ defaultMetrics: { enabled: true } })`.
- **`http_request_duration_seconds`** — a histogram labelled `method`, `route`, `status`,
  with buckets from 5ms to 10s.

Alongside them, and unchanged: `/health/live`, `/health/ready` (connection plus migration
count) and `/health` (adds queue backlog, heap and RSS), and Pino request logs correlated
by `x-request-id`.

Two things about the pre-existing setup turned out not to be true, and were fixed rather
than documented around:

1. **The scrape endpoint was not at `/metrics`.** URI versioning applies to every
   controller, and the global-prefix exclusion in `bootstrap` only strips `/api` — so the
   endpoint answered on `/v1/metrics` and returned 404 on `/metrics`. `MetricsController`
   is now `VERSION_NEUTRAL`, like the health probes, and answers on `/metrics`. **A scrape
   configuration pointing at `/v1/metrics` must be changed.** Its exposure is otherwise
   untouched: still `@Public()`, still behind `MetricsGuard`, still excluded from the
   OpenAPI document and from rate limiting.
2. **Guard rejections were invisible.** Nest runs guards before interceptors, so the
   interceptor that recorded the histogram never saw a request turned away by
   authentication, authorization or the rate limiter — every 401, 403 and 429 was missing
   from the one metric that was supposed to show them. Recording moved to Fastify's
   `onResponse` hook (`HttpMetricsRecorder`, wired in `bootstrap`). The histogram now
   measures the whole request rather than the handler alone, which is also what an
   operator means by latency.

## What is measured

| Metric                                 | Type      | Labels                            | Means                                                          |
| -------------------------------------- | --------- | --------------------------------- | -------------------------------------------------------------- |
| `http_request_duration_seconds`        | histogram | `method`, `route`, `status`       | Whole-request duration, guards and serialization included      |
| `http_requests_total`                  | counter   | `method`, `route`, `status_class` | Requests handled, including those a guard refused              |
| `queue_jobs_completed_total`           | counter   | `queue`, `job_name`               | Handler returned without throwing                              |
| `queue_jobs_failed_total`              | counter   | `queue`, `job_name`, `terminal`   | One failed _attempt_; `terminal="true"` means no retry is left |
| `queue_jobs_waiting`                   | gauge     | `queue`                           | Jobs accepted and not yet picked up                            |
| `queue_oldest_waiting_job_age_seconds` | gauge     | `queue`                           | Age of the oldest waiting job; `0` when the queue is empty     |
| `database_migrations_applied`          | gauge     | —                                 | Migrations recorded in `drizzle.__drizzle_migrations`          |
| `database_migrations_expected`         | gauge     | —                                 | Entries in the journal shipped with this build                 |
| `database_pool_max_connections`        | gauge     | —                                 | Configured `DATABASE_POOL_MAX` for this process                |
| `institutions_count`                   | gauge     | —                                 | Institutions not soft-deleted                                  |

`queue_oldest_waiting_job_age_seconds` is the freshness signal. The BullMQ wait list is
pushed at the head and popped at the tail, so the oldest waiting job is its last element
and reading it costs one `LRANGE key -1 -1`, whatever the depth of the backlog.

**The gauges are sampled on a timer, not on scrape** — queues every 15s, migrations and
institutions every 60s. Two reasons. A scrape must never wait on Postgres or Redis: the
broker that has stopped answering must not also stop the metrics that would explain it. And
a sample that fails logs a warning and leaves the previous value in place, so a momentary
blip reads as a flat line rather than a hole. The cost is that every gauge is up to one
interval stale, which none of the thresholds below are tight enough to care about.

Every replica samples the queues independently and reports the same shared numbers, so
aggregate queue gauges with `max by (queue) (…)`, never `sum`.

## Cardinality

Prometheus keeps every series it has ever ingested for the whole retention window. A label
mistake cannot be taken back by deploying a fix.

**The rule: a label may only take values the code itself enumerates.** A method, a route
pattern, a status class, a queue name, a job name. Never a user id, never an institution
id, never an email, never a resolved path. `/api/v1/institutions/:institutionId` is one
series; `/api/v1/institutions/<uuid>` is one series per institution, for ever.

This is written down in `metrics.module.ts`, where the label sets are declared, and it is
held by `test/e2e/metrics.e2e-spec.ts`, which fires a request at a uuid path and asserts
the uuid appears nowhere in the scrape body.

The consequence is deliberate: **metrics cannot answer "which institution is slow".** The
logs can — they are correlated by request id, they carry the subject, and they can be
discarded on a retention policy. That is the right place for per-subject questions.

## What to alert on

Thresholds assume a 15s scrape. All of them are starting points; the first month of real
traffic is what makes them right.

| Alert                   | Expression                                                                                           | For | Severity |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | --- | -------- |
| Instance down           | `up{job="studviro"} == 0`                                                                            | 2m  | page     |
| Migration drift         | `database_migrations_expected - database_migrations_applied > 0`                                     | 5m  | page     |
| Server errors           | `sum(rate(http_requests_total{status_class="5xx"}[5m])) / sum(rate(http_requests_total[5m])) > 0.05` | 5m  | page     |
| Server errors, elevated | same ratio `> 0.01`                                                                                  | 15m | ticket   |
| Latency, tail           | `histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket[5m]))) > 5`         | 5m  | page     |
| Latency, typical        | `histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m]))) > 1`         | 15m | ticket   |
| Queue not draining      | `max by (queue) (queue_oldest_waiting_job_age_seconds) > 1800`                                       | 5m  | page     |
| Queue lagging           | `max by (queue) (queue_oldest_waiting_job_age_seconds) > 300`                                        | 10m | ticket   |
| Backlog growing         | `max by (queue) (queue_jobs_waiting) > 1000`                                                         | 15m | ticket   |
| Jobs given up on        | `sum by (queue, job_name) (rate(queue_jobs_failed_total{terminal="true"}[15m])) > 0`                 | 15m | ticket   |
| Credential pressure     | `sum(rate(http_requests_total{route="/api/v1/auth/login",status_class="4xx"}[5m])) > 1`              | 10m | ticket   |
| Event loop blocked      | `nodejs_eventloop_lag_p99_seconds > 0.2`                                                             | 10m | ticket   |
| Memory near the probe   | `process_resident_memory_bytes > 900e6`                                                              | 15m | ticket   |
| An institution vanished | `delta(institutions_count[1h]) < 0`                                                                  | —   | ticket   |

Notes on the numbers that are not arbitrary:

- **1800s / 300s on the oldest waiting job.** The only queue with users behind it today is
  `email`, and its jobs are welcome messages and password resets. A reset link five minutes
  late is already a support call; thirty minutes late means the workers are gone.
- **`terminal="true"` at any rate above zero.** A retriable failure is normal and the
  backoff will handle it. A terminal failure is a job nobody will run again — an invalid
  payload, or the last of three attempts. Someone has to look.
- **5s at p99 against a 15s request timeout.** Above 5s the timeout is the next thing that
  happens, so this fires before users start seeing it rather than after.
- **900 MB resident against the 1 GiB RSS health check.** The alert should precede the
  probe turning red, not report it.
- **Memory limits assume `ROLE=all` or `api`.** A worker replica running a report job has
  a different profile; give it its own threshold when there is one to measure.

## What is deliberately not measured

**Domain counts over large tables.** `institutions_count` is published because
`institutions` holds one row per tenant — tens of rows, with an index on the soft-delete
predicate. Nothing else in the model qualifies.

- **Active users.** `users` grows with every person at every institution, and "active"
  would mean either a predicate over that whole table or a count of unexpired refresh
  tokens, which grows faster still. At a 15s scrape a count is 5,760 sequential scans a
  day to produce a number that moves by single digits.
- **Enrolments.** `enrollments` is the largest table in the canonical model — one row per
  student per offering per term, so a mid-sized university crosses a million rows inside
  three years. Counting it on a schedule is a table scan; counting it on a scrape is a
  table scan that blocks the scrape.
- **Grades, results, exam registrations, notifications.** Same shape, same answer.

If these are wanted — and a registrar plausibly wants them — the way to get them is not a
gauge. It is a small `platform_statistics` table written by a nightly job and read by a
cheap indexed query, or a counter incremented at the point of the business event, which
costs nothing per scrape because it is not a count at all. **That is a schema change and
this step did not make one.** It is written down here rather than shipped as a scrape that
table-scans.

**Connection pool in use and idle.** `postgres` keeps its open, busy and queued connection
lists inside a closure; the `Sql` object exposes `options.max` and nothing else. In-use and
idle counts cannot be read without patching the driver, so only the configured ceiling is
published. `pg_stat_activity` would answer the question at the cost of a query per scrape
against the database the metric exists to protect — not worth it. Saturation shows up
first as request latency, which is measured.

**Per-institution or per-user breakdowns of anything.** See _Cardinality_.

**Distributed tracing.** `OTEL_EXPORTER_OTLP_ENDPOINT` is accepted by the environment
schema and nothing reads it. There is no tracer, no span, no exporter. A single modular
monolith with correlated logs does not need one yet; when it is wanted, this is where it
goes.

**Error aggregation.** `SENTRY_DSN` is likewise accepted and unused. Errors reach the Pino
logs and the 5xx ratio above; nothing groups them by stack trace.

## Where the code is

| File                                       | Holds                                                               |
| ------------------------------------------ | ------------------------------------------------------------------- |
| `src/metrics/metric.names.ts`              | Every metric name, in one place                                     |
| `src/metrics/metrics.module.ts`            | Registration, help text, label sets, and the cardinality rule       |
| `src/metrics/http.metrics.ts`              | `HttpMetricsRecorder`, called from the `onResponse` hook            |
| `src/metrics/queue.metrics.ts`             | Counters, called from `BaseProcessor`                               |
| `src/metrics/queue-depth.sampler.ts`       | Waiting count and oldest-waiting age, per queue                     |
| `src/metrics/migration-drift.sampler.ts`   | Applied against expected                                            |
| `src/metrics/institution-count.sampler.ts` | The one cheap domain gauge                                          |
| `src/metrics/database.gauges.ts`           | The configured pool ceiling, and why there is nothing else          |
| `src/metrics/metrics.guard.ts`             | `METRICS_TOKEN`, compared in constant time                          |
| `test/e2e/metrics.e2e-spec.ts`             | That the series exist, that the guard bites, and that no uuid leaks |
