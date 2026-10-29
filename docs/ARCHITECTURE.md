# Architecture

How Ronda is put together, what it stores, and how to run and ship it. For what the app does and how to use it, see the [README](../README.md); for the look and the tokens, see [DESIGN.md](DESIGN.md).

Ronda is a static Astro site with no backend. Everything the user creates lives in their browser.

## Code layout

```text
src/
  pages/index.astro      Spanish version (/); pages/en/index.astro is the English one
  pages/sw.js.ts         Serves the service worker as /sw.js, stamped with a build version
  components/Home.astro  The whole page; takes the language as a prop
  i18n/messages.ts       All text, es and en (en is typed as `typeof es`, so a missing key fails the build)
  lib/                   Pure logic: no DOM, no storage, no clock of its own
    draw.ts              Parse, validate, shuffle and distribute names into groups
    lists.ts             Saved lists and their people; validates and migrates stored data
    turns.ts             The speaking-time day, absences, finishing a day, the ranking, stored-data validation
    clock.ts             mm:ss formatting (elapsed, and time remaining)
    backup.ts            Backup file format, validation and import rules
  scripts/               Browser code: reads the clock, touches the DOM and storage
    app.ts               Lists, badges, the draw; hands what turns need to turns.ts
    turns.ts             Turns UI, 250 ms tick, tab title, hooks the floating window and the wake lock
    float.ts             Moves the "speaking now" card into a Picture-in-Picture window
    ranking.ts           Podium, table, history, minimum days, reset, share
    share-image.ts       Draws the ranking as a 4:5 PNG on a canvas
    share.ts             System share sheet, copy, file download
    backup.ts            Export and import UI
    storage.ts           Safe reads and writes of localStorage (also migrates the old single list)
    theme.ts, confirm.ts, notify.ts, wakelock.ts, pwa.ts
  sw/worker.js           Service worker source
  styles/global.css      Tokens and styles
tests/                   node:test for everything in src/lib
```

### The split that matters

- **`src/lib` is pure.** Each function takes a state and returns a new one; the current time (`now`) is always passed in. That is why the logic is covered by plain tests (`npm test`) and why a reload cannot corrupt a running day (see below).
- **`src/scripts` is the shell.** It reads the clock, listens to events and writes the DOM (always with `textContent`, never `innerHTML` for user data). The only client-side JavaScript is here; there is no UI framework.
- Code in `src/scripts` that reads storage must not run in Astro frontmatter: `localStorage` does not exist at build time.
- Inside `src/lib`, relative imports carry an explicit `.ts` extension (`./lists.ts`). The tests run the TypeScript natively under Node, which needs it.

## What is stored

Everything is in `localStorage`. Values read back are validated by the same parsers that the backup import uses; a bad value is dropped, not trusted.

| Key | Holds |
|---|---|
| `ronda.lists.v1` | `{ activeId, lists: [{ id, name, people: [{ id, name }], groups, turns }] }`. `turns` is the per-list opt-in flag. |
| `ronda.turns.v1` | `{ [listId]: ListTurns }`, see below. |
| `ronda.theme` | `system`, `light` or `dark`. |
| `ronda.lang` | `es` or `en`, the last language chosen with the switch. Only an explicit choice redirects between `/` and `/en/`. |
| `ronda.preferences.v1` | Legacy single list. Read once and moved into `ronda.lists.v1`. |
| `ronda.timer.v1` | Legacy general timer. Removed on load. |
| `sessionStorage` `ronda.notice` | One message shown after the page reloads following an import. |

Limits: names are trimmed and cut to 40 characters, unique per list ignoring case, at most 200 people per list.

### `ListTurns`

```ts
{
  budgetMs: number,        // the time each person gets; the same for everyone (1 to 60 min, 5 by default)
  minDays: number,         // days needed to appear in the ranking (1 to 99, 1 by default)
  absent: string[],        // person ids not here today
  sessions: Session[],     // finished days: { id, endedAt, budgetMs, entries: [{ personId, name, spokenMs, absent }] }
  current: CurrentSession | null // the day in progress
}
```

- A **running turn stores when it started** (`activeSince`), not a counter, so the time stays right after a reload, a throttled background tab or a sleeping laptop. `spoken` only holds turns that already ended.
- Each entry keeps the **name as it was that day**, so history still reads right after a rename or after removing someone from the list.
- Budgets can only change between days. A day keeps the budget it started with.

## The ranking

Computed by `ranking()` in `src/lib/turns.ts` from the saved days:

1. For each person, add the time they spoke and the budget of every day they were **present**. A day marked absent is skipped, so missing a day neither helps nor hurts.
2. Score = spoken ÷ budget. Going over the budget counts the real time, so the score can pass 100%.
3. Sort ascending: the lowest score (who spoke least, on average) wins. Ties share a position and the next one skips (1, 1, 3).
4. People with fewer days than `minDays` are listed apart as having too little data.
5. People who never attended, or who left the list, are not shown. Their days stay in the history.

Because the score weighs by budget, days with different budgets can be mixed.

## A day of turns

State changes live in `src/lib/turns.ts`:

| Function | Effect |
|---|---|
| `startSession` | Starts the day with a speaking order (the UI shuffles the present people each time). |
| `speak` | Gives the floor and starts the clock. The previous speaker keeps what they used. |
| `handOver` | Gives the floor with the clock **stopped**; the host starts it with another click. Used by Next. |
| `pause`, `setAbsent` | Stop the clock; an absent person cannot get the floor. |
| `nextId` | The next present person who has not spoken yet. |
| `finish` | Saves one entry per person (absent ones flagged), clears the day and today's absences. |

## Backup

`Export` writes one JSON file; `Import` reads it back. Defined in `src/lib/backup.ts`.

```jsonc
{
  "app": "ronda",
  "version": 1,
  "exportedAt": 1761700000000,   // ms since epoch
  "activeId": "…",
  "lists": [ /* SavedList, as stored */ ],
  "turns": { "<listId>": { /* ListTurns without current and absent */ } }
}
```

- The day in progress and today's absences are **not** exported: a backup holds history, not a running clock.
- Import validates with the stored-data parsers. It refuses invalid JSON, a wrong shape, a `version` higher than the app knows, and files over 5 MB.
- It shows what it will do first. Lists with the **same id are replaced** by the file's version, in the same place; the others are **added**; nothing is deleted. Turn data comes from the file where it has some, so a list the file brings without any keeps its own.
- A browser that only has the empty default list gets it replaced instead of keeping a blank list.
- After a successful import the page reloads and shows a notice (via `sessionStorage`).

When the format changes, raise `BACKUP_VERSION` and keep reading the old one.

## The floating timer

`src/scripts/float.ts` uses the Document Picture-in-Picture API.

- **It moves the card, it does not clone it.** `#now` is appended to the new window and put back in its slot when the window closes, so the controller keeps painting the same elements and the Pause and Next buttons keep their listeners.
- The page's `<link>` and `<style>` elements and the `<html>` attributes (theme, language) are copied into the new window.
- While floating, the 250 ms tick is started with the **floating window's** `setInterval`: a hidden tab gets its timers throttled, the floating window does not. The clock itself never depends on the tick (see "What is stored").
- The window opens only from a click, in a secure context (HTTPS or `localhost`), in Chrome or Edge on desktop. It does not exist in Safari or Firefox, and on a plain-HTTP address such as `http://192.168.x.x:4710`. In those cases the Float button is hidden.
- It closes by itself when the day is finished or discarded.

## Offline (PWA)

`src/sw/worker.js` is served as `/sw.js` by `src/pages/sw.js.ts`, which stamps a version into the cache name on every build so the old cache is dropped.

- On install it fetches `/` and `/en/`, reads the `/_astro/…` assets they link and caches all of it.
- Navigations go network first, so a new deploy shows up right away; the cached page is the offline fallback.
- It is registered **only in production builds** (`import.meta.env.PROD`), so in dev a cache never hides your changes.

## Development

Node 22.23.4 or later.

```sh
npm install
npm run dev      # http://localhost:4321
npm start        # dev server on 0.0.0.0:4710, reachable from other devices on the network
npm test         # node --test tests/*.test.mjs
npm run build    # static site in dist/
npm run preview  # serves dist/
```

- Phones and other devices reach `npm start` over plain HTTP, so features that need a secure context (the floating window, the service worker) are not available there. Use `localhost` on the same machine for those.
- Type check: `npx -y -p typescript@5.9.3 tsc --noEmit -p .`. The repo has no lint step.
- `astro.config.mjs` holds the production `site` URL (canonical, hreflang and the share images). Change it if the main domain changes.

## Deploy

The site is plain static output (`dist/`), so any static host works. It is deployed on Vercel at <https://ronda-dusky.vercel.app>: project `ronda`, linked to the repository, redeploying on every push to `main`. That URL is the `site` in `astro.config.mjs`, which feeds the canonical link, the hreflang links and the share image; change it if the domain changes.

There is no deploy configuration file in the repo: pushing to `main` is the deploy. Vercel Authentication is on by default for new projects and asks for a Vercel login; it must be off in the project settings (Deployment Protection) for the site to be public.

## Share and app images

`docs/og.html` and `docs/icon.html` generate the social images and the app icons; the commands are in the README. The ranking image is drawn at runtime by `src/scripts/share-image.ts` (copy, download and, on touch devices, the share sheet live in `src/scripts/share.ts`; the copy passes the still-drawing image to `ClipboardItem` as a promise so the click's permission lasts) and uses the page's own fonts (`--font-heading`, `--font-body`) with a fixed light palette, so it looks the same whatever the theme.
