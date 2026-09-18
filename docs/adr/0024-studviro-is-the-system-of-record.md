# 0024 — StudViro is the system of record, not a layer over two others

Status: accepted
Date: 2026-09-18

Supersedes the integration premise of ADRs 0009, 0010, 0012 (audience derivation only),
0014, 0019, 0020, 0022 and 0023. Those decisions remain readable as the record of why the
integration was shaped the way it was; they no longer describe what is being built.

## Context

The product was scoped as a unified surface over an existing Student Information System
(AIS2) and an existing LMS (Moodle). Every design decision followed from that: a connector
interface, a synchronization engine with watermarks and tombstones, provenance columns on
twenty-five canonical tables, reconciliation, and a write-back outbox.

**None of it was ever connected to anything.** There is no HTTP client anywhere in
`modules/connectors`; `grep` for `fetch`, `axios`, `http` or `https` across it returns
nothing. Two connectors are registered, `mock-sis` and `mock-lms`, and both generate data
in-process from a numeric seed. `MockSisConnector.healthCheck()` returns
`{ reachable: true }` without checking anything, because there is nothing to reach. The
connector credentials screen encrypts an `apiToken` whose own field description says the
mock accepts any value.

Steps 31–34 of the backlog — a Moodle development instance, Moodle reads, and an AIS2
connector — are `Not started` or `Blocked`, and have been from the beginning. Step 15,
documenting what AIS2 access is even available, is `Blocked` too. The integration was never
deferred; it was never started, and the two things blocking it are outside this project's
control.

Meanwhile the platform grew a complete native half almost by accident. Grade entry,
self-service enrolment, exam registration, the catalogue, notifications, roles and
permissions all work with no source system configured at all — self-service enrolment even
has an explicit branch that grants the place outright when there is no connector to ask.

So the honest description of what exists is a standalone academic platform carrying a large
amount of machinery for an integration that does not exist and is not going to.

## Decision

**StudViro is the system of record.** An institution enters its own data and StudViro is
where that data lives. There is no upstream.

The integration layer is removed rather than left dormant. Three reasons:

1. **It is not free.** Provenance columns are on twenty-five tables and are read by
   sixty-one files outside the integration modules. Every new feature has had to decide what
   `sourceSystem` and `synchronizationStatus` mean for it, and every screen has had to decide
   whether to render "from the university". That is a tax on all future work, paid for a
   capability that does not exist.
2. **It is user-visible and it lies.** The marketing FAQ said "Your systems stay
   authoritative and unchanged. StudViro reads from them and presents one surface over the
   result." The sync monitor, the connector health panel and the reconciliation screen all
   present a working integration to an administrator. None of it is true.
3. **Dormant code rots.** Kept but unused, the connector interface would drift from the
   canonical model with every change and would need rewriting anyway before it could ever be
   used against a real system.

What is kept, because it is not integration:

- **`external_identities`** — identity linking is an authentication concern and OIDC single
  sign-on remains a legitimate goal.
- **The queue** — BullMQ serves email and will serve report generation and file processing.
- **The canonical model itself** — twenty-five tables designed against two real systems'
  semantics is the most valuable output of the research, and it is exactly what a
  replacement needs.

What replaces it: **native creation surfaces for everything that previously only arrived by
import.** An institution cannot today create an academic term, a room, a course offering, an
exam term, a timetable event, a teaching assignment or a programme membership. Those are not
integration features; their absence is simply a hole left by assuming an importer would fill
them.

## Consequences

- Roughly 11,900 lines across 138 backend files are deleted, along with four frontend
  entities, four features, two widgets and a route. The backend loses about a third of its
  size and materially more of its conceptual weight.
- Eight schema files lose the `provenance` block, and a migration drops six columns from
  twenty-five tables plus five tables outright (`sync_runs`, `sync_domain_results`,
  `sync_watermarks`, `reconciliation_resolutions`, `source_write_intents`,
  `connector_credentials`).
- `sync:read`, `sync:run` and `connector:configure` leave the permission catalogue. The
  `institution_settings.academicSystemConnector` / `learningSystemConnector` fields go with
  the connectors.
- **The `mock-sis` dataset generator is kept, repurposed as the demo seed.** It is the only
  realistic synthetic university the project has, step 30 depends on it, and the thesis needs
  a populated system to demonstrate. It stops being a connector and becomes a seeding script
  that writes canonical rows directly.
- Backlog steps 5, 7, 10, 12, 13, 14, 16, 29, 31, 32, 33, 34, 35, 36, 37 and 46 are void.
  Steps 4 and 5 — cataloguing what AIS2 and Moodle do — survive with a different purpose:
  they are the feature checklist a replacement must meet, not a mapping to be synchronised.
- The thesis framing changes from _integration of two systems_ to _a single system that
  subsumes both_, which the comparison in step 66 was going to have to make anyway.
- **What is genuinely lost:** the ability to adopt StudViro without re-entering institutional
  data. An institution migrating from AIS2 would need a one-off import, which is a much
  smaller thing than a live two-way synchronization and can be written when somebody actually
  needs it, against a real export rather than a guess.
