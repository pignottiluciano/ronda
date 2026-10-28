// Ranking UI: podium, table, history and settings for one list. The maths lives in src/lib/turns.ts;
// turns.ts owns the stored data and hands it over through `RankingHost`.
import { messages } from '../i18n/messages';
import type { SavedList } from '../lib/lists';
import { MAX_MIN_DAYS, ranking, removeSession, resetSessions, setMinDays, type ListTurns, type Ranking, type Session } from '../lib/turns';
import { confirmAction } from './confirm';
import { shareImage } from './share';
import { MAX_IMAGE_ROWS, renderRankingImage } from './share-image';

export interface RankingHost {
  list(): SavedList;
  turns(): ListTurns;
  update(next: ListTurns): void;
  say(message: string): void;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const lang = document.documentElement.lang === 'en' ? 'en' : 'es';
const t = messages[lang];
const dayFormat = new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short' });
const percentOf = (score: number) => Math.round(score * 100);

export function initRanking(host: RankingHost) {
  const empty = $('rank-empty');
  const body = $('rank-body');
  const meta = $('rank-meta');
  const podium = $('podium');
  const none = $('rank-none');
  const table = $('rank-table');
  const rows = $('rank-rows');
  const few = $('rank-few');
  const fewHint = $('rank-few-hint');
  const fewList = $('rank-few-list');
  const history = $('history');
  const minDays = $<HTMLInputElement>('min-days');
  const shareButton = $<HTMLButtonElement>('rank-share');
  const resetButton = $<HTMLButtonElement>('rank-reset');
  // Drawn ahead of the click: sharing must start inside the tap, and fonts and canvas take a moment.
  let prepared: Promise<Blob> | null = null;

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function renderPodium(top: Ranking['rows']) {
    // Lowest in the middle, second on the left, third on the right.
    const slots = [top[1], top[0], top[2]].filter((row): row is Ranking['rows'][number] => row !== undefined);
    podium.replaceChildren(
      ...slots.map((row) => {
        const item = el('div', 'podium-item');
        item.dataset.pos = String(row.position);
        item.append(el('span', 'podium-av', ([...row.name][0] ?? '').toLocaleUpperCase()), el('span', 'podium-name', row.name), el('span', 'podium-step', `${percentOf(row.score)}%`));
        return item;
      }),
    );
    podium.hidden = slots.length === 0;
  }

  function renderRows(list: Ranking['rows']) {
    rows.replaceChildren(
      ...list.map((row) => {
        const tr = el('tr');
        tr.dataset.first = String(row.position === 1);
        const avg = el('td');
        avg.title = t.rankAvgLabel(percentOf(row.score));
        const cell = el('div', 'rank-avg');
        const bar = el('span', 'bar');
        const fill = el('i');
        fill.style.transform = `scaleX(${Math.min(1, row.score)})`;
        bar.append(fill);
        cell.append(bar, el('span', undefined, `${percentOf(row.score)}%`));
        avg.append(cell);
        tr.append(el('td', undefined, String(row.position)), el('td', undefined, row.name), avg, el('td', undefined, String(row.days)));
        return tr;
      }),
    );
  }

  const dateOf = (session: Session) => dayFormat.format(new Date(session.endedAt));

  function renderHistory(turns: ListTurns) {
    history.replaceChildren(
      ...[...turns.sessions].reverse().map((session) => {
        const item = el('li');
        const present = session.entries.filter((e) => !e.absent).length;
        const remove = el('button', 'icon-btn');
        remove.type = 'button';
        remove.dataset.id = session.id;
        remove.setAttribute('aria-label', t.rankDeleteDay(dateOf(session)));
        remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>';
        item.append(el('span', undefined, t.rankDay(dateOf(session), present, session.entries.length)), remove);
        return item;
      }),
    );
  }

  function prepareImage(list: SavedList, rk: Ranking, turns: ListTurns) {
    if (rk.rows.length === 0) return null;
    const shown = rk.rows.slice(0, MAX_IMAGE_ROWS);
    const last = turns.sessions.at(-1);
    const image = renderRankingImage({
      title: list.name,
      subtitle: t.imageSubtitle,
      dateLabel: last ? dayFormat.format(new Date(last.endedAt)) : '',
      rows: shown.map((row) => ({ position: row.position, name: row.name, percent: `${percentOf(row.score)}%`, days: t.imageDays(row.days) })),
      more: rk.rows.length > shown.length ? t.imageMore(rk.rows.length - shown.length) : null,
      footer: location.host,
    });
    image.catch(() => {}); // reported when someone actually asks for it
    return image;
  }

  function render() {
    const list = host.list();
    const turns = host.turns();
    const has = turns.sessions.length > 0;
    empty.hidden = has;
    body.hidden = !has;
    resetButton.hidden = !has;
    shareButton.hidden = true;
    minDays.value = String(turns.minDays);
    prepared = null;
    if (!has) return;

    const rk = ranking(turns, list.people);
    meta.textContent = t.rankMeta(turns.sessions.length, turns.minDays);
    none.hidden = rk.rows.length > 0;
    table.hidden = rk.rows.length === 0;
    renderPodium(rk.rows.slice(0, 3));
    renderRows(rk.rows);
    few.hidden = rk.fewData.length === 0;
    fewHint.textContent = t.rankFewHint(turns.minDays);
    fewList.replaceChildren(...rk.fewData.map((row) => el('li', undefined, `${row.name} · ${t.imageDays(row.days)}`)));
    renderHistory(turns);
    prepared = prepareImage(list, rk, turns);
    shareButton.hidden = prepared === null;
  }

  shareButton.addEventListener('click', async () => {
    if (!prepared) return;
    try {
      const outcome = await shareImage(await prepared, t.imageFile, host.list().name);
      if (outcome === 'shared') host.say(t.imageDone);
      else if (outcome === 'downloaded') host.say(t.imageDownloaded);
      else if (outcome === 'failed') host.say(t.imageFailed);
    } catch {
      host.say(t.imageFailed);
    }
  });

  minDays.max = String(MAX_MIN_DAYS);
  minDays.addEventListener('change', () => host.update(setMinDays(host.turns(), Number(minDays.value)))); // invalid: the field goes back

  history.addEventListener('click', async (event) => {
    const button = (event.target as Element).closest<HTMLElement>('button[data-id]');
    const session = button && host.turns().sessions.find((s) => s.id === button.dataset.id);
    if (!session) return;
    const date = dateOf(session);
    if (!(await confirmAction({ title: t.rankDayDeleteTitle(date), body: t.rankDayDeleteBody, confirm: t.rankDayDeleteConfirm }))) return;
    host.update(removeSession(host.turns(), session.id));
    host.say(t.rankDayDeleted(date));
  });

  resetButton.addEventListener('click', async () => {
    if (!(await confirmAction({ title: t.rankResetTitle, body: t.rankResetBody, confirm: t.rankResetConfirm }))) return;
    host.update(resetSessions(host.turns()));
    host.say(t.rankResetDone);
  });

  return { render };
}
