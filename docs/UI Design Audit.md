# UI Design Audit

Date: 2026-09-19. Scope: the whole `frontend/` surface — 303 components, every route, both
themes, desktop (1440×900) and mobile (390×844), read statically and driven in a real
browser against the seeded demo university.

This is a findings document, not a backlog step. Nothing here has been implemented.

## Verdict

The foundation is better than most projects ever get. The token layer in `globals.css` is
disciplined and complete — semantic names only, light and dark defined in parallel,
`color-scheme` set, `--input` deliberately separated from `--border` on a WCAG 1.4.11
argument, a reduced-motion block, and a `scroll-affordance-x` utility that solves
horizontal overflow with no JavaScript. A sweep for raw palette classes
(`bg-blue-500` and friends) across all 303 files returns **zero**. So does a sweep for
`<div onClick>`, blocked paste, hardcoded date formats, and `window.confirm`. The type
scale is effectively five sizes and two weights. That is real consistency, and most of what
follows builds on it rather than replacing it.

What is missing is a **layer above the tokens**: the app has primitives and it has pages,
but nothing in between. Every page re-implements its own shell. Navigation does not scale
past a handful of items and has no mobile form at all. And the screens that carry the most
data — the tables — have the least design applied to them.

Findings are ordered by how much they change the product, not by how hard they are.

---

## 1. Navigation does not survive its own information architecture

**Severity: high. This is the single most visible problem.**

`widgets/institution-nav` renders up to 17 destinations as one flat, equally-weighted,
wrapping row of pills. An administrator sees all 17. At 1440px they wrap onto two lines; at
390px they wrap onto **six**.

Measured on the running app: on mobile, the app header and the institution nav together
consume **~350px of vertical space before any content** — 40% of the viewport, on every
single screen.

- `src/widgets/institution-nav/ui/institution-nav.tsx:114` — `flex-wrap` on the `<ul>` is
  the mobile strategy. There is no other one.
- `src/widgets/app-header/ui/app-header-bar.tsx:30` — `flex-wrap` on the `<header>`. Same.
  No hamburger, no drawer, no `Sheet` (the primitive is vendored but unused).
- Two stacked full-width bars mean two competing horizontal rules and no clear sense of
  which nav is "where I am" versus "who I am".
- The 17 items have no grouping. _Dashboard, Courses, Enrol, Teaching, Grades, Calendar,
  Exams, Notifications, Learning, Roles, Org units, People, Search, Catalogue, Bulk entry,
  Audit, Settings_ is three distinct products in one list: my studies, teaching, and
  administration.
- No icons. A 17-item text list with no visual anchors is scanned linearly every time.
- `Search` is a nav destination rather than an affordance. There is no `⌘ K`.

**Recommendation.** Move the institution scope into a **collapsible left sidebar** on
`lg:` and up, grouped under three quiet section labels — _Study_, _Teach_, _Administer_ —
with a Lucide icon per item (the dependency is already in 58 files). Collapse to an
icon rail at `md:`. Below that, move it into a `Sheet` behind a hamburger in the header.
Reserve the top bar for identity: logo, institution switcher, search trigger, notification
bell, avatar menu. This also reclaims the ~350px.

**Corollary — the header is carrying dead weight.** `SwitchLocale` renders two persistent
full-size buttons (_English_ / _Slovenčina_) and `ThemeToggle` renders three
(light / dark / system). That is **five always-visible buttons** for two settings that a
user changes approximately once. Both belong inside an avatar dropdown menu
(`dropdown-menu.tsx` is vendored and unused). There is also no avatar menu at all, and
no institution switcher anywhere in the chrome — switching institutions requires
navigating back to `/account`.

---

## 2. There is no page shell, so every page re-invents one

`text-3xl font-semibold tracking-tight` appears **23 times**, always as an `<h1>`, always
followed by a `text-muted-foreground text-pretty` paragraph, always inside
`mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-12`. That block is copy-pasted
verbatim across every view in `src/views/`.

It is consistent _today_ only because it was copied carefully. Nothing enforces it — the
next page can drift, and the 24th instance is where consistency starts to rot.

**Recommendation.** Add two compositions to `shared/ui`, alongside the `ListingCard`
precedent that already establishes this pattern:

- `PageShell` — owns `id="main-content"`, the max-width, the padding and the vertical
  rhythm.
- `PageHeader` — `title`, `description`, an optional `actions` slot (see finding 4) and an
  optional `breadcrumb` slot (see finding 8).

This is a mechanical refactor of 23 files that makes the next 23 free.

**It would also fix a live bug.** On `/institutions/…/people`, the page renders the
heading "People" with the description "Everyone with a role in this institution, granted or
derived from their academic record." — and then, 80px below, a card whose title is
"People" and whose description is _the same sentence again, verbatim_. The view header and
the widget's `CardHeader` both claim to title the page. With a real `PageHeader` the widget
would drop its header and just render the table.

---

## 3. Tables are the weakest surface in the product

Fourteen widgets render a `Table`. Measured on `/institutions/…/people` against the seed:
**164 rows, all rendered, in a 9,766px-tall page.**

- **No pagination, no virtualization.** The guideline threshold is 50 rows. A real
  university is tens of thousands of people, and this list has no ceiling.
- **No search, no filter, no sort.** Not on People, not on Catalogue, not on Courses. The
  only way to find a person is `Ctrl+F` on a ten-thousand-pixel page.
- **No URL state.** A sweep for `useSearchParams` / `nuqs` across every non-test component
  returns **zero**. Nothing is deep-linkable — no filter, no tab, no page, no expanded
  panel. A user cannot send a colleague a link to what they are looking at.
- **The destructive action is the loudest repeated element.** Every row ends with the
  words "Erase this person" as plain full-strength text. 164 times. It is more visually
  prominent than the names. It should be an icon-only `ghost` button, `destructive` on
  hover, in a `sr-only`-headed actions column, or behind a per-row overflow menu.
- **Status and role are encoded identically.** `Active` and `Registrar` both render as
  primary-blue badges, so two orthogonal dimensions look like one. The `--success` and
  `--warning` tokens are defined in both themes and used essentially nowhere — status
  badges are exactly what they are for.
- **No empty, loading or error state design.** Loading is a bare `Skeleton` rectangle that
  does not resemble the table it replaces; empty is one muted sentence.
- **`tabular-nums` appears once in the entire codebase.** Every column of grades, credits
  and counts should have it, or the digits do not line up.

**Recommendation.** One `DataTable` composition in `shared/ui` wrapping TanStack Table:
column sort, a filter row, `nuqs`-backed URL state, pagination, a skeleton that matches the
column layout, a designed empty state, and a standard right-aligned row-actions menu.
Fourteen widgets collapse onto it.

---

## 4. Empty states are sentences, not designs

Every empty state in the app is `<p className="text-muted-foreground text-sm">` and a
sentence. There are **53** of them.

Seen live: an administrator opening the institution dashboard gets four cards, each
containing one grey line of text — _"You are not enrolled in any course yet."_, _"No result
has been recorded for you yet."_, _"Nothing is scheduled for the rest of this week."_,
_"Nothing falls due in the next two weeks."_ — above 200px of empty page. The first
impression of the product is four greyed-out apologies.

**Recommendation.** An `EmptyState` primitive: muted icon, short title, one line of
explanation, and — the part that is missing entirely — **the action that resolves it**.
"You are not enrolled in any course yet" should carry a _Browse Courses_ button.

**Related:** the dashboard does not adapt to role. An administrator is shown a student
dashboard and it is necessarily empty. The tiles are chosen by permission
(`canReadCourses`, `canReadGrades`, `canReadSchedule`) but the _layout_ assumes a student.
Staff need a different set of tiles, not an empty version of the student's.

---

## 5. Marketing copy contradicts ADR-0024

`/` still reads, in the hero:

> **One academic platform over the systems you already run**
> StudViro reads your student information system and gives students, teachers and
> administrators a single dashboard, calendar and course page — without replacing anything.

And the first section is headed _"Two systems, two logins, two answers"_.

This is the pre-pivot integration positioning. Per ADR-0024, StudViro is a **standalone**
platform — the system of record for an institution's own data. The homepage currently sells
the product that was removed in Phase 0.

**This is a content correctness bug, not a design nit**, and it is the first thing any
visitor reads. Every string lives in `messages/en.json` under `marketing.*`, so it is a
copy pass, not a rebuild. The Slovak file must move in lockstep (English copied verbatim,
per the project's no-translate rule).

While in there: the hero is text-only on a plain background with no product visual, and
`marketing-section` sets a left-aligned column that leaves the right half of a 1440px
viewport empty. A screenshot of the dashboard beside the hero copy would do more than any
amount of type polish.

---

## 6. Forms

The form layer is the most correct part of the app — 47 `autoComplete` attributes across
67 inputs, labels wired through `FormLabel`, inline `FormMessage` errors, `PasswordInput`
with a proper show/hide toggle. Remaining gaps:

- **No sticky save bar.** `grep` for `sticky` across the codebase returns **zero**.
  Institution settings is one continuous card — language, terminology overrides, feature
  flags — and the save button is at the bottom of a long scroll. The action should follow
  the user.
- **No unsaved-changes guard.** No `beforeunload`, no router guard. Navigating away from a
  half-filled settings form loses it silently.
- **Settings has no internal navigation.** It is one long card that should be a `Tabs`
  group or a sectioned two-column layout with a jump list. `tabs.tsx` is vendored and used
  nowhere in the app.
- **Placeholders carry no example.** "Platform default" repeated down the terminology
  column tells the user nothing about what a valid value looks like, and per the interface
  guidelines a placeholder should end in `…` and show the shape of the input.
- **Control heights disagree.** The `Select` trigger and the `Input` sit side by side in
  the settings grid and do not read as the same height or border weight. Worth measuring
  and reconciling at the primitive level.

---

## 7. Accessibility and interface-guideline sweep

Checked against the Vercel Web Interface Guidelines. The codebase passes most of it
outright — skip link present and correctly `sr-only`/`focus-visible`, `:focus-visible`
outline defined globally, `aria-current="page"` on nav, `aria-label` on landmarks, semantic
`<table>`/`<button>`/`<label>` throughout, `prefers-reduced-motion` honoured globally,
`color-scheme` and `theme-color` both set, `Intl` via `useFormatter` with no hardcoded date
or number formats anywhere.

Open items:

| Where                                                                       | Finding                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/ui/button.tsx:8`, `tabs.tsx:67`, `switch.tsx:20`, `progress.tsx:25` | `transition-all` — should list properties explicitly. These are shadcn defaults; the project already deviates from upstream deliberately in `button.tsx`, so narrowing to `transition-[color,box-shadow,transform]` is in keeping. `input.tsx` already does this correctly and is the model. |
| App-wide                                                                    | `aria-live` appears **twice**. Toasts, validation summaries and async row updates need polite regions.                                                                                                                                                                                       |
| App-wide                                                                    | No `touch-action: manipulation` and no deliberate `-webkit-tap-highlight-color`.                                                                                                                                                                                                             |
| `dialog.tsx`, `sheet.tsx`                                                   | No `overscroll-behavior: contain` — scrolling to the end of a modal scrolls the page behind it.                                                                                                                                                                                              |
| `messages/en.json`                                                          | 18 straight apostrophes (`student's`, `institution's`, `university's`) — should be `’`. No `...`→`…` violations found; that part is already clean.                                                                                                                                           |
| App-wide                                                                    | Only 61 responsive prefixes (`sm:` 45, `lg:` 9, `md:` 7) across 303 components. Mobile is largely unaddressed rather than deliberately simple.                                                                                                                                               |
| `app/`                                                                      | One `error.tsx` at the root and **no `loading.tsx` anywhere**. Route transitions have no streaming skeleton, and a failure in any institution screen unmounts the whole app shell instead of just the panel.                                                                                 |

---

## 8. Smaller consistency items

- **No breadcrumbs.** `/institutions/[id]/courses/[offeringId]` and
  `/institutions/[id]/programs/[programId]` are two levels deep with no way back up except
  the browser. The `breadcrumb` primitive is not vendored.
- **`/account` renders 5–6 identical outline buttons per institution row** — _Dashboard,
  My courses, My grades, Manage roles, Settings, Download my data_ — all the same weight.
  The institution name should be the link; the rest belongs in an overflow menu. There is
  no institution logo or avatar, so two institutions are distinguished only by a line of
  text.
- **Shadow usage is nearly flat** — `shadow-xs` ×7 and little else. Cards, popovers and
  dialogs all sit at roughly the same elevation, so overlays do not read as above the page.
  Worth defining two or three deliberate elevation levels as tokens.
- **`rounded-*` is mostly `rounded-md` (21) and `rounded-full` (11)** with scattered `lg`,
  `sm`, `xs`, `xl`, `none`. The `--radius` scale exists; the stragglers should use it.
- **`Avatar`, `Tooltip`, `Popover`, `ScrollArea`, `Checkbox`, `DropdownMenu`, `Dialog`,
  `Sheet`, `Tabs` are all vendored in `shared/ui` but absent from the barrel and unused.**
  Several findings above are solved by adopting components that are already downloaded.
- **`gap-5` (16 uses) is off the 4/8 rhythm** that the other 300 spacing utilities follow.

---

## 9. The logo

There is no logo. `app-header-bar.tsx:33` renders the plain string `Studviro` in
`font-semibold tracking-tight`, and that is the entire brand presence — in the header, in
the footer, and (via `appName`) in every page title. The favicon is the Next.js default.

Note also a **naming inconsistency that is live in production copy**: the header renders
`Studviro`, while the marketing body copy says `StudViro`. Pick one. The recommendation
below assumes **StudViro** — the internal capital is distinctive, it is what the docs and
ADRs use, and it gives the mark something to work with.

### The idea: a "term mark"

The product's core subject is _progression through an academic record_ — terms stacking
into a transcript. The mark is three ascending rounded bars sharing a left edge, with the
tallest carrying a notch — a stack of terms that reads equally as a bar chart, a bookmark,
and a stylised **S**. It is four paths, it survives 16px, it is not another graduation cap,
and it works as a favicon and an app icon without redrawing.

The wordmark sets `StudViro` in Geist at `font-semibold tracking-tight` with the `V`
in `text-primary` — so the brand accent is the same token as every primary action, and a
rebrand stays a change to `globals.css`.

```tsx
// src/shared/ui/logo.tsx
import { cn } from '@/shared/lib';

/**
 * The brand mark. `currentColor` throughout except the accent, which is the
 * primary token — so the logo follows the theme and a rebrand stays a change
 * to `globals.css` rather than an asset swap.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={cn('size-6', className)}>
      <rect x="3" y="14" width="5" height="7" rx="2" fill="currentColor" opacity="0.4" />
      <rect x="9.5" y="9" width="5" height="12" rx="2" fill="currentColor" opacity="0.7" />
      <path
        d="M16 5a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2V5Z"
        fill="var(--primary)"
      />
    </svg>
  );
}

export function Logo({
  variant = 'full',
  className,
}: {
  variant?: 'full' | 'mark';
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      {variant === 'full' ? (
        <span className="text-[1.0625rem] font-semibold tracking-tight">
          Stud<span className="text-primary">V</span>iro
        </span>
      ) : null}
    </span>
  );
}
```

Usage: `variant="full"` in the header and the marketing footer, `variant="mark"` in the
collapsed sidebar rail, and the same SVG exported flat for `icon.svg` / `apple-icon.png`
under `src/app/`. Because it is a single `<svg>` with no raster asset, it needs no
dark-mode variant.

**Two alternates, if the bar stack does not land:**

1. **Monogram tile.** A `rounded-lg` `bg-primary` square holding a white `S` in Geist at
   `font-bold tracking-tighter`. Cheapest to build, strongest at 16px, least distinctive.
2. **The aperture.** A circle of four rounded arcs with a gap at the top-left — "one
   surface, many sources", which is literally the product thesis. More elegant, harder to
   keep legible under 20px.

One caveat, honestly: I am proposing this from the product's positioning, not from a brand
brief. If StudViro is going to be sold to institutions, the mark deserves a real designer
at some point. What is above is a good, buildable, theme-native placeholder that is a large
improvement on a bare string — not a finished identity.

---

## Suggested order of work

Sequenced so each step makes the next cheaper:

1. **Fix the marketing copy** (finding 5) — a content bug on the front door, no code.
2. **`Logo` + `PageShell` + `PageHeader` + `EmptyState`** (findings 2, 4, 9) — four small
   additions to `shared/ui` that everything else composes from.
3. **Rebuild navigation**: sidebar, mobile `Sheet`, avatar menu absorbing the locale and
   theme controls, institution switcher (finding 1). The largest single win.
4. **`DataTable`** with URL state, filtering and pagination (finding 3), then migrate the
   14 table widgets onto it.
5. **Form polish**: sticky save bar, unsaved-changes guard, sectioned settings (finding 6).
6. **The guideline sweep** (finding 7) and the consistency tidy-up (finding 8) — mostly
   mechanical, safe to batch.

Each is independently shippable and each is a vertical slice of the frontend only, so none
of them blocks backend work.
