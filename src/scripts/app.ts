import { draw, formatResult, validateDraw, type DrawResult } from '../lib/draw';
import { messages } from '../i18n/messages';
import {
  MAX_PEOPLE, activeList, addList, addPeople, clearPeople, nameKey, removeList, removePerson, renameList, renamePerson, setActive,
  setTurns, updateList,
  type ListStore, type Person,
} from '../lib/lists';
import { readStore, writeStore } from './storage';
import { shareText } from './share';
import { initTurns } from './turns';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const form = $<HTMLFormElement>('draw-form');
const tagbox = $('people');
const personInput = $<HTMLInputElement>('person-input');
const inputItem = personInput.parentElement!;
const groups = $<HTMLInputElement>('groups');
const count = $('count');
const namesHint = $('names-hint');
const error = $('error');
const results = $('results');
const output = $('output');
const resultActions = $('result-actions');
const status = $('status');
const tabs = $('tabs');
const listName = $('list-name');
const listNameInput = $<HTMLInputElement>('list-name-input');
const saved = $('saved');
const deleteDialog = $<HTMLDialogElement>('delete-dialog');
const turnsToggle = $<HTMLButtonElement>('turns-toggle');

const t = messages[document.documentElement.lang === 'en' ? 'en' : 'es'];
const emptyState = output.firstElementChild!.cloneNode(true);
let store = readStore(t.defaultListName(1));
let last: DrawResult | null = null;
let shown = new Set<string>(); // person ids already on screen, so only new badges animate
let selectedId: string | null = null; // badge selected by the first Backspace

const turns = initTurns({
  list: () => activeList(store),
  listIds: () => store.lists.map((list) => list.id),
  drawOrder: () => {
    if (last?.length !== 1) return [];
    const byName = new Map(people().map((p) => [nameKey(p.name), p.id]));
    return last[0]!.flatMap((name) => byName.get(nameKey(name)) ?? []);
  },
  say: (message) => setStatus(message),
  absenceChanged: () => {
    renderPeople();
    updateCount();
    markStale();
  },
});

function setStatus(message: string) {
  status.textContent = message;
}

function persist() {
  const ok = writeStore(store);
  saved.hidden = !ok;
  if (!ok) setStatus(t.saveFailed);
}

// Names are set as text, never as HTML.
function renderTabs(scrollToActive = false) {
  tabs.replaceChildren(
    ...store.lists.map((list) => {
      const count = list.people.length;
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'tab';
      tab.dataset.id = list.id;
      tab.setAttribute('aria-label', `${list.name}, ${t.participant(count)}`);
      if (list.id === store.activeId) tab.setAttribute('aria-current', 'true');
      const small = document.createElement('small');
      small.textContent = String(count);
      tab.append(list.name, small);
      return tab;
    }),
  );
  if (scrollToActive) tabs.querySelector('[aria-current]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

const people = () => activeList(store).people;

function save() {
  store = updateList(store, activeList(store).id, { groups: Math.max(1, parseInt(groups.value, 10) || 1) });
  persist();
  renderTabs();
}

const present = () => people().filter((p) => !turns.absent().has(p.id));

function updateCount() {
  const away = people().length - present().length;
  count.textContent = away ? t.participantsAway(present().length, away) : t.participant(people().length);
}

/** Shows a problem under the box (and announces it), or restores the usual hint. */
function warn(message: string | null) {
  namesHint.textContent = message ?? t.peopleHint;
  namesHint.classList.toggle('is-warning', Boolean(message));
  if (message) setStatus(message);
}

function showError(message: string | null) {
  error.textContent = message ?? '';
  error.hidden = !message;
  personInput.setAttribute('aria-invalid', String(Boolean(message) && present().length < 2));
}

// Names are set as text, never as HTML.
function chip(person: Person): HTMLElement {
  const item = document.createElement('li');
  item.className = 'person';
  item.dataset.id = person.id;
  item.classList.toggle('is-new', !shown.has(person.id));
  item.classList.toggle('is-selected', person.id === selectedId);
  const away = turns.absent().has(person.id);
  item.classList.toggle('is-away', away);
  const name = document.createElement('button');
  name.type = 'button';
  name.className = 'person-name';
  name.textContent = person.name;
  name.setAttribute('aria-label', t.personEdit(person.name));
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'person-x';
  remove.textContent = '×';
  remove.setAttribute('aria-label', t.personRemove(person.name));
  if (activeList(store).turns) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'person-away';
    toggle.setAttribute('aria-pressed', String(away));
    toggle.setAttribute('aria-label', away ? t.awayBackToggle(person.name) : t.awayToggle(person.name));
    toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="12" cy="12" r="8" /><path d="M6.3 6.3l11.4 11.4" /></svg>';
    item.append(name, toggle, remove);
  } else item.append(name, remove);
  return item;
}

// Badges are replaced around the input, never the input itself, so it keeps focus.
function renderPeople() {
  tagbox.querySelectorAll('.person').forEach((node) => node.remove());
  inputItem.before(...people().map(chip));
  shown = new Set(people().map((p) => p.id));
}

function commit(next: ListStore) {
  store = next;
  persist();
  renderTabs();
  turns.refresh(); // drops people who left from the day in progress
  renderPeople();
  updateCount();
  markStale();
}

function select(id: string | null) {
  selectedId = id;
  renderPeople();
}

/** Adds what is new, reports what was skipped. Returns whether anything was added. */
function addNames(raw: string[]): boolean {
  const { store: next, added, skipped } = addPeople(store, activeList(store).id, raw);
  const single = raw.length === 1 ? (people().length >= MAX_PEOPLE ? t.peopleFull(MAX_PEOPLE) : t.personExists(skipped[0] ?? raw[0]!)) : null;
  const problem = skipped.length ? (single ?? t.peopleSkipped(skipped.length)) : null;
  if (added.length) commit(next);
  warn(problem);
  if (added.length) {
    const done = added.length === 1 ? t.personAdded(added[0]!) : t.peopleAdded(added.length);
    setStatus(problem ? `${done} ${problem}` : done); // one announcement, not two that cut each other off
  }
  return added.length > 0;
}

function startEdit(item: HTMLElement) {
  const person = people().find((p) => p.id === item.dataset.id);
  if (!person) return;
  const input = document.createElement('input');
  input.className = 'person-edit';
  input.value = person.name;
  input.maxLength = 40;
  input.size = Math.max(6, person.name.length + 1);
  input.setAttribute('aria-label', t.personEditLabel(person.name));
  item.replaceChildren(input);
  input.focus();
  input.select();
  let finished = false; // Enter re-renders, and removing the focused input fires blur too
  const finish = (apply: boolean) => {
    if (finished) return;
    finished = true;
    const value = input.value.trim();
    if (apply && value && value !== person.name) {
      const result = renamePerson(store, activeList(store).id, person.id, value);
      if (result.error === 'duplicate') warn(t.personExists(value));
      else {
        commit(result.store);
        setStatus(t.personRenamed(person.name, value));
        return;
      }
    }
    renderPeople();
  };
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    event.preventDefault();
    finish(event.key === 'Enter');
    tagbox.querySelector<HTMLElement>(`[data-id="${person.id}"] .person-name`)?.focus();
  });
}

/** `fromInput`: removed with Backspace, so the focus stays in the input for the next one. */
function removeAt(id: string, fromInput = false) {
  const index = people().findIndex((p) => p.id === id);
  const person = people()[index];
  if (!person) return;
  selectedId = null;
  commit(removePerson(store, activeList(store).id, id));
  setStatus(t.personRemoved(person.name));
  const nextPerson = people()[Math.min(index, people().length - 1)];
  const target = !fromInput && nextPerson && tagbox.querySelector<HTMLElement>(`[data-id="${nextPerson.id}"] .person-name`);
  (target || personInput).focus();
}

function staggered<T extends HTMLElement>(node: T, index: number): T {
  node.classList.add('enter');
  node.style.setProperty('--i', String(index));
  return node;
}

// Names are always set via textContent, never as HTML.
function renderOrder(order: string[]): HTMLElement {
  const list = document.createElement('ol');
  list.className = 'order';
  list.setAttribute('role', 'list'); // list-style: none drops list semantics in Safari
  order.forEach((name, i) => {
    const item = document.createElement('li');
    item.textContent = name;
    list.append(staggered(item, i));
  });
  return list;
}

function renderGroups(result: DrawResult): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'groups';
  result.forEach((members, i) => {
    const card = document.createElement('article');
    card.className = 'group';
    const header = document.createElement('header');
    const title = document.createElement('h3');
    title.textContent = t.group(i + 1);
    const size = document.createElement('span');
    size.className = 'group-size';
    size.textContent = t.member(members.length);
    header.append(title, size);
    const list = document.createElement('ul');
    for (const name of members) {
      const item = document.createElement('li');
      item.textContent = name;
      list.append(item);
    }
    card.append(header, list);
    grid.append(staggered(card, i));
  });
  return grid;
}

// The empty state is server-rendered; once a draw exists it is only replaced, never restored.
function render(result: DrawResult) {
  output.replaceChildren(result.length === 1 ? renderOrder(result[0]!) : renderGroups(result));
  resultActions.hidden = false;
  results.classList.remove('is-stale');
}

function runDraw(): boolean {
  const list = present().map((p) => p.name);
  const groupCount = Number(groups.value);
  const problem = validateDraw(list.length, groupCount);
  showError(problem && (problem === 'max' ? t.errorMax(list.length) : problem === 'min' ? t.errorMin : t.errorInteger));
  if (problem) return false;
  last = draw(list, groupCount);
  render(last);
  setStatus(
    groupCount === 1 ? t.doneOrder(list.length) : t.doneGroups(groupCount, list.length),
  );
  return true;
}

function scrollToResults() {
  // Desktop shows results side by side; only stacked layouts need to scroll.
  if (!matchMedia('(max-width: 899px)').matches) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  results.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

function markStale() {
  if (!last || results.classList.contains('is-stale')) return;
  results.classList.add('is-stale');
  setStatus(t.stale);
}

// Switching lists drops the previous result: it belonged to another list.
function loadActive() {
  const list = activeList(store);
  shown = new Set(list.people.map((p) => p.id)); // switching lists is not an entrance
  selectedId = null;
  personInput.value = '';
  warn(null);
  turnsToggle.setAttribute('aria-pressed', String(list.turns));
  turns.open();
  renderPeople();
  groups.value = String(list.groups);
  listName.textContent = list.name;
  last = null;
  output.replaceChildren(emptyState.cloneNode(true));
  resultActions.hidden = true;
  results.classList.remove('is-stale');
  showError(null);
  setStatus('');
  updateCount();
  renderTabs(true);
}

function startRename() {
  listNameInput.value = activeList(store).name;
  listName.hidden = true;
  listNameInput.hidden = false;
  listNameInput.focus();
  listNameInput.select();
}

function finishRename(apply: boolean) {
  if (listNameInput.hidden) return; // Enter hides the input, which then also fires blur
  listNameInput.hidden = true;
  listName.hidden = false;
  if (!apply) return;
  store = renameList(store, activeList(store).id, listNameInput.value);
  persist();
  listName.textContent = activeList(store).name;
  renderTabs(true);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (runDraw()) scrollToResults();
});

$('again').addEventListener('click', runDraw);

$('share').addEventListener('click', async () => {
  if (!last) return;
  const outcome = await shareText(formatResult(last, t.group));
  if (outcome === 'copied') setStatus(t.copied);
  if (outcome === 'failed') setStatus(t.shareFailed);
});

$('clear').addEventListener('click', () => {
  showError(null);
  selectedId = null;
  commit(clearPeople(store, activeList(store).id));
  personInput.focus();
});

personInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault(); // inside the form, Enter would draw
    const value = personInput.value.trim();
    if (value && addNames([value])) personInput.value = '';
  } else if (event.key === 'Backspace' && !personInput.value) {
    const lastPerson = people().at(-1);
    if (!lastPerson) return;
    event.preventDefault();
    if (selectedId) removeAt(selectedId, true);
    else {
      select(lastPerson.id);
      setStatus(t.personSelected(lastPerson.name));
    }
  } else if (event.key === 'Escape') {
    personInput.value = '';
    warn(null);
  } else if (selectedId && event.key !== 'Shift') {
    select(null);
  }
});

personInput.addEventListener('input', () => {
  if (namesHint.classList.contains('is-warning')) warn(null);
});

// Not a re-render: it could swallow the click that caused the blur (the x of a badge).
personInput.addEventListener('blur', () => {
  selectedId = null;
  tagbox.querySelector('.is-selected')?.classList.remove('is-selected');
});

personInput.addEventListener('paste', (event) => {
  const text = event.clipboardData?.getData('text') ?? '';
  if (!/[\r\n]/.test(text.trim())) return; // a single name pastes into the input as usual
  event.preventDefault();
  addNames(text.split(/\r?\n/));
});

tagbox.addEventListener('click', (event) => {
  const target = event.target as Element;
  const item = target.closest<HTMLElement>('.person');
  if (target.closest('.person-away') && item) turns.toggleAbsent(item.dataset.id!);
  else if (target.closest('.person-x') && item) removeAt(item.dataset.id!);
  else if (target.closest('.person-name') && item) startEdit(item);
  else if (!item) personInput.focus(); // clicking the empty part of the box
});
groups.addEventListener('input', () => {
  save();
  markStale();
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-step]')) {
  button.addEventListener('click', () => {
    const max = Math.max(1, present().length);
    const current = parseInt(groups.value, 10) || 1;
    groups.value = String(Math.min(max, Math.max(1, current + Number(button.dataset.step))));
    save();
    markStale();
  });
}

tabs.addEventListener('click', (event) => {
  const tab = (event.target as Element).closest<HTMLElement>('[data-id]');
  if (!tab || tab.dataset.id === store.activeId) return;
  store = setActive(store, tab.dataset.id!);
  persist();
  loadActive();
});

$('new-list').addEventListener('click', () => {
  store = addList(store, t.defaultListName(store.lists.length + 1));
  persist();
  loadActive();
  startRename();
});

turnsToggle.addEventListener('click', () => {
  const list = activeList(store);
  store = setTurns(store, list.id, !list.turns);
  persist();
  turnsToggle.setAttribute('aria-pressed', String(!list.turns));
  turns.refresh();
  renderPeople();
  updateCount();
  setStatus(list.turns ? t.turnsOff : t.turnsOn);
});

$('rename').addEventListener('click', startRename);
listNameInput.addEventListener('blur', () => finishRename(true));
listNameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    finishRename(true);
    $('rename').focus();
  } else if (event.key === 'Escape') {
    finishRename(false);
    $('rename').focus();
  }
});

$('delete').addEventListener('click', () => {
  $('delete-title').textContent = t.deleteTitle(activeList(store).name);
  deleteDialog.showModal();
});

deleteDialog.addEventListener('close', () => {
  const confirmed = deleteDialog.returnValue === 'delete';
  deleteDialog.returnValue = '';
  if (!confirmed) return;
  const { id, name } = activeList(store);
  store = removeList(store, id, t.defaultListName(1));
  turns.forget(id);
  persist();
  loadActive();
  setStatus(t.listDeleted(name));
});

loadActive();
