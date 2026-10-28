# Design - Ronda

Source of truth for tokens is `src/styles/global.css`. This file records the decisions behind them and
the rules for the turns and ranking feature. Mocks: `docs/turnos.html` (proposals A, B, C; chosen: A with B's turns and podium).

## Direction
Utility app for groups, mobile first, used live in meetings and classes. Calm editorial: warm near-neutral
paper and charcoal, bordered surfaces without shadows, Fraunces for names and titles, Figtree for the rest,
one coral accent.
Dials: density 5, variance 3, motion 3. Mostly a tool people glance at while talking, so it stays predictable
and quiet; motion only confirms state changes (who is speaking, time over, saved).

## Principles
- **One accent, used for state.** Coral marks "now" (active speaker, active mode, primary action, filled ring). Never decoration.
- **Numbers carry the meaning.** Every ring, bar and podium step has the value as text next to it; the graphic is secondary.
- **Opt-in complexity.** Turns, ranking and history appear only on lists where the user turned them on. A list without turns looks exactly like today's.
- **Neutral about who "wins".** The ranking says "speaks less"; no medals, trophies or shaming. Overtime is shown, not punished.
- **Phone on a table.** The speaker's clock is readable from a distance (at least 3rem on mobile) and every control is at least 44px. Exception: the parts of a person badge are 32px high (they sit in a wrapping box); the x, which deletes, keeps a 44px hit area through a pseudo-element, and the name button only edits (reversible).

## Color
Existing roles, unchanged. Contrast measured in OKLCH to sRGB with WCAG 2.x (light / dark):

| Role | Use | Contrast |
| --- | --- | --- |
| `--ink` on `--bg` / `--surface` | body text | 15.4 / 16.0 and 16.3 / 14.4 |
| `--muted` on `--bg` / `--surface` / `--accent-soft` | secondary text | 5.6 / 8.0, 6.0 / 7.2, 5.0 / 5.6 |
| `--accent-ink` on `--surface` / `--accent-soft` | accent text, active labels | 5.6 / 7.4, 4.7 / 5.7 |
| `--on-accent` on `--accent` | primary button text | 5.1 / 7.5 |
| `--danger` on `--bg` / `--surface` | errors, overtime text | 7.6 / 8.2, 8.1 / 7.4 |
| `--accent` vs `--surface` / `--accent-soft` | filled ring and bar (non-text, 3:1) | 5.2 / 6.9, 4.3 / 5.3 |

New token:

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| `--control` | oklch(0.62 0.02 50) | oklch(0.55 0.015 55) | border of editable controls (tag box, inputs, steppers): 3.4:1+ on `--bg` and `--surface` in both themes |

Known gap, not part of this feature: the existing `.names` and `.stepper` borders use `--line` (1.4:1). Move them to
`--control` when touching them; the new tag box uses `--control` from the start.

Ring track and bar track use `--line` (decorative, 1.4:1) because the time is always printed as text.
Overtime uses `--danger` for text and the ring turns full with a `+m:ss` label, never color alone.

## Typography
Families: Fraunces (names, titles, podium numbers), Figtree (everything else). Scale ratio 1.2 (`--t-xs` to `--t-xl`).
New sizes use existing tokens plus two display sizes, both with `font-variant-numeric: tabular-nums` so clocks do not jitter:

| Use | Size | Weight |
| --- | --- | --- |
| Speaker clock, active card | `clamp(3rem, 14vw, 4rem)` | 700 |
| Tile clock inside a ring | `--t-sm` | 700 |
| Podium score | `--t-xl`, Fraunces | 600 |
| Table numbers | `--t-sm` | 400, 700 for the first row |

## Space, shape, elevation
Spacing scale 4, 8, 12, 16, 24, 32, 48, 64 (existing). Radius: `--radius` 16 for cards and tiles, `--radius-sm` 10 for
controls, 999px for person badges and mode pills (nested elements use the smaller radius). No shadows; elevation is
border plus `--surface` over `--bg`. Container 1120px. Desktop layout is two columns (list left, active mode right).

## Motion
Durations: fast 150ms, base 250ms. Easing `--ease-out`. Motion is used for: a badge entering and leaving, the active
tile border, ring progress (updates per tick, no CSS transition), the podium steps on first show.
Reduced motion: no entrance or step animation; changes are instant. The ring and bar keep updating because they carry data.
No sound anywhere.

## Components
**Person badge (tag box).** A bordered box (`--control`, accent border and `--accent-soft` outline on focus-within) holding a
list of badges followed by the input. Badge: 32px pill, `--accent-soft` fill, name button plus a 28px x button.
States: default; selected (second step of Backspace, accent outline); absent today (dashed border, struck-through,
only on lists with turns); editing (the name becomes an input in place). Name button edits, x removes.
Enter adds, pasted lines add one badge each, duplicates and empty names are rejected with a hint, never silently.
Labels: x is "Remove Ana"; the live region announces "Ana added" and "Ana removed".

**Mode control.** Segmented control with three options (Draw, Turns, Ranking) built from native radio inputs, so
keyboard and screen reader behavior is free. Shown only on lists with turns on; otherwise the list shows today's draw
form with no control. The switch "Use turns" lives in the list tools next to rename and delete.

**Turn tile.** Card with a conic-gradient ring (76px, 62px inner), clock text inside, name below, state label
("Done", "Speaking", "Next", "Waiting", "Absent", "Over time"). Tapping gives the floor to that person and pauses the previous one.
Active tile: `--accent` border and `--accent-soft` fill. Absent: dashed border, no fill. Over time: ring full, label `+m:ss`.
The tile is a `<button>`; the ring is `aria-hidden`; the active one has `aria-current="true"`.
Controls under the grid: "Not here" (marks the current or selected person absent), Pause, Next (primary, names who is next), Finish.

**Podium.** The three lowest averages, lowest in the middle and tallest, Fraunces percentages inside the steps; fewer than
three people shows only those. Below it, the ranking table: position, name, bar plus percent, days present.
People under the minimum days appear after the table under "Not enough data". Ties share a position.

**Ranking table.** Columns: position, person, average (bar plus text), days. Row of the first place in bold. Absent-only people are not ranked.

**Share image.** 1080x1350 (4:5) PNG made on a canvas: list name and date, podium, up to 10 table rows ("and N more"),
Ronda mark at the bottom. Uses the light palette always (it leaves the app), Fraunces and Figtree, text at least 28px.

## Layout and responsive
Breakpoint 900px (existing). Below it everything stacks; the mode control sits under the list title and the badge box is
full width. From 900px the list column is `minmax(320px, 400px)` and the right column shows the selected mode; Ranking
replaces Turns in that column rather than adding a third one. Tiles are two per row on phones and four per row on desktop.
Verify at 375, 768 and 1280px: no horizontal scroll, 44px targets.

## Content
Voice: plain, direct, Spanish first (`es`) with `en` parity in `src/i18n/messages.ts`. Sentence case, specific verbs
("Give the floor", "Finish and save the day"). Mock data in `docs/turnos.html` is labelled as example. No invented metrics.

## Generic-tells review
- Podium: kept because it makes the score scannable and is the base of the share image; there are no medals or confetti.
- Rings: kept because time left per person is the core data; each has its number printed.
- Pills and chips: kept because badges are the interaction (add, remove, edit); radius follows the 999px pill rule only for badges and mode pills.
- Dark stage with a giant clock (proposal C): dropped. It inverted theme per screen and broke the "one theme per page" rule.
- No gradients, glass, blobs, shadows, icon rows or centered marketing copy.

## Don't
- Don't rank by raw total time: it rewards attending. The score is the average share of the budget over days present.
- Don't use color alone for state (overtime, absent, speaking): pair it with text.
- Don't show turns UI on lists that did not opt in.
- Don't add sound or notifications: the app has no backend and the timer is silent by decision.
