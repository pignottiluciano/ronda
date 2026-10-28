// Turns: pure state transitions for the speaking-time game, no DOM, no storage, no clock of its own
// (`now` is always passed in). A running turn stores when it started, not a counter, so it stays right
// if the tab is throttled or reloaded.

const MINUTE = 60_000;

export const BUDGET_PRESETS = [2, 3, 5, 10, 15] as const;
export const DEFAULT_BUDGET_MINUTES = 5;
export const MAX_BUDGET_MINUTES = 60;

/** The day in progress. `spoken` holds finished turns only; the running one is `activeSince`. */
export interface CurrentSession {
  startedAt: number;
  budgetMs: number;
  order: string[]; // person ids, speaking order
  spoken: Record<string, number>;
  activeId: string | null;
  activeSince: number | null; // null while paused
}

export interface Entry {
  personId: string;
  name: string; // as it was that day, so history reads right after a rename or a removal
  spokenMs: number;
  absent: boolean;
}

export interface Session {
  id: string;
  endedAt: number;
  budgetMs: number;
  entries: Entry[];
}

export interface ListTurns {
  budgetMs: number; // equal for everyone
  minDays: number; // used by the ranking
  absent: string[]; // not here today; they stay out of the draw and of the turns
  sessions: Session[];
  current: CurrentSession | null;
}

/** Turn data by list id. */
export type TurnsStore = Record<string, ListTurns>;

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const elapsed = (since: number, now: number) => Math.max(0, now - since);

export const emptyTurns = (): ListTurns => ({
  budgetMs: DEFAULT_BUDGET_MINUTES * MINUTE,
  minDays: 1,
  absent: [],
  sessions: [],
  current: null,
});

export const isValidBudgetMinutes = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_BUDGET_MINUTES;

/** The budget can only change between days. Invalid values are ignored. */
export function setBudgetMinutes(turns: ListTurns, minutes: number): ListTurns {
  return turns.current || !isValidBudgetMinutes(minutes) ? turns : { ...turns, budgetMs: minutes * MINUTE };
}

/** Adds the running turn to the person who had it and stops the clock. */
function settle(current: CurrentSession, now: number): CurrentSession {
  if (current.activeId === null || current.activeSince === null) return current;
  const spoken = (current.spoken[current.activeId] ?? 0) + elapsed(current.activeSince, now);
  return { ...current, spoken: { ...current.spoken, [current.activeId]: spoken }, activeSince: null };
}

/** `order` (the draw, if there is one) goes first; everyone else follows in list order. */
export function startSession(turns: ListTurns, ids: readonly string[], now: number, order: readonly string[] = []): ListTurns {
  if (turns.current) return turns;
  const known = order.filter((id, i) => ids.includes(id) && order.indexOf(id) === i);
  const current: CurrentSession = {
    startedAt: now,
    budgetMs: turns.budgetMs,
    order: [...known, ...ids.filter((id) => !known.includes(id))],
    spoken: {},
    activeId: null,
    activeSince: null,
  };
  return { ...turns, current };
}

/** Who is up, in order, without the people who are not here. Newcomers to the list go last. */
export function queue(turns: ListTurns, ids: readonly string[]): string[] {
  const known = (turns.current?.order ?? []).filter((id) => ids.includes(id));
  const rest = ids.filter((id) => !known.includes(id));
  return [...known, ...rest].filter((id) => !turns.absent.includes(id));
}

/** Gives the floor to `id` (resuming if they were paused). The previous speaker keeps what they used. */
export function speak(turns: ListTurns, id: string, now: number): ListTurns {
  const current = turns.current;
  if (!current || turns.absent.includes(id)) return turns;
  if (current.activeId === id && current.activeSince !== null) return turns;
  const settled = settle(current, now);
  const order = settled.order.includes(id) ? settled.order : [...settled.order, id];
  return { ...turns, current: { ...settled, order, activeId: id, activeSince: now } };
}

export function pause(turns: ListTurns, now: number): ListTurns {
  return turns.current ? { ...turns, current: settle(turns.current, now) } : turns;
}

/** Works before a day starts too. Marking the speaker absent stops their clock. */
export function setAbsent(turns: ListTurns, id: string, absent: boolean, now: number): ListTurns {
  if (absent === turns.absent.includes(id)) return turns;
  const next = { ...turns, absent: absent ? [...turns.absent, id] : turns.absent.filter((other) => other !== id) };
  return absent && next.current?.activeId === id ? { ...next, current: settle(next.current, now) } : next;
}

export function spokenMs(turns: ListTurns, id: string, now: number): number {
  const current = turns.current;
  if (!current) return 0;
  const running = current.activeId === id && current.activeSince !== null ? elapsed(current.activeSince, now) : 0;
  return (current.spoken[id] ?? 0) + running;
}

/** The next present person who has not spoken yet, going on from whoever has the floor and wrapping around. */
export function nextId(turns: ListTurns, ids: readonly string[]): string | null {
  const current = turns.current;
  if (!current) return null;
  const line = queue(turns, ids);
  const from = current.activeId === null ? 0 : line.indexOf(current.activeId) + 1;
  for (let i = 0; i < line.length; i++) {
    const id = line[(from + i) % line.length]!;
    if (id !== current.activeId && (current.spoken[id] ?? 0) === 0) return id;
  }
  return null;
}

/** Saves the day (everyone in `people`, absent ones flagged) and clears the day and today's absences. */
export function finish(turns: ListTurns, people: readonly { id: string; name: string }[], now: number): ListTurns {
  if (!turns.current) return turns;
  const current = settle(turns.current, now);
  const entries = people.map((p) => ({
    personId: p.id,
    name: p.name,
    spokenMs: current.spoken[p.id] ?? 0,
    absent: turns.absent.includes(p.id),
  }));
  const session: Session = { id: newId(), endedAt: now, budgetMs: current.budgetMs, entries };
  return { ...turns, sessions: [...turns.sessions, session], current: null, absent: [] };
}

export function cancelSession(turns: ListTurns): ListTurns {
  return { ...turns, current: null };
}

/** People who left the list leave the day and the absences. */
export function syncPeople(turns: ListTurns, ids: readonly string[]): ListTurns {
  const keep = (id: string) => ids.includes(id);
  const absent = turns.absent.filter(keep);
  const current = turns.current;
  if (!current) return absent.length === turns.absent.length ? turns : { ...turns, absent };
  const dropActive = current.activeId !== null && !keep(current.activeId);
  const spoken = Object.fromEntries(Object.entries(current.spoken).filter(([id]) => keep(id)));
  return {
    ...turns,
    absent,
    current: {
      ...current,
      order: current.order.filter(keep),
      spoken,
      activeId: dropActive ? null : current.activeId,
      activeSince: dropActive ? null : current.activeSince,
    },
  };
}

// ---- Validating what comes back from storage ----

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isMs = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isBudgetMs = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= MINUTE && (v as number) <= MAX_BUDGET_MINUTES * MINUTE;
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

function parseEntry(v: unknown): Entry | null {
  if (!isRecord(v)) return null;
  const { personId, name, spokenMs: spoken, absent } = v;
  if (typeof personId !== 'string' || typeof name !== 'string' || !isMs(spoken) || typeof absent !== 'boolean') return null;
  return { personId, name, spokenMs: spoken, absent };
}

function parseSession(v: unknown): Session | null {
  if (!isRecord(v) || typeof v.id !== 'string' || !isMs(v.endedAt) || !isBudgetMs(v.budgetMs) || !Array.isArray(v.entries)) return null;
  const entries = v.entries.map(parseEntry);
  return entries.every((e) => e !== null) ? { id: v.id, endedAt: v.endedAt, budgetMs: v.budgetMs, entries } : null;
}

function parseCurrent(v: unknown): CurrentSession | null {
  if (!isRecord(v) || !isMs(v.startedAt) || !isBudgetMs(v.budgetMs) || !isStrings(v.order) || !isRecord(v.spoken)) return null;
  const { activeId, activeSince } = v;
  if (activeId !== null && typeof activeId !== 'string') return null;
  if (activeSince !== null && (!isMs(activeSince) || activeId === null)) return null;
  const entries = Object.entries(v.spoken);
  if (!entries.every(([, ms]) => isMs(ms))) return null;
  return {
    startedAt: v.startedAt,
    budgetMs: v.budgetMs,
    order: v.order,
    spoken: Object.fromEntries(entries) as Record<string, number>,
    activeId,
    activeSince,
  };
}

function parseListTurns(v: unknown): ListTurns | null {
  if (!isRecord(v) || !isBudgetMs(v.budgetMs) || !Number.isInteger(v.minDays) || (v.minDays as number) < 1) return null;
  if (!isStrings(v.absent) || !Array.isArray(v.sessions)) return null;
  const sessions = v.sessions.map(parseSession);
  if (!sessions.every((s) => s !== null)) return null;
  const current = v.current === null ? null : parseCurrent(v.current);
  if (v.current !== null && !current) return null;
  return { budgetMs: v.budgetMs, minDays: v.minDays as number, absent: v.absent, sessions, current };
}

/** Keeps the valid lists, and only those in `listIds` when given (turn data of a deleted list goes away). */
export function parseTurnsStore(data: unknown, listIds?: readonly string[]): TurnsStore {
  if (!isRecord(data)) return {};
  const store: TurnsStore = {};
  for (const [id, value] of Object.entries(data)) {
    if (listIds && !listIds.includes(id)) continue;
    const parsed = parseListTurns(value);
    if (parsed) store[id] = parsed;
  }
  return store;
}
