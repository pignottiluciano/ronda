# Ronda

Live at <https://ronda-dusky.vercel.app>.

Paste a list, choose how many groups you want and draw. With one group you get a random order; with two or more, groups as even as possible (10 people in 3 groups gives 4, 3 and 3).

Use it to set speaking turns in a meeting, make teams in a class, pair people up or hand out tasks. It is mobile first, has no backend and sends your data nowhere.

## Features

- Participants are badges: type a name and press Enter, paste several lines to add them at once, tap a name to edit it, press × (or Backspace twice in the empty field) to remove one. A name can only appear once per list (case-insensitive), with a limit of 200 people and a live count. Each person has a stable id, so renaming keeps their identity.
- Numbered order (1 group) or one card per group with its member count.
- **Draw again** and **Share** (the system share sheet, or copy to the clipboard).
- Several named lists, shown as tabs: create, switch, rename and delete them. Each keeps its own participants and number of groups. Everything is saved in the browser (`localStorage`) and restored on return. **Clear list** empties the current one.
- Optional **turns** per list (switch it on with the clock button next to rename). The list then opens on Turns and Ranking; the plain draw is hidden, because starting a day already draws the order.
  - Everyone gets the same time: presets of 2 to 15 minutes, or any value from 1 to 60. Press **Start turns** and the order is drawn at random, again each time.
  - The speaker's clock **counts down**, and the bar drains. Going over is shown as `+mm:ss` in red and keeps counting; it is never cut off, and that time counts in the ranking. There is no sound.
  - **Next** hands the floor to the next person with the clock stopped ("Up now"); they press **Start talking** when they begin. The first person of the day starts at once. Tap a person's tile to give them the floor and start their clock right away. Two fixed controls: the round ▶ / ⏸ button runs the clock and **Next** passes the floor. **Space** starts, pauses or resumes the clock and **→** passes the floor (not while typing or on a focused button). Colors by state: green speaking, coral up now, amber paused, red over time.
  - Mark someone as **not here** and they stay out of the turns and of today's score.
  - **Float** (Chrome and Edge on desktop) moves the "speaking now" card into a small window that stays on top of everything, with Pause and Next in it, so you can switch tabs or apps. It needs HTTPS or `localhost`; where it is not supported the button is hidden. **Bring back** (or closing the window) returns the card to the page.
  - The screen stays awake while someone speaks, a reload keeps the clock right, and the tab title shows the time left and who is speaking. **Finish and save the day** stores it in the list. It cannot alert you if the app is closed or the phone is locked, because there is no backend to push from.
- **Ranking** per list, built from the saved days: who spoke less, on average. Each person's score is the share of the time they were given that they used, counted only over the days they were there (so missing a day neither helps nor hurts); the lowest wins and ties share a place. A podium shows the first three, then a table with the percentage and days present. You can set the minimum number of days to be ranked (1 by default), delete a single day, reset the score, and **copy the ranking as a 4:5 image** to paste it anywhere, **download** it as a PNG, or, on phones and tablets, **share** it through the system share sheet. The image is drawn in the browser; nothing is uploaded.
- **Backup** at the bottom of the page: *Export* downloads every list, its people and its saved days as one JSON file; *Import* reads one back after showing what it will do (lists with the same id are replaced by the file's version, the others are added, nothing is deleted). The day in progress and today's absences are not exported. The file is validated like stored data, a file from a newer version or over 5 MB is refused, and a browser that only has the empty default list gets it replaced.
- System, Light or Dark theme from the menu at the top right; it is remembered.
- Spanish (`/`) and English (`/en/`) with an ES/EN switch next to the theme menu. The choice is remembered; it starts in Spanish by default.
- Installable (PWA) and works offline: a small service worker caches the app after the first visit. It is only registered in production builds.
- Accessible: visible labels, keyboard support, visible focus, screen reader announcements and `prefers-reduced-motion` support.

## Development

Requires Node 22.23.4 or later.

```sh
npm install
npm run dev      # server at http://localhost:4321
npm start        # dev server at http://localhost:4710, also reachable from other devices on your network
npm run build    # static site in dist/
npm run preview  # serves dist/
npm test         # tests for the draw, lists, turns, clock and backup logic
```

## How it works

Logic without DOM or storage lives in `src/lib` (with tests); the browser code that reads the clock and draws is in `src/scripts`, with no UI framework. Stored data, the backup format, the ranking rules, the floating window, offline support and deployment are described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Design decisions and tokens are in [docs/DESIGN.md](docs/DESIGN.md).

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

- Your lists stay only in your browser and device. It is not synced, and it is lost if you clear the site's data or use private browsing: use Export to keep a copy. Do not store sensitive information in it.
- The result is not saved: when you reopen the app you get your list back and draw again.
- Shuffling uses `Math.random()` (Fisher–Yates). It is fine for casual draws; it is not suitable for prizes or fairness audits.
