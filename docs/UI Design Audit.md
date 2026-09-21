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

---

# Second pass — 2026-09-21

The first pass above was written on 2026-09-19 and read the surface as an interface-
guidelines and information-architecture problem. This pass re-reads the same surface
through Apple's interaction-design lens — response, motion behaviour, materials, optical
typography — and records what has shipped since.

Same method: static read of all of `frontend/src`, both themes, plus the token layer.
Counts below are live as of this date.

## What the first pass asked for and now exists

| Finding                         | State                                                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9 — the logo                    | **Done.** `shared/ui/logo.tsx` exists and the header renders it.                                                                                     |
| 1 — avatar menu                 | **Done.** `app-header/ui/account-menu.tsx` carries account, theme, locale and sign-out behind one trigger. The five always-visible buttons are gone. |
| 1 — mobile drawer               | **Done.** `app-header/ui/mobile-menu.tsx` uses the `Sheet`. The header no longer wraps.                                                              |
| 5 — marketing copy              | **Done.** `messages/*.json` carries the post-ADR-0024 standalone positioning.                                                                        |
| 4 — the `ListingCard` precedent | **Extended.** Still the only composition above the primitives, and still the right model for the rest.                                               |

## Still open from the first pass

Verified, with current numbers:

- **Navigation is still 17 flat wrapping pills.** `institution-nav.tsx:115` is
  `flex-wrap` and nothing else. No sidebar, no grouping, no icons, no `⌘K`.
- **No `PageShell` / `PageHeader`.** `mx-auto flex w-full max-w-6xl flex-1 flex-col
gap-8 px-6 py-12` is copy-pasted 10 times, the `max-w-5xl` variant 7 times, and
  `max-w-3xl` / `max-w-4xl` / `max-w-lg` once each — five content widths with no written
  rule for which applies when.
- **No `EmptyState`.** 32 instances of `<p className="text-muted-foreground text-sm">`
  holding one sentence.
- **No `DataTable`, no URL state.** `nuqs` and `useSearchParams` still return zero hits.
- **No breadcrumbs, no `loading.tsx`** (zero files), **no sticky save bar** (the only
  `sticky` in the codebase is the header), **`tabular-nums` still used once**,
  **`touch-action` still zero**, **`transition-all` still in 4 primitives**.
- **`Tabs` is still vendored and used nowhere** in `widgets/` or `views/`.

---

## A1. Nothing responds to being pressed

`active:` appears **twice** in 300+ components; `hover:` appears **33** times. Every
button, nav pill and card in the product acknowledges the pointer only on hover and
commits on release. On a touch device — where there is no hover — the first feedback a
person gets is the screen changing.

This is the foundation everything else sits on: the moment a press has no immediate
answer, directness is gone, and no amount of transition polish recovers it.

**Fix.** A press state on `buttonVariants`, the nav pill and `ListingCard`'s action —
`active:scale-[0.98]` with a ~100ms ease-out — plus `touch-action: manipulation` in the
base layer to drop the 300ms tap delay, and a deliberate `-webkit-tap-highlight-color`
instead of the browser's grey flash. Three lines in `globals.css` and one in
`button.tsx`.

## A2. Motion is scripted by duration, and the two directions disagree

`sheet.tsx:57` opens in **500ms** and closes in **300ms**, along the same path. A
reversible transition should be mirrored: the return is the outbound path played back, or
the panel feels like two different objects. 500ms is also slow for chrome the user opened
deliberately — Apple's drawer response is ~0.3s.

Nothing in the app is interruptible. Every transition is a CSS keyframe from
`tw-animate-css`, so a sheet grabbed mid-open finishes opening before it will close, and
there is no gesture-driven anything.

**Fix.** Match the two durations at ~300ms and mirror the curve. Do **not** add a spring
library for this — a dense administrative tool does not earn a physics engine. The one
place it would earn it is a mobile bottom sheet with drag-to-dismiss, and that does not
exist yet; if it is ever built, build it with velocity handoff and momentum projection
rather than a threshold on release position.

## A3. Overlays mostly do come from somewhere — one exception

Corrected on re-check. `popover`, `dropdown-menu` and `tooltip` already set
`origin-(--radix-*-content-transform-origin)`, so they scale from the control
that opened them. `Select` is a native `<select>`, not a popper, so it has no
origin to set.

That leaves `dialog.tsx`, which scales in from `zoom-in-95` about the viewport
centre — correct for a modal, which is not anchored to anything. **No change
needed.** Recorded here so the next pass does not re-open it.

## A4. Reduced motion is a kill switch, not a gentler equivalent

`globals.css` collapses **every** transition and animation on every element and
pseudo-element to `0.01ms`. That is the common recipe and it overshoots: reduced motion
means no vestibular triggers — slides, parallax, spring overshoot — not _no feedback_.
Opacity and colour changes aid comprehension and should survive, shortened.

As written, a person with the OS setting on gets toasts that teleport into place, hover
states that snap, and a sheet that appears without any indication it came from the edge.

**Fix.** Keep the blanket rule for `transform`-driven motion, and carve out a short
cross-fade for `opacity` and colour:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  /* Comprehension survives; vestibular motion does not. */
  [data-slot='dialog-content'],
  [data-slot='sheet-content'],
  [data-slot='popover-content'],
  [data-slot='dropdown-menu-content'] {
    transition: opacity 150ms ease !important;
    transform: none !important;
  }
}
```

## A5. Two other user preferences are unhandled

`prefers-reduced-transparency` and `prefers-contrast` return **zero** hits. The app has
exactly one translucent surface — the sticky header at `bg-background/80 backdrop-blur-md`
— and it is the surface that is always on screen. For a user who has asked the OS to
reduce transparency, it should go solid and drop the blur; for `prefers-contrast: more`,
every surface should go near-solid with a defined border. Six lines in `globals.css`.

## A6. The chrome is two competing layers

The header is translucent, blurred and sticky. `institution-nav`, directly beneath it, is
**opaque, hard-bordered and not sticky**. Scrolling an institution screen therefore slides
an opaque bar with a 1px rule up underneath a floating glass bar — two horizontal rules,
one of which is leaving, and no sense of a single piece of chrome.

Apple's version of this is one material layer with content passing under it, and a **scroll
edge effect** — a short blur/gradient fade where content meets the floating chrome —
instead of a hard divider. The codebase already knows this technique: `scroll-affordance-x`
does exactly it, horizontally, for tables.

**Fix.** Either make the nav part of the same sticky translucent layer and delete one of
the two borders, or make the header opaque and accept a conventional bar. The current
combination is the one option that reads as an accident. Replace the header's `border-b`
with an edge fade once they are a single layer.

## A7. Elevation is not a scale, and the dialog is painted with the wrong surface

Shadows across the primitives: `Card` `shadow-sm`, `Select` `shadow-xs`, `Popover`
`shadow-md`, `DropdownMenu` `shadow-md`/`shadow-lg` (two different values in one file),
`Dialog` and `Sheet` `shadow-lg`. Roughly the right ordering, arrived at by accident —
these are shadcn's defaults, none of them is written down as a rule, and the dropdown
contradicts itself.

A real defect underneath it: **`Dialog` and `Sheet` use `bg-background`, while `Popover`,
`DropdownMenu` and `Select` use `bg-popover`.** In light mode both are white and nobody
notices. In dark mode `--background` is `oklch(0.15 …)` and `--popover`/`--card` are
`oklch(0.19 …)` — so a dialog opens **darker than the cards it is floating above**. A
surface above the page is painted with the page's recessed colour. Every other overlay in
the app gets this right.

**Fix.** Switch `dialog.tsx` and `sheet.tsx` to `bg-popover text-popover-foreground`, and
write the three elevation levels down as a comment in `globals.css` so the next primitive
picks from a list: chrome/inset `shadow-xs`, resting surface `shadow-sm`, floating surface
`shadow-md`, modal `shadow-lg`.

## A8. One tracking value for every size

`tracking-tight` appears **30** times and is applied identically to the `text-3xl` page
titles and to the `text-6xl` marketing hero. Tracking is size-specific: the same optical
spacing that reads correctly at 30px reads loose at 60px and cramped at 20px. The auth
titles (`text-2xl font-semibold`, four pages) carry **no** tracking at all, so a sign-in
page title and an app page title are two different styles.

Leading is similarly ad hoc — `leading-none` ×4, `leading-tight` ×4, `leading-relaxed` ×1,
nothing systematic, and none of it tied to size.

**Fix.** Four rules, expressed as utilities in `globals.css` and applied by the
`PageHeader` component from the first pass rather than hand-written per page:

| Role                      | Size           | Tracking  | Leading |
| ------------------------- | -------------- | --------- | ------- |
| Marketing display         | `text-5xl/6xl` | `-0.03em` | `1.05`  |
| Page title                | `text-3xl/4xl` | `-0.02em` | `1.1`   |
| Section / card title      | `text-lg/2xl`  | `-0.01em` | `1.25`  |
| Body, labels, table cells | `text-sm/base` | `0`       | `1.5`   |
| Uppercase eyebrow         | `text-xs`      | `+0.06em` | `1.4`   |

The eyebrow already uses `tracking-wide`, which is the right instinct against an arbitrary
value. Bring the auth pages onto the page-title row so there is one page title in the
product.

## A9. Error and empty look the same, and neither offers a way out

Two problems, opposite directions:

- **Within a widget, different conditions look identical.** `offering-roster.tsx:47,49`
  renders a failed query and an empty roster as the same
  `<p className="text-muted-foreground">`. The user cannot tell "there are no students" from
  "we could not find out".
- **Across widgets, the same condition looks different.** `my-courses.tsx:22` renders a
  failed query as a destructive `Alert` with a title; `offering-roster` renders it as a grey
  sentence. Fourteen widgets, several presentations.

And no failed query anywhere in the app offers **Try again**. Apple's four kinds of feedback
— status, completion, warning, error — have to be distinguishable, and an error has to
carry its recovery.

**Fix.** Two compositions beside `EmptyState`: a `QueryError` with a title, a plain
explanation and a retry wired to `refetch()`, and an `EmptyState` with a muted icon, a
title, one line, and the action that resolves it — "You are not enrolled in any course yet"
carrying **Browse courses**. Then a single `<QueryPanel query={…}>` that picks between
skeleton, error, empty and content, so the choice is made once instead of in 14 widgets.

## A10. Loading shifts the layout, and one screen does it eleven times

Eight distinct hard-coded skeleton heights — `h-96`, `h-64` ×9, `h-48`, `h-32`, `h-24`
×17, `h-20` ×6, `h-16` ×7, `h-9` — none of them derived from the content they stand in
for. A `h-24` placeholder resolving into a six-row table jumps the page.

Worse on `/institutions/[id]/courses/[offeringId]`: for a teacher,
`course-offering.tsx` mounts **eleven** panels, each with its own query and its own
skeleton, each resolving at its own moment. The page reflows repeatedly for a second or
two after it looks ready.

**Fix.** Skeletons shaped like their content — a table skeleton that draws the right
number of column bars, a card skeleton that matches the card. Then split the offering page
(see A13), which removes ten of the eleven simultaneous queries.

## A11. The status colours are defined and never used

`--success` and `--warning` are defined in both themes, mapped through `@theme inline`,
documented in the file header as the project's only additions to shadcn's vocabulary — and
used in **zero** components. `Badge` has no `success` or `warning` variant, so every state
in the product renders as `secondary` grey, `outline`, or `default` primary blue. On the
people table that means `Active` (a status) and `Registrar` (a role) are the same blue,
which makes two orthogonal dimensions look like one.

**Fix.** Two variants on `badgeVariants`, then a pass over the status badges. The token
work is already done.

## A12. Focus has three treatments, and three places paint two at once

- `globals.css` sets an unscoped `:focus-visible { outline: 2px solid var(--ring) }` in
  `@layer base`.
- 11 shadcn primitives use `focus-visible:ring-[3px] ring-ring/50` with `outline-none`.
- 5 hand-written elements use `focus-visible:ring-2 ring-offset-2`.

Three of those five omit `outline-none`, so the base outline and the ring both paint:
the brand link (`app-header-bar.tsx:40`), the mobile menu links (`mobile-menu.tsx:48`) and
the skip link (`layout.tsx:104`). A double focus indicator on the first three things a
keyboard user touches.

**Fix.** Make the shadcn ring the house style, keep the base `:focus-visible` outline as
the fallback for elements that are not primitives, and bring the five hand-written cases
onto the ring.

## A13. The course offering page is eleven panels deep

A teacher opening a course gets header, staff, enrolment, roster, study groups, timetable,
exam terms, grade entry, learning materials, results and assessments — stacked vertically,
each in a `Card`, each equally weighted. There is no way to get to assessments except to
scroll past six panels that are not what they came for, and no way to link a colleague to
the roster.

This is the screen `Tabs` was vendored for. Sectioning it into _Overview · People ·
Schedule · Materials · Assessment_ with the active tab in the URL fixes wayfinding,
deep-linking and A10's eleven-query reflow in one change.

---

## Suggested order for this pass

Sequenced cheapest-first, because several of these are token-layer one-liners that make
the rest visibly better before any refactor lands:

1. **Token and primitive fixes** — A7 dialog surface, A11 badge variants, A12 focus,
   A3 transform-origin, A2 sheet durations. All small, all in `shared/ui` and
   `globals.css`, all independently shippable.
2. **The three accessibility media queries** — A4 reduced motion, A5 reduced
   transparency and contrast. `globals.css` only.
3. **Press feedback** — A1. One utility, one variant, applied at the primitive level.
4. **The typography scale** — A8, written down in `globals.css` and applied by
   `PageHeader` when it lands.
5. **`PageShell` / `PageHeader` / `EmptyState` / `QueryError` / `QueryPanel`** — the
   first pass's finding 2 and 4, plus A9 and A10. This is the layer whose absence causes
   most of what both passes found.
6. **Chrome as one layer** — A6, which is best done together with the sidebar rebuild
   the first pass called for rather than twice.
7. **Tabs on the offering page** — A13, then the same treatment for institution settings.

## What to keep

Worth saying plainly, because an audit is a list of complaints by construction: the token
layer, the a11y discipline, the deliberate deviations from upstream shadcn (typed buttons,
heading-level props on `CardTitle`, the captioned scrollable `Table`) and the
`scroll-affordance-x` utility are all better than the norm. Everything above assumes that
foundation and builds on it.

---

# Implementation — 2026-09-21

Everything below was built and verified in the same session as the second pass.
`pnpm verify` green in the frontend: typecheck, lint, format, i18n, 749 unit tests,
no cycles, no dead code, build, and `pnpm size` at **545.7 kB against the 555 kB
ceiling — down from 552.05 kB**, because 23 hand-rolled empty states and 14
hand-rolled error alerts collapsed onto three shared components.

## Token layer — `globals.css`

- **Elevation written down.** Four levels as a comment in the file, so the next
  primitive picks from a list: `shadow-xs` inset chrome, `shadow-sm` resting
  surface, `shadow-md` small floating surface, `shadow-lg` modal.
- **A typography scale that varies with size.** Four utilities — `type-display`,
  `type-title`, `type-section`, `type-eyebrow` — each carrying its own tracking
  and leading, replacing one `tracking-tight` applied at every size.
- **`touch-action: manipulation`** and a deliberate tap-highlight on every
  interactive element, deleting the browser's 300ms double-tap wait.
- **Reduced motion is no longer a kill switch.** The blanket rule stays for
  transform-driven motion; overlays keep a 150ms opacity cross-fade, so a toast
  no longer teleports.
- **`prefers-reduced-transparency` and `prefers-contrast: more`** answered, via a
  `data-translucent` attribute on the chrome and a contrast-raised border and
  muted-foreground.
- **`chrome-edge`**, a scroll-edge fade replacing the hard 1px rule under the
  floating chrome — the vertical counterpart of `scroll-affordance-x`.

## Primitives

| Change                                                                                                                         | Where                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Press feedback: `active:scale-[0.98]` over 100ms, `link` variant exempt                                                        | `button.tsx`, `institution-nav`                                                  |
| `transition-all` narrowed to the properties that change                                                                        | `button`, `switch`, `tabs`, `progress`                                           |
| `success` / `warning` variants, reaching the two tokens defined and never used                                                 | `badge.tsx`                                                                      |
| Floating surfaces repainted `bg-popover` — they were `bg-background`, i.e. **darker than the cards they covered in dark mode** | `dialog.tsx`, `sheet.tsx`                                                        |
| Symmetric 300ms in both directions, was 500 open / 300 close                                                                   | `sheet.tsx`                                                                      |
| `tabular-nums` on the table itself, so no numeric column can forget it                                                         | `table.tsx`                                                                      |
| One focus treatment; three elements painted the base outline _and_ a ring                                                      | `app-header-bar`, `mobile-menu`, `layout`, `institution-nav`, `grade-entry-cell` |

## New compositions — the missing layer between primitives and pages

- **`PageShell` / `PageHeader`** — the `main` landmark, four _named_ content
  widths (`form` · `prose` · `detail` · `index`) replacing five ad-hoc `max-w-*`
  values, and the page title on the type scale. **21 views migrated.**
- **`EmptyState`** — icon, title, explanation and the action that resolves it.
  **23 grey sentences replaced**, plus the four dashboard tiles.
- **`QueryError`** — a failed query told apart from an empty one, carrying
  **Try again** wired to `refetch`. **14 sites**, 13 with a live retry.
- **`TableSkeleton` / `ListSkeleton`** — placeholders shaped like the content
  they stand in for, replacing eight arbitrary heights across 34 sites.

## Screens

- **The chrome is one layer.** The institution nav is now sticky at `top-14`
  with the header's material and no border of its own; the stack ends in a
  `chrome-edge` fade. Verified in a real browser: header `sticky`/`blur(12px)`,
  nav `sticky top:56px`/`blur(12px)`, nav border `0px`.
- **The course offering page is sectioned.** Eleven stacked panels became five
  tabs — _Overview · People · Schedule · Materials · Assessment_ — with the open
  section in the query string, so the roster is linkable. Verified: clicking
  _Assessment_ writes `?section=work`; loading `?section=people` opens People.
  `Tabs` was vendored and unused; it is now adopted and exported.
- **Status stopped competing with role.** `active` → `success`, `requested` and
  `provisioning` → `warning`, and role badges dropped from primary blue to
  `outline`, so a state and a fact are no longer the same colour on 164 rows.
- **The duplicated page heading is gone.** `/people` and `/org-units` rendered
  the title and its sentence twice — once in the view header, once in the card
  below it. The card headers were removed.
- **One brand spelling.** `Studviro` → `StudViro` in `common.appName` and
  `account.source.platform`, in both catalogues.

## Deliberately not done

- **No spring library.** A dense administrative tool does not earn a physics
  engine. The place that would earn it — a mobile bottom sheet with
  drag-to-dismiss — does not exist yet; §A2 records how to build it if it does.
- **The sidebar rebuild** (first pass, finding 1). The nav is still 17 flat
  wrapping pills; it is a larger change than this pass and wants doing once,
  together with the chrome work rather than twice.
- **`DataTable`, URL state elsewhere, breadcrumbs, `loading.tsx`, the sticky save
  bar.** Unchanged and still open.

## Follow-on — the directory load-more

The people endpoint gained keyset pagination in a parallel step the same day,
which left `/people` showing a truncated directory with no way to ask for more.
Added rather than deferred, because it is a visible regression on a screen this
pass had just restyled:

- **`LoadMore`** in `shared/ui`, beside `TableSkeleton`. It says what has
  arrived — `164 shown` — rather than inventing `100 of 164`, because a cursor
  genuinely does not know the total. The count stays after the last page, since
  a list that simply stops reads as truncated.
- The count is `aria-live="off"` until the reader presses the button and
  `polite` afterwards. Live from first paint it announces a number nobody asked
  for; live after a press it is the answer to what they just did.
- `person-directory-table` moved to `useInfiniteQuery` over
  `personQueries.infinite`, with the page size set at the call site: the
  endpoint defaults to 20, which is eight presses for 164 people, and 100 is the
  server ceiling. Fifty is about two screens.

Verified in a browser against the seed: 50 → 100 → 150 → 164, and the button
removes itself on the last page.

**Still the wrong shape, and now STATUS's next task:** `audit-trail` labels
actor ids by walking the whole directory. That is correct today and gets worse
with the institution; it wants an endpoint that resolves the ids on screen,
after which the `listForInstitution` wrapper exists for nobody.
