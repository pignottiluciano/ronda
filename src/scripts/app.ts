import {
  draw,
  formatResult,
  hasDuplicates,
  parseParticipants,
  validateDraw,
  type DrawResult,
} from '../lib/draw';
import { readPreferences, writePreferences } from './storage';
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

const NAMES_HINT = namesHint.textContent ?? '';
let last: DrawResult | null = null;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function setStatus(message: string) {
  status.textContent = message;
}

function save() {
  const ok = writePreferences({ names: names.value, groups: Math.max(1, parseInt(groups.value, 10) || 1) });
  if (!ok) setStatus('No se pudo guardar la lista en este navegador. El sorteo funciona igual.');
}

function updateCount() {
  const list = parseParticipants(names.value);
  count.textContent = plural(list.length, 'participante', 'participantes');
  const duplicated = hasDuplicates(list);
  namesHint.textContent = duplicated ? 'Hay nombres repetidos: se sortean como entradas distintas.' : NAMES_HINT;
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
    title.textContent = `Grupo ${i + 1}`;
    const size = document.createElement('span');
    size.className = 'group-size';
    size.textContent = plural(members.length, 'integrante', 'integrantes');
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
  const message = validateDraw(list.length, groupCount);
  showError(message);
  if (message) return false;
  last = draw(list, groupCount);
  render(last);
  setStatus(
    groupCount === 1
      ? `Orden listo: ${plural(list.length, 'participante', 'participantes')}.`
      : `${groupCount} grupos listos con ${list.length} participantes.`,
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
  setStatus('La lista cambió. Sorteá de nuevo para actualizar el resultado.');
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
  const outcome = await shareText(formatResult(last));
  if (outcome === 'copied') setStatus('Resultado copiado al portapapeles.');
  if (outcome === 'failed') setStatus('No se pudo compartir ni copiar. Seleccioná el resultado y copialo a mano.');
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

const saved = readPreferences();
if (saved) {
  names.value = saved.names;
  groups.value = String(saved.groups);
}
updateCount();
