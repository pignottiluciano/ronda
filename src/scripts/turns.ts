// Turns UI. State transitions live in src/lib/turns.ts; this file reads the clock and updates the DOM.
// app.ts owns the lists and hands this module what it needs through `TurnsHost`.
import { messages } from '../i18n/messages';
import { formatClock, formatRemaining } from '../lib/clock';
import { shuffle } from '../lib/draw';
import type { SavedList } from '../lib/lists';
import {
  BUDGET_PRESETS, MAX_BUDGET_MINUTES, cancelSession, emptyTurns, finish, isValidBudgetMinutes, nextId, pause, queue,
  setAbsent, setBudgetMinutes, speak, spokenMs, startSession, syncPeople, type ListTurns, type TurnsStore,
} from '../lib/turns';
import { confirmAction } from './confirm';
import { createFloat, floatSupported } from './float';
import { initRanking } from './ranking';
import { readTurns, writeTurns } from './storage';
import { holdScreen, releaseScreen } from './wakelock';

export interface TurnsHost {
  list(): SavedList;
  listIds(): string[];
  say(message: string): void;
  /** Absences changed: badges, the count and the draw must follow. */
  absenceChanged(): void;
}

type Mode = 'draw' | 'turns' | 'ranking';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const t = messages[document.documentElement.lang === 'en' ? 'en' : 'es'];

// Before the general timer was replaced by turns, it kept its state here.
try {
  localStorage.removeItem('ronda.timer.v1');
} catch {
  // Blocked storage: nothing to clean.
}

export function initTurns(host: TurnsHost) {
  const layout = $('layout');
  const modes = $<HTMLFieldSetElement>('modes');
  const total = $('turns-total');
  const setup = $('turns-setup');
  const live = $('turns-live');
  const presets = $('budget-presets');
  const custom = $<HTMLInputElement>('budget-custom');
  const days = $('turns-days');
  const startButton = $<HTMLButtonElement>('turns-start');
  const now = $('now');
  const nowLabel = $('now-label');
  const nowName = $('now-name');
  const nowClock = $('now-clock');
  const nowOf = $('now-of');
  const barFill = $('now-bar').firstElementChild as HTMLElement;
  const pauseButton = $<HTMLButtonElement>('turns-pause');
  const nextButton = $<HTMLButtonElement>('turns-next');
  const tiles = $('tiles');
  const announce = $('turns-announce');
  const pageTitle = document.title;
  const floatButton = $<HTMLButtonElement>('turns-float');
  const float = createFloat({ card: now, slot: $('now-slot'), onChange: () => (render(), syncRuntime()) });

  let store: TurnsStore = readTurns(host.listIds());
  const drawOption = modes.querySelector<HTMLElement>('input[value="draw"]')!.parentElement!;
  let mode: Mode = 'draw';
  let ticker: { win: Window; id: number } | undefined;
  const overAnnounced = new Set<string>(); // "startedAt:personId", so a person is told once per day

  const listId = () => host.list().id;
  const ids = () => host.list().people.map((p) => p.id);
  const turns = (): ListTurns => store[listId()] ?? emptyTurns();
  const nameOf = (id: string) => host.list().people.find((p) => p.id === id)?.name ?? '';

  function update(next: ListTurns) {
    store = { ...store, [listId()]: next };
    if (!writeTurns(store)) host.say(t.saveFailed);
    render();
  }

  function say(message: string) {
    announce.textContent = message;
  }

  const rankingView = initRanking({ list: host.list, turns, update, say: host.say });

  // ---- Rendering ----

  // Built once: replacing the buttons on every change would drop the keyboard focus.
  presets.replaceChildren(
    ...BUDGET_PRESETS.map((value) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.minutes = String(value);
      chip.textContent = String(value);
      chip.setAttribute('aria-label', t.turnsPresetLabel(value));
      return chip;
    }),
  );

  function renderBudget(current: ListTurns) {
    const minutes = current.budgetMs / 60_000;
    for (const chip of presets.querySelectorAll<HTMLElement>('.chip')) {
      chip.setAttribute('aria-pressed', String(Number(chip.dataset.minutes) === minutes));
    }
    custom.value = (BUDGET_PRESETS as readonly number[]).includes(minutes) ? '' : String(minutes);
    const saved = current.sessions.length;
    days.hidden = saved === 0;
    days.textContent = saved === 0 ? '' : t.turnsDays(saved);
  }

  interface TileParts {
    li: HTMLElement;
    main: HTMLButtonElement;
    time: HTMLElement;
    state: HTMLElement;
    ring: HTMLElement;
    away: HTMLButtonElement;
  }
  let parts = new Map<string, TileParts>();

  function buildTile(id: string, name: string): TileParts {
    const li = document.createElement('li');
    li.className = 'tile';
    li.dataset.id = id;
    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'tile-main';
    const ring = document.createElement('span');
    ring.className = 'ring';
    ring.setAttribute('aria-hidden', 'true');
    const time = document.createElement('span');
    time.className = 'ring-time';
    ring.append(time);
    const label = document.createElement('span');
    label.className = 'tile-name';
    label.textContent = name;
    const state = document.createElement('span');
    state.className = 'tile-state';
    main.append(ring, label, state);
    const away = document.createElement('button');
    away.type = 'button';
    away.className = 'tile-away';
    li.append(main, away);
    return { li, main, time, state, ring, away };
  }

  // Tiles are rebuilt when who is in the day changes; every tick only repaints them.
  function renderTiles(current: ListTurns) {
    const everyone = ids();
    const line = [...queue(current, everyone), ...everyone.filter((id) => current.absent.includes(id))];
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusedId = focused && tiles.contains(focused) ? focused.closest<HTMLElement>('.tile')?.dataset.id : undefined;
    const focusedAway = focused?.classList.contains('tile-away') ?? false;
    parts = new Map(line.map((id) => [id, buildTile(id, nameOf(id))]));
    tiles.replaceChildren(...[...parts.values()].map((p) => p.li));
    // Rebuilding drops the focus; give it back to the same person and control.
    if (focusedId) {
      const tile = parts.get(focusedId);
      (focusedAway ? tile?.away : tile?.main)?.focus();
    }
  }

  function paint(at: number) {
    const current = turns();
    const session = current.current;
    if (!session) return;
    const budget = session.budgetMs;
    const up = nextId(current, ids());
    let sum = 0;
    for (const [id, tile] of parts) {
      const ms = spokenMs(current, id, at);
      sum += ms;
      const away = current.absent.includes(id);
      const active = session.activeId === id;
      const running = active && session.activeSince !== null;
      const over = !away && ms > budget;
      const state = away ? 'absent' : running ? 'speaking' : active ? 'paused' : ms > 0 ? 'done' : id === up ? 'next' : 'waiting';
      const clock = over ? `+${formatClock(ms - budget)}` : formatClock(ms);
      tile.li.dataset.state = state;
      tile.li.dataset.over = String(over);
      tile.ring.style.setProperty('--p', String(Math.min(100, (ms / budget) * 100)));
      tile.time.textContent = away ? '—' : clock;
      tile.state.textContent = over ? t.stateOver : { absent: t.stateAbsent, speaking: t.stateSpeaking, paused: t.statePaused, done: t.stateDone, next: t.stateNext, waiting: t.stateWaiting }[state];
      tile.main.disabled = away;
      tile.main.setAttribute('aria-label', t.tileGive(nameOf(id), clock));
      if (active) tile.main.setAttribute('aria-current', 'true');
      else tile.main.removeAttribute('aria-current');
      tile.away.textContent = away ? t.backButton : t.awayButton;
      tile.away.setAttribute('aria-label', away ? t.awayBackToggle(nameOf(id)) : t.awayToggle(nameOf(id)));
    }

    const activeId = session.activeId;
    const activeMs = activeId ? spokenMs(current, activeId, at) : 0;
    const activeOver = activeMs > budget;
    now.dataset.state = activeId === null ? 'idle' : session.activeSince === null ? 'paused' : 'speaking';
    now.dataset.over = String(activeOver);
    nowLabel.textContent = activeId === null ? '' : t.turnsNow;
    nowName.textContent = activeId === null ? t.turnsNobody : nameOf(activeId);
    nowClock.textContent = formatRemaining(activeMs, budget);
    nowOf.textContent = t.turnsOf(formatClock(budget));
    barFill.style.transform = `scaleX(${Math.max(0, 1 - activeMs / budget)})`; // drains as the time goes
    pauseButton.hidden = activeId === null;
    pauseButton.textContent = session.activeSince === null ? t.turnsResume : t.turnsPause;
    nextButton.textContent = up === null ? t.turnsAllSpoke : activeId === null ? t.turnsBegin(nameOf(up)) : t.turnsNext(nameOf(up));
    total.hidden = false;
    total.textContent = t.turnsTotal(formatClock(sum));

    const running = activeId !== null && session.activeSince !== null;
    if (running && activeOver) {
      const key = `${session.startedAt}:${activeId}`;
      if (!overAnnounced.has(key)) {
        overAnnounced.add(key);
        say(t.turnsOver(nameOf(activeId)));
      }
    }
    document.title = running ? `${formatRemaining(activeMs, budget)} · ${nameOf(activeId)} · ${pageTitle}` : pageTitle;
  }

  function syncRuntime() {
    const session = turns().current;
    const running = session !== null && session.activeSince !== null;
    // While floating the tick runs in that window: a hidden tab gets its timers throttled, the floating one does not.
    const host = float.window() ?? window;
    if (ticker && (!running || ticker.win !== host)) {
      try {
        ticker.win.clearInterval(ticker.id);
      } catch {
        // The floating window is already gone, and its timers with it.
      }
      ticker = undefined;
    }
    if (running && !ticker) {
      ticker = { win: host, id: host.setInterval(() => (mode === 'turns' || float.isOpen() ? paint(Date.now()) : syncTitleOnly()), 250) };
    }
    if (running) void holdScreen();
    else releaseScreen();
    if (!running) document.title = pageTitle;
  }

  // The clock keeps running while the draw is on screen; only the tab title follows it.
  function syncTitleOnly() {
    const current = turns();
    const session = current.current;
    if (!session || session.activeId === null || session.activeSince === null) return;
    document.title = `${formatRemaining(spokenMs(current, session.activeId, Date.now()), session.budgetMs)} · ${nameOf(session.activeId)} · ${pageTitle}`;
  }

  function render() {
    const enabled = host.list().turns;
    modes.hidden = !enabled;
    if (!enabled) mode = 'draw';
    else if (mode === 'draw') mode = 'turns'; // starting a day draws the order, so the plain draw is not offered
    drawOption.hidden = enabled;
    layout.dataset.mode = mode;
    for (const radio of modes.querySelectorAll<HTMLInputElement>('input')) radio.checked = radio.value === mode;
    const current = turns();
    const session = current.current !== null;
    setup.hidden = session;
    live.hidden = !session;
    total.hidden = !session;
    if (mode === 'turns') renderBudget(current);
    if (!session) float.close();
    else if (mode === 'turns' || float.isOpen()) {
      renderTiles(current);
      paint(Date.now());
    }
    floatButton.hidden = !floatSupported() || !session;
    floatButton.textContent = float.isOpen() ? t.floatBack : t.floatOpen;
    if (mode === 'ranking') rankingView.render();
    syncRuntime();
  }

  // ---- Public ----

  /** The list changed under us (switched, badges edited, flag toggled): drop who left and redraw. */
  function refresh() {
    const current = store[listId()];
    if (current) {
      const synced = syncPeople(current, ids());
      const paused = !host.list().turns && synced.current?.activeSince != null ? pause(synced, Date.now()) : synced;
      if (paused !== current) {
        store = { ...store, [listId()]: paused };
        writeTurns(store);
      }
    }
    render();
  }

  /** A different list is on screen: open on its turns if a day is in progress there, else on the draw. */
  function open() {
    mode = host.list().turns ? 'turns' : 'draw';
    refresh();
  }

  function forget(id: string) {
    const { [id]: _gone, ...rest } = store;
    store = rest;
    writeTurns(store);
  }

  const absent = () => new Set(turns().absent);

  function toggleAbsent(id: string) {
    const away = !turns().absent.includes(id);
    say(away ? t.personAway(nameOf(id)) : t.personBack(nameOf(id)));
    update(setAbsent(turns(), id, away, Date.now()));
    host.absenceChanged();
  }

  // ---- Events ----

  modes.addEventListener('change', (event) => {
    const value = (event.target as HTMLInputElement).value;
    mode = value === 'turns' || value === 'ranking' ? value : 'draw';
    render();
  });

  presets.addEventListener('click', (event) => {
    const chip = (event.target as Element).closest<HTMLElement>('.chip');
    if (chip) update(setBudgetMinutes(turns(), Number(chip.dataset.minutes)));
  });

  custom.addEventListener('change', () => {
    const minutes = Number(custom.value);
    update(isValidBudgetMinutes(minutes) ? setBudgetMinutes(turns(), minutes) : turns()); // invalid: the field goes back
  });
  custom.max = String(MAX_BUDGET_MINUTES);

  startButton.addEventListener('click', () => {
    const present = ids().filter((id) => !turns().absent.includes(id));
    if (present.length === 0) return host.say(t.turnsNeedPeople);
    update(startSession(turns(), ids(), Date.now(), shuffle(present))); // every start draws the order again
  });

  tiles.addEventListener('click', (event) => {
    const item = (event.target as Element).closest<HTMLElement>('.tile');
    if (!item) return;
    const id = item.dataset.id!;
    if ((event.target as Element).closest('.tile-away')) return toggleAbsent(id);
    const next = speak(turns(), id, Date.now());
    if (next !== turns()) {
      say(t.turnsSpeaking(nameOf(id)));
      update(next);
    }
  });

  floatButton.addEventListener('click', async () => {
    if (float.isOpen()) return float.close();
    if (!(await float.open())) host.say(t.floatFailed);
  });
  $('turns-unfloat').addEventListener('click', float.close);

  pauseButton.addEventListener('click', () => {
    const session = turns().current;
    if (!session?.activeId) return;
    if (session.activeSince === null) {
      say(t.turnsSpeaking(nameOf(session.activeId)));
      update(speak(turns(), session.activeId, Date.now()));
    } else {
      say(t.turnsPaused);
      update(pause(turns(), Date.now()));
    }
  });

  nextButton.addEventListener('click', () => {
    const up = nextId(turns(), ids());
    if (!up) return finishDay(); // everyone has spoken: the button closes the day
    say(t.turnsSpeaking(nameOf(up)));
    update(speak(turns(), up, Date.now()));
  });

  function finishDay() {
    const saved = finish(turns(), host.list().people, Date.now());
    mode = 'ranking'; // the day just saved is in the score now
    update(saved);
    host.absenceChanged(); // a finished day clears today's absences
    host.say(t.turnsSaved(saved.sessions.length));
  }

  $('turns-finish').addEventListener('click', finishDay);

  $('turns-discard').addEventListener('click', async () => {
    if (!(await confirmAction({ title: t.turnsDiscardTitle, body: t.turnsDiscardBody, confirm: t.turnsDiscardConfirm }))) return;
    update(cancelSession(turns()));
    host.say(t.turnsDiscarded);
  });

  // Coming back to a throttled tab: catch up right away and take the screen lock again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (mode === 'turns') paint(Date.now());
    syncRuntime();
  });

  return { open, refresh, forget, absent, toggleAbsent };
}
