// Timer UI. State transitions live in src/lib/timer.ts; this file only reads the clock and updates the DOM.
import { messages } from '../i18n/messages';
import {
  DEFAULT_MINUTES, PRESETS, formatClock, fractionLeft, idle, isValidMinutes, parseTimer, pause, remainingMs, reset,
  setMinutes, settle, start, type TimerState,
} from '../lib/timer';

const KEY = 'ronda.timer.v1';
const t = messages[document.documentElement.lang === 'en' ? 'en' : 'es'];
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const card = $('timer');
const time = $('timer-time');
const done = $('timer-done');
const bar = $('timer-bar');
const barFill = bar.firstElementChild as HTMLElement;
const of = $('timer-of');
const setup = $('timer-setup');
const presets = $('timer-presets');
const custom = $<HTMLInputElement>('timer-custom');
const startButton = $<HTMLButtonElement>('timer-start');
const pauseButton = $<HTMLButtonElement>('timer-pause');
const resetButton = $<HTMLButtonElement>('timer-reset');
const announce = $('timer-announce');
const pageTitle = document.title;

function load(): TimerState {
  try {
    const saved = parseTimer(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
    if (saved) return saved;
  } catch {
    // Corrupt JSON or blocked storage: start fresh.
  }
  return idle(DEFAULT_MINUTES);
}

let state = settle(load(), Date.now()); // it may have finished while the page was closed
let interval: number | undefined;
let wakeLock: WakeLockSentinel | null = null;

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // The timer still works in this tab; it just won't survive a reload.
  }
}

// Keeps the screen on while counting. The browser drops the lock when the tab is hidden, so it is asked for again on return.
async function holdScreen() {
  try {
    wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
  } catch {
    wakeLock = null;
  }
}
function releaseScreen() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

function renderPresets() {
  presets.replaceChildren(
    ...PRESETS.map((minutes) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.minutes = String(minutes);
      chip.textContent = String(minutes);
      chip.setAttribute('aria-label', t.timerPresetLabel(minutes));
      return chip;
    }),
  );
}

function render() {
  const now = Date.now();
  const { status, minutes } = state;
  card.dataset.status = status;
  time.textContent = formatClock(remainingMs(state, now));
  of.textContent = t.timerOf(minutes);
  barFill.style.transform = `scaleX(${fractionLeft(state, now)})`;

  const configuring = status === 'idle';
  setup.hidden = !configuring;
  bar.hidden = configuring || status === 'done';
  done.hidden = status !== 'done';
  time.hidden = false;
  startButton.hidden = status !== 'idle' && status !== 'paused';
  startButton.textContent = status === 'paused' ? t.timerResume : t.timerStart;
  pauseButton.hidden = status !== 'running';
  resetButton.hidden = status === 'idle';
  resetButton.textContent = t.timerReset;

  for (const chip of presets.querySelectorAll<HTMLElement>('.chip')) {
    chip.setAttribute('aria-pressed', String(Number(chip.dataset.minutes) === minutes));
  }
  custom.value = (PRESETS as readonly number[]).includes(minutes) ? '' : String(minutes);

  // The tab title keeps the countdown visible when the page is in the background.
  document.title = status === 'running' ? `${time.textContent} · ${pageTitle}` : status === 'done' ? `${t.timerDone} · ${pageTitle}` : pageTitle;
}

function tick() {
  const before = state.status;
  state = settle(state, Date.now());
  if (state.status !== before) onChange(); // running -> done
  else render();
}

function syncClock() {
  if (state.status === 'running' && interval === undefined) {
    interval = window.setInterval(tick, 250);
  } else if (state.status !== 'running' && interval !== undefined) {
    clearInterval(interval);
    interval = undefined;
  }
}

function onChange(message?: string) {
  save();
  syncClock();
  if (state.status === 'running') void holdScreen();
  else releaseScreen();
  if (state.status === 'done') announce.textContent = t.timerDone;
  else if (message) announce.textContent = message;
  render();
}

presets.addEventListener('click', (event) => {
  const chip = (event.target as Element).closest<HTMLElement>('.chip');
  if (!chip) return;
  state = setMinutes(state, Number(chip.dataset.minutes));
  onChange();
});

custom.addEventListener('change', () => {
  const minutes = Number(custom.value);
  if (isValidMinutes(minutes)) state = setMinutes(state, minutes);
  onChange(); // an invalid value is dropped and the field goes back to the current duration
});

startButton.addEventListener('click', () => {
  const wasIdle = state.status === 'idle';
  state = start(state, Date.now());
  onChange(wasIdle ? t.timerStarted(state.minutes) : undefined);
});
pauseButton.addEventListener('click', () => {
  state = pause(state, Date.now());
  onChange();
});
resetButton.addEventListener('click', () => {
  state = reset(state);
  onChange();
});

// Coming back to a throttled or locked tab: catch up right away and take the screen lock again.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  tick();
  if (state.status === 'running') void holdScreen();
});

renderPresets();
syncClock();
if (state.status === 'running') void holdScreen();
render();
