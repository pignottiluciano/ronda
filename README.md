# Ronda

Live at <https://ronda.lucianopignotti.workers.dev>.

Paste a list, choose how many groups you want and draw. With one group you get a random order; with two or more, groups as even as possible (10 people in 3 groups gives 4, 3 and 3).

Use it to set speaking turns in a meeting, make teams in a class, pair people up or hand out tasks. It is mobile first, has no backend and sends your data nowhere.

## Features

- Participants are badges: type a name and press Enter, paste several lines to add them at once, tap a name to edit it, press × (or Backspace twice in the empty field) to remove one. A name can only appear once per list (case-insensitive), with a limit of 200 people and a live count. Each person has a stable id, so renaming keeps their identity.
- Numbered order (1 group) or one card per group with its member count.
- **Draw again** and **Share** (the system share sheet, or copy to the clipboard).
- Several named lists, shown as tabs: create, switch, rename and delete them. Each keeps its own participants and number of groups. Everything is saved in the browser (`localStorage`) and restored on return. **Clear list** empties the current one.
- Optional **turns** per list (switch it on with the clock button next to rename): everyone gets the same time (presets of 2 to 15 minutes, or 1 to 60), one person speaks at a time, and the clock counts up in silence. Tap a person to give them the floor, or use Next (it follows the draw order if you drew one). Mark someone as not here and they stay out of the draw and the turns. Going over the time is shown as `+mm:ss`, never cut off. The screen stays awake while someone speaks, a reload keeps the clock right, and the tab title shows who is speaking. Finish the day to save it in the list. It cannot alert you if the app is closed or the phone is locked, because there is no backend to push from.
- System, Light or Dark theme from the menu at the top right; it is remembered.
- Spanish (`/`) and English (`/en/`) with an ES/EN switch next to the theme menu. The choice is remembered; it starts in Spanish by default.
- Installable (PWA) and works offline: a small service worker caches the app after the first visit. It is only registered in production builds.
- Accessible: visible labels, keyboard support, visible focus, screen reader announcements and `prefers-reduced-motion` support.

## Development

Requires Node 22.23.4 or later.

```sh
npm install
npm run dev      # server at http://localhost:4321
npm run build    # static site in dist/
npm run preview  # serves dist/
npm test         # tests for the draw, lists, turns and clock logic
```

## Structure

```text
src/
  pages/index.astro      Spanish version (/); pages/en/index.astro is the English one
  components/Home.astro  The page, takes the language as a prop
  i18n/messages.ts       All text in es and en
  lib/draw.ts            Draw logic, no DOM (parse, validate, shuffle, distribute)
  lib/turns.ts           Turns logic, no DOM (start, speak, pause, absences, finish, validate stored data)
  lib/clock.ts           mm:ss formatting
  lib/lists.ts           Saved-lists logic, no DOM (lists, people with ids, validate and migrate stored data)
  sw/worker.js           Service worker source; pages/sw.js.ts serves it as /sw.js with a build version
  scripts/
    app.ts               Events and UI updates
    storage.ts           Safe reading and writing of localStorage (migrates the old single list)
    share.ts             Share or copy
    theme.ts             Theme menu and its persistence
    turns.ts             Turns UI, tick, tab title
    wakelock.ts          Screen wake lock while someone speaks
  styles/global.css      Color, spacing and type tokens, and styles
tests/                   Tests with node:test (draw, lists, turns and clock)
docs/                    DESIGN.md (design decisions and tokens) and design mocks (proposals, palettes, fonts, share images)
```

The draw logic touches neither the DOM nor storage, so it can be tested on its own. The only client-side JavaScript is in `src/scripts/`, with no UI framework.

## Design decisions

- **Look:** the "Sereno" proposal (bordered surfaces, no shadows) with the "Tinta y coral" palette: warm, nearly grey neutrals and color only in the accent.
- **Type:** Fraunces for titles and group names, Figtree for everything else. They are downloaded at build time and served from the site itself (Astro's fonts API), with no requests to Google.
- **Color:** every token has a light and a dark value through `light-dark()`.

## Share image

`public/og-es.png` and `public/og-en.png` (1200×630) are generated from `docs/og.html`. To regenerate them with Chrome:

```sh
for l in es en; do "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=8000 --screenshot=public/og-$l.png "file://$PWD/docs/og.html?lang=$l"; done
```

## App icons

`public/icon-192.png`, `icon-512.png` and `apple-touch-icon.png` come from `docs/icon.html`. To regenerate them with Chrome:

```sh
C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for spec in icon-192:192 icon-512:512 apple-touch-icon:180; do "$C" --headless=new --hide-scrollbars --force-device-scale-factor=1 --window-size=${spec##*:},${spec##*:} --screenshot=public/${spec%%:*}.png "file://$PWD/docs/icon.html"; done
```

## Privacy and limits

- Your lists stay only in your browser and device. It is not synced, and it is lost if you clear the site's data or use private browsing. Do not store sensitive information in it.
- The result is not saved: when you reopen the app you get your list back and draw again.
- Shuffling uses `Math.random()` (Fisher–Yates). It is fine for casual draws; it is not suitable for prizes or fairness audits.
