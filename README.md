# Ronda

Live at <https://ronda.lucianopignotti.workers.dev>.

Paste a list, choose how many groups you want and draw. With one group you get a random order; with two or more, groups as even as possible (10 people in 3 groups gives 4, 3 and 3).

Use it to set speaking turns in a meeting, make teams in a class, pair people up or hand out tasks. It is mobile first, has no backend and sends your data nowhere.

## Features

- One participant per line, with a live count. Empty lines and extra spaces are ignored; repeated names are allowed.
- Numbered order (1 group) or one card per group with its member count.
- **Draw again** and **Share** (the system share sheet, or copy to the clipboard).
- Several named lists, shown as tabs: create, switch, rename and delete them. Each keeps its own participants and number of groups. Everything is saved in the browser (`localStorage`) and restored on return. **Clear list** empties the current one.
- System, Light or Dark theme from the menu at the top right; it is remembered.
- Spanish (`/`) and English (`/en/`) with an ES/EN switch next to the theme menu. The choice is remembered; it starts in Spanish by default.
- Accessible: visible labels, keyboard support, visible focus, screen reader announcements and `prefers-reduced-motion` support.

## Development

Requires Node 22.23.4 or later.

```sh
npm install
npm run dev      # server at http://localhost:4321
npm run build    # static site in dist/
npm run preview  # serves dist/
npm test         # tests for the draw and lists logic
```

## Structure

```text
src/
  pages/index.astro      Spanish version (/); pages/en/index.astro is the English one
  components/Home.astro  The page, takes the language as a prop
  i18n/messages.ts       All text in es and en
  lib/draw.ts            Draw logic, no DOM (parse, validate, shuffle, distribute)
  lib/lists.ts           Saved-lists logic, no DOM (add, rename, remove, validate stored data)
  scripts/
    app.ts               Events and UI updates
    storage.ts           Safe reading and writing of localStorage (migrates the old single list)
    share.ts             Share or copy
    theme.ts             Theme menu and its persistence
  styles/global.css      Color, spacing and type tokens, and styles
tests/                   Tests with node:test (draw and lists)
docs/                    Design mocks (proposals, palettes, fonts, share images)
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

## Privacy and limits

- Your lists stay only in your browser and device. It is not synced, and it is lost if you clear the site's data or use private browsing. Do not store sensitive information in it.
- The result is not saved: when you reopen the app you get your list back and draw again.
- Shuffling uses `Math.random()` (Fisher–Yates). It is fine for casual draws; it is not suitable for prizes or fairness audits.
