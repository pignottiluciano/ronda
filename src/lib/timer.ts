// Countdown timer: pure state transitions, no DOM, no clock of its own (`now` is always passed in).
// A running timer stores its end time, not a counter, so it stays right if the tab is throttled or reloaded.

export const PRESETS = [5, 10, 15, 30, 45, 60] as const;
export const DEFAULT_MINUTES = 30;
export const MAX_MINUTES = 180;

export type TimerState =
  | { status: 'idle'; minutes: number }
  | { status: 'running'; minutes: number; endsAt: number }
  | { status: 'paused'; minutes: number; remainingMs: number }
  | { status: 'done'; minutes: number };

const MINUTE = 60_000;

export const idle = (minutes = DEFAULT_MINUTES): TimerState => ({ status: 'idle', minutes });

export function isValidMinutes(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_MINUTES;
}

/** The duration can only change while idle. Invalid values are ignored. */
export function setMinutes(state: TimerState, minutes: number): TimerState {
  return state.status === 'idle' && isValidMinutes(minutes) ? { status: 'idle', minutes } : state;
}

/** Starts from idle or resumes from paused; any other state is returned unchanged. */
export function start(state: TimerState, now: number): TimerState {
  if (state.status === 'idle') return { status: 'running', minutes: state.minutes, endsAt: now + state.minutes * MINUTE };
  if (state.status === 'paused') return { status: 'running', minutes: state.minutes, endsAt: now + state.remainingMs };
  return state;
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.status !== 'running') return state;
  return { status: 'paused', minutes: state.minutes, remainingMs: Math.max(0, state.endsAt - now) };
}

export const reset = (state: TimerState): TimerState => idle(state.minutes);

/** Moves a running timer to done once its end time has passed. Call it on every tick and on load. */
export function settle(state: TimerState, now: number): TimerState {
  return state.status === 'running' && state.endsAt <= now ? { status: 'done', minutes: state.minutes } : state;
}

export function remainingMs(state: TimerState, now: number): number {
  switch (state.status) {
    case 'idle':
      return state.minutes * MINUTE;
    case 'running':
      return Math.max(0, state.endsAt - now);
    case 'paused':
      return state.remainingMs;
    case 'done':
      return 0;
  }
}

/** Share of the time still left, from 1 to 0. */
export const fractionLeft = (state: TimerState, now: number): number => remainingMs(state, now) / (state.minutes * MINUTE);

/** mm:ss, rounding up so the clock never shows 00:00 while time is left. */
export function formatClock(ms: number): string {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

/** Validates data read from storage. Returns null when it is not a usable state. */
export function parseTimer(data: unknown): TimerState | null {
  if (typeof data !== 'object' || data === null) return null;
  const { status, minutes, endsAt, remainingMs: left } = data as Record<string, unknown>;
  if (!isValidMinutes(minutes)) return null;
  if (status === 'idle' || status === 'done') return { status, minutes };
  if (status === 'running' && typeof endsAt === 'number' && Number.isFinite(endsAt)) return { status, minutes, endsAt };
  if (status === 'paused' && typeof left === 'number' && left >= 0 && left <= minutes * MINUTE) {
    return { status, minutes, remainingMs: left };
  }
  return null;
}
