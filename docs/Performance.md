# Performance

What the system was asked to do, what it did, and what gave way first.

`load-test/smoke.js` answers "is it still fast?" for one screen's worth of traffic.
This document is about the other question: **what happens in the five minutes a term
actually turns over.**

## What the institution must supply

| Thing                  | What is needed                                                                                                                                                                                                                             | State               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| Real population        | Every number below was measured against 144 students. A university with 20,000 will bend in the same places at a different rate, and the profile has to be re-run against it.                                                              | `TODO(institution)` |
| Production hardware    | One API process on a shared 16-core laptop is not a deployment. Replica count, CPU allocation and the Postgres instance change every figure here.                                                                                          | `TODO(institution)` |
| Rate-limit budget      | `THROTTLE_LIMIT` is per address. The right value depends on whether students reach the API through a campus NAT, which would put thousands of them behind one IP.                                                                          | `TODO(institution)` |
| Enrolment policy       | A lost race is now retried three times before the student is told anything. Whether that is the right number, and whether a student who still loses should be queued rather than refused, is the institution's call. See _Where it bends_. | `TODO(institution)` |
| Where the profile runs | Nothing runs this in CI today. It takes five minutes and needs a seeded database, so it is a release gate rather than a per-commit one.                                                                                                    | `TODO(institution)` |

## The load a university actually makes

A uniform request rate is the wrong model. Term traffic is **spiky and correlated**: it
arrives in bursts, and inside a burst everybody wants the same row. Three moments carry
almost all of it, and each of them breaks something different.

| Scenario          | The moment                                                             | What it strains                                    |
| ----------------- | ---------------------------------------------------------------------- | -------------------------------------------------- |
| `results_evening` | Marks are published; everybody signs in and reads the same six screens | Sign-in cost, read fan-out, the event loop         |
| `enrollment_rush` | The enrolment window opens; 144 students want 40 places                | The serialisable write path and the capacity check |
| `exam_rush`       | Exam registration opens; the same herd, a smaller room                 | The same, against a row with fewer seats           |

They overlap on purpose. `load-test/university-day.js` starts the browsing wave at
zero seconds, drops the enrolment rush into it at ninety, and the exam rush at two
hundred — because in a real term they land on top of each other, not in turn.

### `results_evening`

A `ramping-arrival-rate` scenario: 2 arrivals a second, up to a peak over a minute, held
for two, then down. Each arrival is one student's whole evening — sign in, then
`/auth/me`, permissions, my courses, the result summary, the results themselves, the
week's timetable, the unread count. Eight requests and one argon2id verification.

Arrival rate is the right executor here rather than a fixed number of virtual users: when
the server slows down, a fixed VU pool politely slows with it and the test measures
nothing. An arrival rate keeps knocking, which is what students do.

### `enrollment_rush`

144 students, one iteration each, all released inside a three-second jitter window, all
asking for the same offering. The offering has 40 places. This is the capacity race, run
for real: `MyEnrollmentsService.request` opens a **serialisable** transaction, counts
occupied seats, and refuses if the course is full.

### `exam_rush`

The same herd against an exam term with 25 seats on the same offering. Only the students
who won a place in the enrolment rush are enrolled, so only they may register; the rest
load the screen and stop, which is also what they would do.

## The fixture

`pnpm db:seed` is the population: a demo university of 144 students, 72 courses, 144
offerings and 288 exam terms (ADR 0025). The rush targets are **not** seeded — they are
created through the administrator API in k6's `setup()`, for two reasons. Every seeded
exam term sits outside its registration window, so none of them can be rushed. And a
fixture built in `setup()` has exactly the seat count the assertions expect, rather than
whichever number the seed happened to write.

What `setup()` builds, as the institution administrator:

1. finds the academic term whose enrolment window is open now;
2. creates a course `LOAD-RUSH-<n>` under the first department;
3. puts it on offer in that term with 40 places, status `open`;
4. offers a `regular` exam term on it with 25 seats and a registration window that
   opened an hour ago;
5. signs in every student and keeps the access tokens.

The course is left behind deliberately. `pnpm db:seed` deletes and rewrites the
institution it owns, so **re-seeding is the cleanup**.

## Running it

k6 is not a dependency of this repository and is not installed by `pnpm install`. Take the
binary from Grafana's releases and put it on the path — the runs below were made with
k6 v1.4.0.

```bash
pnpm docker:up
pnpm db:migrate
pnpm db:seed
pnpm build

PORT=3011 ROLE=api LOG_LEVEL=warn QUEUE_PREFIX=loadtest \
  THROTTLE_LIMIT=1000000 AUTH_THROTTLE_LIMIT=1000000 \
  node dist/main.js

BASE_URL=http://localhost:3011 ADMIN_PASSWORD='correct horse battery staple' pnpm load:day
```

Four things about that command are not incidental.

- **`node dist/main.js`, never `nest start --watch`.** On this machine the watcher does
  not release port 3010: every reload after the first fails `EADDRINUSE` and the previous
  build keeps serving, which silently invalidates the run.
- **The throttle limits have to be raised.** `THROTTLE_LIMIT` is 120 requests a minute per
  address and `AUTH_THROTTLE_LIMIT` is 10 logins a minute per address. Every request in a
  k6 run comes from 127.0.0.1, so without raising them the profile measures the rate
  limiter and nothing else. The limiter is not being disabled because it is wrong — it is
  being taken out of the way of a measurement it would otherwise dominate. **A real rush
  arrives from hundreds of addresses.**
- **`LOG_LEVEL=warn`.** In development the Pino transport is `pino-pretty`, and at `debug`
  the profile measures log formatting.
- **`ADMIN_PASSWORD`.** `pnpm db:seed` does not reset an existing account's password, so
  the administrator's password on a long-lived dev database is whatever it was set to,
  not the seed default.

Everything the profile needs is an environment variable: `BASE_URL`, `INSTITUTION_ID`,
`STUDENTS`, `ENROLLMENT_SEATS`, `EXAM_SEATS`, `BROWSE_PEAK_RATE`, `RUSH_JITTER_SECONDS`.
The defaults describe the demo seed.

## The thresholds, and where they come from

A load test that only produces numbers gets read once. These are budgets, and crossing
one fails the run.

| Threshold                                     | Value              | Why that number                                                                                                                                                            |
| --------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http_req_duration{scenario:results_evening}` | p95 < 1s, p99 < 5s | Exactly `docs/Observability.md`'s two latency alerts. A test that tolerates more than the alerts do measures nothing                                                       |
| `enrollment_request_duration`                 | p95 < 3s, p99 < 5s | Three times the read budget: 144 serialisable transactions queue on a pool of ten. Past 5s `REQUEST_TIMEOUT_MS` is the next thing that happens                             |
| `exam_registration_duration`                  | p95 < 3s, p99 < 5s | Same shape, same reasoning                                                                                                                                                 |
| `server_errors`                               | rate < 0.01        | Observability pages on a 5xx ratio over 5% and raises a ticket over 1%. This is the ticket line                                                                            |
| `http_req_failed`                             | rate < 0.01        | 400, 404 and 409 are answers this profile asks for and are declared expected; anything else is a broken response                                                           |
| `unexpected_status`                           | rate == 0          | A status no call site has a name for is a behaviour change, not slowness                                                                                                   |
| `checks`                                      | rate == 1.00       | Every refusal must carry a domain code the client can act on — `OFFERING_FULL`, not a bare 409                                                                             |
| `capacity_respected`                          | rate == 1.00       | Asserted after both rushes: seats held never exceeded seats offered. A rush that quietly oversells passes every timing measure                                             |
| `sign_in_duration`                            | p95 < 2s           | argon2id at 19 MiB is deliberately expensive; it still must not be what makes signing in feel broken                                                                       |
| `enrollment_serialization_conflicts`          | rate < 0.50        | A ceiling, not a target. With the bounded retry it measures about 4%; a change that turns the whole herd into conflicts should fail here rather than be found in September |

## What was measured

**2026-09-19.** One API process (`ROLE=api`, `DATABASE_POOL_MAX=10`), Postgres 17 and
Redis 7 in Docker on the same host: 16 cores, 31 GB. The host was shared with other work
throughout — load average moved between 3 and 43 — which is the main source of the
run-to-run spread noted below.

### The recorded run

Default profile: 144 students, 40 places, 25 exam seats, browsing peak 12 arrivals a
second. 4m 38s, 2,627 iterations, **19,330 requests at 69.6/s**. Every threshold green.

| Metric                             | Result                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| All requests                       | avg 40 ms · med 22 ms · p90 95 ms · **p95 131 ms** · max 771 ms                             |
| Browsing only                      | **p95 132 ms**                                                                              |
| Sign-in (argon2id verify included) | med 56 ms · **p95 177 ms** · max 771 ms                                                     |
| Enrolment request                  | avg 90 ms · **p95 150 ms** · max 176 ms                                                     |
| Exam registration                  | avg 61 ms · **p95 86 ms** · max 207 ms                                                      |
| 5xx                                | **0 of 19,330**                                                                             |
| Unexpected statuses                | **0 of 19,330**                                                                             |
| Enrolment outcome                  | **40 of 40 places filled**, 67 refused as full, 37 of 144 (25.7%) lost a serialisation race |
| Exam outcome                       | **25 of 25 seats filled**, 7 of 32 (21.9%) lost a serialisation race                        |
| Capacity respected                 | **yes, both** — never oversold                                                              |
| Process CPU                        | 231 s over 278 s wall ≈ **0.83 of one core**                                                |
| Resident memory                    | **485 MB** against the 1 GiB health probe                                                   |
| Event-loop lag                     | p99 **19 ms**, max 146 ms                                                                   |

### Turning it up

| Run                                  | Served  | p95 all | p95 browsing | p95 sign-in | p95 enrolment | Conflicts | Seats filled      |
| ------------------------------------ | ------- | ------- | ------------ | ----------- | ------------- | --------- | ----------------- |
| Peak 12/s (recorded)                 | 69.6/s  | 131 ms  | 132 ms       | 177 ms      | 150 ms        | 25.7%     | 40/40 · 25/25     |
| Peak 25/s                            | 135.6/s | 143 ms  | 118 ms       | 114 ms      | 793 ms        | 22.2%     | 40/40 · 25/25     |
| Peak 45/s                            | 104.3/s | 3.01 s  | 2.83 s       | 1.68 s      | 7.57 s        | 59.7%     | 40/40 · 25/25     |
| Peak 12/s, `DATABASE_POOL_MAX=40`    | 69.2/s  | 185 ms  | 158 ms       | 216 ms      | 1.45 s        | **80.6%** | **28/40 · 18/25** |
| Peak 12/s, with the retry, busy host | 68.8/s  | 699 ms  | 645 ms       | 448 ms      | 1.91 s        | **4.2%**  | 40/40 · 25/25     |

The last row is the same profile after the bounded retry landed, on a host that was
carrying other work at the time — which is why its browsing p95 is five times the
recorded run's. Read the conflict column, not the latency columns: that is what changed.

At 45 arrivals a second k6 could not place its iterations at all: **4,739 were dropped**,
and the 104 requests a second in that row is less than the 136 the server was serving
comfortably one row above. That is the knee — somewhere between 135 and 140 requests a
second on this hardware, for this mix, in one process.

Two repeats of the recorded profile while the host was busy (load average 15–40) kept
every read inside budget — browsing p95 stayed between 132 ms and 804 ms — but pushed
enrolment p95 to 2.7 s and 2.9 s. The 3 s budget on the rush write is set with that
spread in mind; on a quiet machine the same run measures 150 ms.

## Where it bends first

**1. The enrolment write path — fixed, and the fix is measured.** Under a herd a quarter
of the requests used to come back `409 SERIALIZATION_FAILURE`, and nothing retried them:
the student was told to try again and it was their problem. `TransactionHost.runSerializable`
now replays the transaction up to three times with exponential backoff and full jitter,
on both the enrolment and the exam-registration paths.

It converted almost exactly what the earlier run predicted it would.

|                                    | Before                | After               |
| ---------------------------------- | --------------------- | ------------------- |
| Enrolment conflicts                | 37 of 144 (**25.7%**) | 6 of 144 (**4.2%**) |
| Exam conflicts                     | 7 of 32 (**21.9%**)   | 1 of 40 (**2.5%**)  |
| Enrolment granted · refused · lost | 40 · 67 · 37          | 40 · **98** · 6     |
| Capacity respected                 | yes                   | yes                 |

The middle row is the whole point. The 31 requests that stopped being conflicts did not
become places — the course only ever had 40 — they became `OFFERING_FULL`, which is a
true answer the client can act on rather than an error the student has to interpret. A
replay re-reads the seat count, so a herd that has already filled the course is told so.

Six students still lost after three attempts. That is a floor rather than a bug: raising
the attempt count trades a longer wait for a smaller tail, and three attempts keeps the
worst case well inside `REQUEST_TIMEOUT_MS`.

The cost is latency, and it is smaller than it looks. Enrolment p95 measured 1.91 s
against 150 ms on the recorded run — but browsing p95 measured 645 ms against 132 ms in
the same run, so most of that gap is a busy host rather than the retry (the earlier
document already records repeats at 2.7 s and 2.9 s on a loaded machine). Both stayed
inside budget, and every threshold was green.

**2. Giving the database more connections makes it worse.** With `DATABASE_POOL_MAX=40`
instead of 10, the same rush produced **80.6% conflicts and left 12 of 40 places unsold**,
and the exam term filled 18 of 25. More concurrency at the database means more
transactions reading the same seat count at the same instant and more of them losing.
The pool of ten is acting as accidental admission control, and it is the only thing
currently stopping the rush from failing most of the herd. **Do not raise
`DATABASE_POOL_MAX` to make enrolment faster.** The retry in point 1 has now landed, which
was the precondition this document set for touching the pool at all — but the 40-connection
run has not been repeated since, so the pairing is still unmeasured. Raise it only with a
fresh run of this profile in hand.

**3. Correctness never gave way.** Across every run, at every rate, with two pool sizes:
zero 5xx, zero oversold seats, and every refusal carried a domain code a client can act
on. The serialisable transaction is expensive and it is buying exactly what it should.

**4. Signing in is the per-request CPU floor.** argon2id at 19 MiB and t=2 is roughly
50 ms of one core per attempt and cannot be cached away. At the knee it is the largest
single contributor: sign-in p95 went from 114 ms to 1.68 s between 25 and 45 arrivals a
second, faster than any read degraded. One process is one CPU for JavaScript, so **the
answer is replicas, not tuning** — the parameters are at the OWASP minimum already and
lowering them is a security decision, not a performance one.

**5. The per-IP rate limiter is the first wall a real test hits, and it is right.** 120
requests a minute per address stops this profile dead at the third iteration. That is
correct behaviour against a single machine; it is also the reason an institution behind a
campus NAT has to think about `THROTTLE_LIMIT` before a registration day rather than
during one.

## What this does not measure

- **A university-sized population.** 144 students, 1,152 enrolments. The largest tables in
  a real deployment are two to three orders of magnitude bigger, and the keyset-paginated
  reads that are cheap here are the ones to re-measure there.
- **The worker.** The profile runs `ROLE=api`. Notification and email jobs are enqueued
  and nothing drains them; queue behaviour under load is `docs/Observability.md`'s
  territory and has no load profile of its own yet.
- **The client.** Next.js acts as the BFF and every number here is the API answering k6
  directly. A browser doing the same journey pays for server components and hydration on
  top.
- **More than one replica.** Everything was measured against a single process against a
  single Postgres. The throttle store and the idempotency store are already in Redis, so
  the shape should hold, but it has not been run.
- **Sustained load.** The longest run is under five minutes. Nothing here says anything
  about a memory leak or connection churn over a day.

## Where the code is

| File                          | Holds                                                               |
| ----------------------------- | ------------------------------------------------------------------- |
| `load-test/smoke.js`          | The baseline profile: is one screen's worth of traffic still fast   |
| `load-test/university-day.js` | The three correlated scenarios, and every threshold                 |
| `load-test/lib/config.js`     | Every knob, and its default for the demo seed                       |
| `load-test/lib/fixtures.js`   | `setup()`: the offering and exam term everybody rushes              |
| `load-test/lib/client.js`     | One request, with the 5xx and unexpected-status judgements recorded |
| `load-test/lib/auth.js`       | Sign-in, timed separately because argon2id dominates it             |
| `load-test/lib/metrics.js`    | The custom metrics, including the ones latency cannot express       |
