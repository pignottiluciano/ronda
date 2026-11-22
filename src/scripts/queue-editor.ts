// "Fila de hoy": the list in speaking order, editable before a day starts. Rows move with a drag handle or the up/down
// buttons, and the away toggle is the same as the badge one. This module only draws and reports; app.ts owns the order and
// turns.ts owns the absences and the announcements.
import { messages } from '../i18n/messages';
import { ICONS } from '../lib/icons';
import type { Person } from '../lib/lists';

const t = messages[document.documentElement.lang === 'en' ? 'en' : 'es'];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

type Act = 'away' | 'up' | 'down';

export interface QueueEditorOptions {
  list: HTMLOListElement;
  onMove(id: string, toIndex: number): void;
  onToggleAway(id: string): void;
}

export function createQueueEditor({ list, onMove, onToggleAway }: QueueEditorOptions) {
  // Rows slide to their new place (FLIP): note where each row was, change the DOM, then animate from the old spot.
  // Offsets are taken from the list's top, so text above the list changing height does not move the rows.
  type Tops = Map<string, number>;
  let carried: Tops | null = null; // where the rows were when a drag ended, for the redraw that follows

  function tops(): Tops {
    const base = list.getBoundingClientRect().top;
    return new Map([...list.children].map((li) => [(li as HTMLElement).dataset.id!, li.getBoundingClientRect().top - base]));
  }

  function slide(from: Tops) {
    if (reduceMotion.matches) return;
    const now = tops();
    for (const li of list.children as HTMLCollectionOf<HTMLElement>) {
      const dy = (from.get(li.dataset.id!) ?? 0) - now.get(li.dataset.id!)!;
      if (Math.abs(dy) > 0.5) li.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    }
  }

  function button(act: Act, label: string, icon: string, disabled = false) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = act === 'away' ? 'queue-away' : 'queue-move';
    b.dataset.act = act;
    b.disabled = disabled;
    b.setAttribute('aria-label', label);
    b.innerHTML = icon;
    return b;
  }

  function row(person: Person, index: number, total: number, away: boolean) {
    const li = document.createElement('li');
    li.className = 'queue-row';
    li.dataset.id = person.id;
    li.classList.toggle('is-away', away);
    const handle = document.createElement('span');
    handle.className = 'queue-handle';
    handle.setAttribute('aria-hidden', 'true'); // the arrows are the keyboard and screen reader way
    handle.innerHTML = ICONS.grip;
    const name = document.createElement('span');
    name.className = 'queue-name';
    name.textContent = person.name;
    const toggle = button('away', away ? t.awayBackToggle(person.name) : t.awayToggle(person.name), ICONS.away);
    toggle.setAttribute('aria-pressed', String(away));
    li.append(
      handle,
      name,
      toggle,
      button('up', t.queueUp(person.name), ICONS.up, index === 0),
      button('down', t.queueDown(person.name), ICONS.down, index === total - 1),
    );
    return li;
  }

  /** Rebuilds the rows; the focused control goes back to the same person (to the other arrow if its own got disabled). */
  function render(people: readonly Person[], absent: ReadonlySet<string>) {
    const focused = document.activeElement instanceof HTMLElement && list.contains(document.activeElement) ? document.activeElement : null;
    const focusedId = focused?.closest<HTMLElement>('.queue-row')?.dataset.id;
    const focusedAct = focused?.dataset.act as Act | undefined;
    const from = carried ?? tops();
    list.replaceChildren(...people.map((p, i) => row(p, i, people.length, absent.has(p.id))));
    slide(from);
    if (!focusedId || !focusedAct) return;
    const target = list.querySelector<HTMLElement>(`[data-id="${CSS.escape(focusedId)}"]`);
    const own = target?.querySelector<HTMLButtonElement>(`[data-act="${focusedAct}"]`);
    const other = target?.querySelector<HTMLButtonElement>(`[data-act="${focusedAct === 'up' ? 'down' : 'up'}"]`);
    (own && !own.disabled ? own : other)?.focus();
  }

  const indexOf = (id: string) => [...list.children].findIndex((li) => (li as HTMLElement).dataset.id === id);

  list.addEventListener('click', (event) => {
    const b = (event.target as Element).closest<HTMLButtonElement>('button[data-act]');
    const id = b?.closest<HTMLElement>('.queue-row')?.dataset.id;
    if (!b || !id) return;
    if (b.dataset.act === 'away') onToggleAway(id);
    else onMove(id, indexOf(id) + (b.dataset.act === 'up' ? -1 : 1));
  });

  // Drag from the handle. The list holds the pointer capture, so the row can move in the DOM while the pointer is down;
  // the order is reported once, on release. A cancelled pointer puts everything back.
  list.addEventListener('pointerdown', (event) => {
    const handle = (event.target as Element).closest('.queue-handle');
    const dragged = handle?.closest<HTMLElement>('.queue-row');
    if (!dragged || event.button !== 0) return;
    event.preventDefault();
    const id = dragged.dataset.id!;
    const before = [...list.children];
    list.setPointerCapture(event.pointerId);
    dragged.classList.add('is-dragging');
    const middle = (el: Element) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
    const onMoveEvent = (ev: PointerEvent) => {
      // A fast pointer can cross several rows between two events.
      const from = tops();
      for (let prev; (prev = dragged.previousElementSibling) && ev.clientY < middle(prev);) list.insertBefore(dragged, prev);
      for (let next; (next = dragged.nextElementSibling) && ev.clientY > middle(next);) list.insertBefore(next, dragged);
      slide(from);
    };
    const end = (ev: PointerEvent) => {
      list.removeEventListener('pointermove', onMoveEvent);
      list.removeEventListener('pointerup', end);
      list.removeEventListener('pointercancel', end);
      dragged.classList.remove('is-dragging');
      const to = indexOf(id);
      const from = tops();
      list.replaceChildren(...before); // back to the saved order; onMove redraws from the store
      if (ev.type === 'pointerup' && to !== before.indexOf(dragged)) {
        carried = from; // the redraw slides from where the drag left the rows, not from the saved order
        onMove(id, to);
        carried = null;
      } else slide(from);
    };
    list.addEventListener('pointermove', onMoveEvent);
    list.addEventListener('pointerup', end);
    list.addEventListener('pointercancel', end);
  });

  return { render };
}
