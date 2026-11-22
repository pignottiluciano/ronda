# Changelog

Notable changes to Ronda. Dates are when a branch was merged.

## Unreleased (branch `mejoras`)

### Added
- **Review a drawn order before starting.** With the "Drawn" order, the first press draws and shows the order in the same editor as "Today's queue" (drag, arrows, absent). People can be moved so someone who leaves early speaks first. "Draw again" and switching to the list order ask first when the order was moved. The draft survives a reload (`ListTurns.draft`) and only changes today's order, never the list's.
- **Time steps on the speaker card.** Clock and bar turn amber from 80% of the time used and red once over. The bar empties as time runs out and stays full and red when over. Color changes fade; reduced motion turns the fade off.
- **History details.** Each saved day shows its end time, attendance, duration and how many went over.
- **Rows slide when reordered.** In "Today's queue" and the drawn order, rows slide to their new place (200ms) with the arrows and while dragging. Off under reduced motion.
- **Header menu on phones.** Under 640px the header is the brand plus a "⋯" menu with help, language and theme.

### Changed
- **Rows for the day** on every width instead of ~190px tiles: ring, name, state, time and an icon-only "Absent" button. People who already spoke no longer show "Absent".
- **Compact speaker card:** clock on the left, name in the middle, Float as an icon, bar below.
- **One clock direction:** time left while speaking or waiting, time used once done.
- **Paused state** reads "Paused"; Next turns quiet so Resume is the only filled button.
- **People box folds on phones** during a day to "5 participants · 1 absent · Edit", so the clock is on the first screen.
- **History deletes in edit mode:** day cards with no buttons; "Edit" shows a red "Delete" per day. The delete button's label now includes the time, since two days can share a date.
- **Ranking:** the podium shows from the third saved day (`PODIUM_MIN_DAYS`), with a note before that. Percentages get one decimal only where rounding would make different places look equal (`rankPercents`).
- **Copy follows the mode:** the intro text speaks about turns on lists that use them. Brand and page title read "Turns, draws and groups".
- "Today's queue" and the turns setup are capped at 32rem on desktop.

### Data
- No storage keys change. Stored data without `draft` loads as `draft: null`, so lists, days and a day in progress survive the update. Backups skip the draft.

### Documentation
- Help page ("How it works", Spanish and English): drawn-order review, rows, compact card, time steps, menu, podium and history.
- `README.md` and `docs/DESIGN.md` updated for the same features.
- `docs/ideas-y-mejoras.md`: design review and product proposals, with done and pending items.
- Mocks in `docs/`: `mejoras-diseno.html`, `orden-sorteado.html` (+ desktop PNG), `turnos-lista.html`, `tarjeta-compacta.html` and `historial.html`.

### Pending (not in this branch)
- Backup inside the "⋯" menu; the toast covering content; the share image still drawing the podium with fewer than three days.
- Product proposals 2, 3 and 5–9 in `docs/ideas-y-mejoras.md`. Metrics are undecided.
