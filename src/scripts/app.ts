import {
  draw,
  formatResult,
  hasDuplicates,
  parseParticipants,
  validateDraw,
  type DrawResult,
} from '../lib/draw';
import { messages } from '../i18n/messages';
import { activeList, addList, removeList, renameList, setActive, updateList } from '../lib/lists';
import { readStore, writeStore } from './storage';
import { shareText } from './share';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const form = $<HTMLFormElement>('draw-form');
const names = $<HTMLTextAreaElement>('names');
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

const t = messages[document.documentElement.lang === 'en' ? 'en' : 'es'];
const NAMES_HINT = t.namesHint;
const emptyState = output.firstElementChild!.cloneNode(true);
let store = readStore(t.defaultListName(1));
let last: DrawResult | null = null;

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
      const count = parseParticipants(list.names).length;
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

function save() {
  store = updateList(store, activeList(store).id, {
    names: names.value,
    groups: Math.max(1, parseInt(groups.value, 10) || 1),
  });
  persist();
  renderTabs();
}

function updateCount() {
  const list = parseParticipants(names.value);
  count.textContent = t.participant(list.length);
  const duplicated = hasDuplicates(list);
  namesHint.textContent = duplicated ? t.duplicatesHint : NAMES_HINT;
  namesHint.classList.toggle('is-warning', duplicated);
}

function showError(message: string | null) {
  error.textContent = message ?? '';
  error.hidden = !message;
  names.setAttribute('aria-invalid', String(Boolean(message) && parseParticipants(names.value).length < 2));
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
  const list = parseParticipants(names.value);
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
  names.value = list.names;
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

function onInputChange() {
  updateCount();
  save();
  markStale();
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
  names.value = '';
  showError(null);
  onInputChange();
  names.focus();
});

names.addEventListener('input', onInputChange);
groups.addEventListener('input', () => {
  save();
  markStale();
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-step]')) {
  button.addEventListener('click', () => {
    const max = Math.max(1, parseParticipants(names.value).length);
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
  persist();
  loadActive();
  setStatus(t.listDeleted(name));
});

loadActive();
