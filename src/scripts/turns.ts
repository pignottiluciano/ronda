// Turns UI. State transitions live in src/lib/turns.ts; this file reads the clock and updates the DOM.
// app.ts owns the lists and hands this module what it needs through `TurnsHost`.
import { messages } from '../i18n/messages';
import { formatClock, formatRemaining } from '../lib/clock';
import { shuffle } from '../lib/draw';
import { ICONS } from '../lib/icons';
import type { SavedList } from '../lib/lists';
import {
  BUDGET_PRESETS, MAX_BUDGET_MINUTES, cancelSession, draftOrder, drawDraft, emptyTurns, finish, handOver, isValidBudgetMinutes, moveDraft,
  nextId, pause, queue, setAbsent, setBudgetMinutes, setOrder, speak, spokenMs, startSession, syncPeople, type ListTurns, type TurnsStore,
} from '../lib/turns';
import { confirmAction } from './confirm';
import { createFloat, floatSupported } from './float';
import { createQueueEditor } from './queue-editor';
import { initRanking } from './ranking';
import { readTurns, writeTurns } from './storage';
import { holdScreen, releaseScreen } from './wakelock';

export interface TurnsHost {
  list(): SavedList;
  listIds(): string[];
  /** `undo`: the message offers to take the last step back. */
  say(message: string, undo?: () => void): void;
  /** Absences changed: badges, the count and the draw must follow. */
  absenceChanged(): void;
  /** Puts a person at `toIndex` in the list (the list order is the speaking order with "as listed"). */
  movePerson(id: string, toIndex: number): void;
}

type Mode = 'draw' | 'turns' | 'ranking';

/** Share of the budget after which the clock and the bar turn amber: the last 20% is the time to wrap up. */
const LATE_SHARE = 0.8;

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
  const redrawButton = $<HTMLButtonElement>('turns-redraw');
  const orderField = $<HTMLFieldSetElement>('turn-order');
  const orderHint = $('order-hint');
  const queueBox = $('queue');
  const queueCount = $('queue-count');
  const queueTitle = $('queue-title');
  const now = $('now');
  const nowLabel = $('now-label');
  const nowName = $('now-name');
  const nowClock = $('now-clock');
  const nowOf = $('now-of');
  const barFill = $('now-bar').firstElementChild as HTMLElement;
  const pauseButton = $<HTMLButtonElement>('turns-pause');
  const nextButton = $<HTMLButtonElement>('turns-next');
  const nextLabel = $('turns-next-label');
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

  let undoFrom: ListTurns | null = null; // the state an offered undo starts from, while the offer is on screen
  function update(next: ListTurns) {
    if (undoFrom && next !== undoFrom) dropUndo(); // anything else that changes the turns retires the offer
    store = { ...store, [listId()]: next };
    if (!writeTurns(store)) host.say(t.saveFailed);
    render();
  }

  function say(message: string) {
    announce.textContent = message;
  }

  // Passing or taking the floor happens at once, so a wrong tap is undone instead of confirmed. Undo puts back the turns
  // as they were, so the time in between counts for whoever had the floor. It only applies while nothing else
  // changed since (another tap, another list): `after` is the exact state the step left.
  function dropUndo() {
    undoFrom = null;
    host.say('');
  }

  function stepWithUndo(message: string, next: ListTurns, back: () => void = () => {}) {
    const before = turns();
    update(next);
    const after = turns();
    undoFrom = after;
    host.say(message, () => {
      if (turns() !== after) return; // another list, or the offer outlived its state
      undoFrom = null;
      back(); // before the redraw, which reads it
      update(before);
      host.absenceChanged(); // the step may have cleared today's absences (finishing a day does)
      host.say(t.undoDone);
    });
  }

  // A drawn order waiting to be reviewed (orden "Sorteado", before the day starts). `touched`: someone moved it, so
  // drawing again or switching to the list order asks first. It lives in memory; after a reload the draft stays, the question does not.
  let touched = false;
  const reviewing = (current: ListTurns = turns()) => current.order === 'draw' && !current.current && draftOrder(current, ids()) !== null;
  function linePeople() {
    const people = host.list().people;
    const line = reviewing() ? draftOrder(turns(), ids()) : null;
    return line ? line.map((id) => people.find((p) => p.id === id)!) : people;
  }

  const queueEditor = createQueueEditor({
    list: $<HTMLOListElement>('queue-list'),
    onMove(id, toIndex) {
      if (reviewing()) {
        touched = true;
        update(moveDraft(turns(), ids(), id, toIndex)); // only today's order changes
      } else host.movePerson(id, toIndex); // the list order is the order: app.ts saves the list and refreshes us
      const people = linePeople();
      const away = new Set(turns().absent);
      const present = people.filter((p) => !away.has(p.id));
      const position = away.has(id) ? people.findIndex((p) => p.id === id) + 1 : present.findIndex((p) => p.id === id) + 1;
      say(t.queueMoved(nameOf(id), position, away.has(id) ? people.length : present.length));
    },
    onToggleAway: (id) => toggleAbsent(id),
  });

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
    for (const radio of orderField.querySelectorAll<HTMLInputElement>('input')) radio.checked = radio.value === current.order;
    const review = reviewing(current);
    orderHint.textContent = current.order === 'list' ? t.queueHint : review ? t.queueHintDraft : t.turnsHintDraw;
    queueBox.hidden = current.order !== 'list' && !review;
    queueTitle.textContent = review ? t.queueTitleDraft : t.queueTitle;
    if (!queueBox.hidden) {
      const away = new Set(current.absent);
      queueCount.textContent = t.queuePresent(ids().filter((id) => !away.has(id)).length);
      const people = linePeople();
      queueEditor.render(people, away);
      const first = people.find((p) => !away.has(p.id));
      startButton.textContent = review ? t.turnsBegin(first?.name ?? '') : t.turnsStart;
    } else startButton.textContent = current.order === 'draw' ? t.turnsDraw : t.turnsStart;
    redrawButton.hidden = !review;
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
    const label = document.createElement('span');
    label.className = 'tile-name';
    label.textContent = name;
    const state = document.createElement('span');
    state.className = 'tile-state';
    const time = document.createElement('span');
    time.className = 'tile-time';
    main.append(ring, label, state, time);
    const away = document.createElement('button'); // an icon; its label says what it does
    away.type = 'button';
    away.className = 'tile-away';
    away.innerHTML = ICONS.away;
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
      const holding = active && !running && ms === 0; // has the floor, clock not started
      const state = away ? 'absent' : running ? 'speaking' : holding ? 'holding' : active ? 'paused' : ms > 0 ? 'done' : id === up ? 'next' : 'waiting';
      // One clock for everyone, like the card: time left, and for someone who already spoke, time used.
      const left = !away && state !== 'done';
      const clock = over ? `+${formatClock(ms - budget)}` : left ? formatRemaining(ms, budget) : formatClock(ms);
      const share = over ? 100 : left ? 100 - (ms / budget) * 100 : (ms / budget) * 100; // the ring drains while there is time left
      tile.li.dataset.state = state;
      tile.li.dataset.over = String(over);
      tile.ring.style.setProperty('--p', String(Math.max(0, Math.min(100, share))));
      tile.time.textContent = away ? '—' : clock;
      tile.state.textContent = over ? t.stateOver : { absent: t.stateAbsent, speaking: t.stateSpeakingLeft, holding: t.turnsUpNext, paused: t.statePausedLeft, done: t.stateDoneUsed, next: t.stateNext, waiting: t.stateWaiting }[state];
      tile.main.disabled = away;
      tile.main.setAttribute('aria-label', t.tileGive(nameOf(id), clock));
      if (active) tile.main.setAttribute('aria-current', 'true');
      else tile.main.removeAttribute('aria-current');
      tile.away.setAttribute('aria-label', away ? t.awayBackToggle(nameOf(id)) : t.awayToggle(nameOf(id)));
    }

    const activeId = session.activeId;
    const activeMs = activeId ? spokenMs(current, activeId, at) : 0;
    const activeOver = activeMs > budget;
    const waiting = activeId !== null && session.activeSince === null && activeMs === 0; // has the floor, clock not started
    now.dataset.state = activeId === null ? 'idle' : session.activeSince !== null ? 'speaking' : waiting ? 'waiting' : 'paused';
    now.dataset.over = String(activeOver);
    now.dataset.late = String(activeId !== null && !activeOver && activeMs >= budget * LATE_SHARE);
    const paused = activeId !== null && session.activeSince === null && !waiting;
    nowLabel.textContent = activeId === null ? '' : waiting ? t.turnsUpNext : paused ? t.statePaused : t.turnsNow;
    nowName.textContent = activeId === null ? t.turnsNobody : nameOf(activeId);
    nowClock.textContent = formatRemaining(activeMs, budget);
    nowOf.textContent = t.turnsOf(formatClock(budget));
    barFill.style.transform = `scaleX(${activeOver ? 1 : Math.max(0, 1 - activeMs / budget)})`; // drains as the time goes; full and red once over
    pauseButton.hidden = activeId === null;
    const act = session.activeSince !== null ? 'pause' : waiting ? 'go' : 'resume';
    const actLabel = { pause: t.turnsPause, go: t.turnsGo, resume: t.turnsResume }[act];
    pauseButton.dataset.act = act;
    pauseButton.setAttribute('aria-label', actLabel);
    pauseButton.title = actLabel;
    nextButton.dataset.quiet = String(waiting || paused); // the clock is the next press, so passing the floor steps back
    const nextText = up === null ? t.turnsAllSpoke : activeId === null ? t.turnsBegin(nameOf(up)) : t.turnsNext(nameOf(up));
    nextLabel.textContent = nextText;
    nextButton.title = nextText; // a long name is cut to two lines on the button
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
    // On a phone a day in progress folds the people box into one line, so the clock is on the first screen.
    layout.dataset.live = String(session && mode === 'turns');
    if (!session) setEditing(false);
    total.hidden = !session;
    if (mode === 'turns') renderBudget(current);
    if (!session) float.close();
    else if (mode === 'turns' || float.isOpen()) {
      renderTiles(current);
      paint(Date.now());
    }
    floatButton.hidden = !floatSupported() || !session;
    const floatLabel = float.isOpen() ? t.floatBack : t.floatOpen;
    floatButton.setAttribute('aria-label', floatLabel);
    floatButton.title = floatLabel;
    if (mode === 'ranking') rankingView.render();
    syncRuntime();
  }

  const editPeople = $<HTMLButtonElement>('people-edit');
  function setEditing(on: boolean) {
    layout.toggleAttribute('data-editing', on);
    editPeople.setAttribute('aria-expanded', String(on));
    editPeople.textContent = on ? t.peopleEditDone : t.peopleEdit;
  }
  editPeople.addEventListener('click', () => setEditing(!layout.hasAttribute('data-editing')));

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

  orderField.addEventListener('change', async (event) => {
    const order = (event.target as HTMLInputElement).value === 'list' ? 'list' : 'draw';
    if (touched && reviewing() && order === 'list' && !(await confirmAction({ title: t.orderChangeTitle, body: t.orderChangeBody, confirm: t.orderChangeConfirm }))) return render(); // the radio goes back
    touched = false;
    update(setOrder(turns(), order));
  });

  startButton.addEventListener('click', () => {
    const present = ids().filter((id) => !turns().absent.includes(id));
    if (present.length === 0) return host.say(t.turnsNeedPeople);
    const line = turns().order === 'draw' ? draftOrder(turns(), ids()) : null;
    if (turns().order === 'draw' && !line) {
      // A drawn order is drawn first and reviewed; the next press starts the day with it. Everyone is in the draw: the absent keep a place.
      touched = false;
      say(t.queueDrawn);
      return update(drawDraft(turns(), shuffle(ids())));
    }
    touched = false;
    update(startSession(turns(), ids(), Date.now(), line ?? [])); // list order needs none (startSession keeps the list's)
  });

  redrawButton.addEventListener('click', async () => {
    if (touched && !(await confirmAction({ title: t.redrawTitle, body: t.redrawBody, confirm: t.redrawConfirm }))) return;
    touched = false;
    say(t.queueDrawn);
    update(drawDraft(turns(), shuffle(ids())));
  });

  tiles.addEventListener('click', (event) => {
    const item = (event.target as Element).closest<HTMLElement>('.tile');
    if (!item) return;
    const id = item.dataset.id!;
    if ((event.target as Element).closest('.tile-away')) return toggleAbsent(id);
    const next = speak(turns(), id, Date.now());
    if (next !== turns()) stepWithUndo(t.turnsSpeaking(nameOf(id)), next);
  });

  // Space starts, pauses or resumes the clock; the right arrow passes the floor. Never while typing or on a focused control,
  // which keep their own keys, and never to close the day by accident.
  function onKey(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (mode !== 'turns' && !float.isOpen()) return;
    const key = event.key === ' ' ? pauseButton : event.key === 'ArrowRight' ? nextButton : null;
    if (!key || key.closest('[hidden]') || (event.target as Element).closest('input, textarea, select, button, a, summary, dialog, [contenteditable]')) return;
    if (key === nextButton && nextId(turns(), ids()) === null) return;
    event.preventDefault();
    key.click();
  }
  document.addEventListener('keydown', onKey);

  floatButton.addEventListener('click', async () => {
    if (float.isOpen()) return float.close();
    if (!(await float.open())) return host.say(t.floatFailed);
    float.window()?.addEventListener('keydown', onKey);
  });
  $('turns-unfloat').addEventListener('click', float.close);

  // After a pointer click the button lets go of the focus, so Space then drives the clock instead of repeating the last press.
  const letGo = (event: MouseEvent) => event.detail > 0 && (event.currentTarget as HTMLElement).blur();
  pauseButton.addEventListener('click', letGo);
  nextButton.addEventListener('click', letGo);

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
    if (turns().current?.activeId == null) return stepWithUndo(t.turnsSpeaking(nameOf(up)), speak(turns(), up, Date.now())); // the first one starts at once
    stepWithUndo(t.turnsUp(nameOf(up)), handOver(turns(), up, Date.now())); // then each one waits for their own click to start
  });

  function finishDay() {
    const saved = finish(turns(), host.list().people, Date.now());
    mode = 'ranking'; // the day just saved is in the score now
    stepWithUndo(t.turnsSaved(saved.sessions.length), saved, () => (mode = 'turns'));
    host.absenceChanged(); // a finished day clears today's absences
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
