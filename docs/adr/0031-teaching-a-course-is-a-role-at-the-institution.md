# 0031 — Teaching a course is a role at the institution, not only at the offering

Status: accepted
Date: 2026-09-19

Supersedes the closing note of `adr/0028-the-learning-half.md`, which predicted a different
fix for the same defect and predicted it wrongly.

## Context

ADR 0028 recorded a limitation and left it: because `offering:manage` is checked at the
institution while the derived `teacher` role is scoped to an offering, **a teacher who is
not also a course coordinator cannot author their own course page.** It suggested the fix
would be "a scope-aware variant of the permission guard".

Signing in as the seeded teacher showed the limitation was larger than that. The
institution rendered one dead navigation entry and the sentence _"You hold a role here, but
not one that lets you read courses or grades."_ Not the course page — everything. Courses,
grades, the timetable, the roster, their own teaching list.

The account is not unusual. It holds sixteen teaching assignments and **zero granted role
assignments**, which is exactly what `pnpm db:seed` produces and exactly what an institution
that names its lecturers through the teaching panel would produce.

The cause is an asymmetry between the two derivations in `DerivedRolesRepository`:

| Derived from                    | Role produced | Scope               |
| ------------------------------- | ------------- | ------------------- |
| one active programme membership | `student`     | **institution**     |
| a teaching assignment           | `teacher`     | **course offering** |

`AuthorizationService.rolesIn` resolves a requested scope to a set of keys and keeps the
roles whose own scope key is in that set. An institution resolves to `{institution:<id>}`
alone — it does not enumerate the offerings beneath it, and it could not usefully do so.
So an offering-scoped role never satisfies an institution-scoped check, every
institution-scoped route refused the teacher, and a student in the same position was fine
because one membership had already bought them institution scope.

The guard variant ADR 0028 imagined would not have helped. `teacher` does not carry
`offering:manage` at any scope, so a scope-aware check for that permission still refuses
them; it would have needed the catalogue widened as well.

## Decision

**Teaching anything at an institution derives a role at that institution, in addition to
the per-offering roles.** Somebody who teaches a course is a teacher _of the university_,
not only of INF/ALG/22, and the permission model should say so the way it already does for
students.

Three things bound it.

**The derived role is the one actually held.** A person whose assignments are all
`assistant` derives `teaching_assistant`, not `teacher`. Deriving `teacher` for them would
hand an assistant `grade:publish` — the precise decision the propose/publish ladder exists
to withhold. This was not a hypothetical: the first implementation did exactly that and the
e2e suite caught it.

**It grants no administrative power.** `offering:manage` is not a teacher's permission at
any scope, so putting a course on offer, naming who teaches it, editing study groups, bulk
entry, opening a term, granting a role and reading the audit trail all still refuse a
teacher. `test/e2e/authorization-negative.e2e-spec.ts` pins each of those.

**The guard is admission, not authority.** Every route that now admits a teacher at the
institution asks a second, per-offering question behind it —
`LearningAccessService.stance` for the course page, its materials and its assignments,
`OfferingResultsService.viewerRole` for grades. Those already existed and already counted
whoever teaches the offering as its author. A teacher passes the guard for the whole
institution and is still refused every course that is not theirs.

That layering is why the authoring routes moved from `offering:manage` to `offering:read`
in the same change. A guard cannot answer "is this course yours" from an institution-scoped
permission, and it should not pretend to; it answers "may you touch course data here at
all", and the service answers the rest.

## Consequences

A teacher can use the product. They read the catalogue and the person directory, see their
teaching list, roster, timetable and grades, and open, build, publish and mark their own
course pages without an administrator.

An institution that wants a teacher to have _less_ than this must not give them a teaching
assignment, which is the same lever it already had. There is no way to be the lecturer of a
course and not be able to read the institution that owns it, and there should not be.

`findAllForInstitution` — the people directory's view — deliberately still returns the
per-offering roles only, so the directory keeps naming _which_ courses somebody teaches
rather than collapsing them into one row. The two methods answer different questions:
`findFor` answers "what may this person do", `findAllForInstitution` answers "what does the
directory show".

The seed grants `institution_admin` and `registrar` and nothing else. It does not need to
grant a teacher role, and should not start: a demo where every capability arrives by
explicit grant would hide exactly the defect this ADR fixes.
