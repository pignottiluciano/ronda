// Backup UI: export everything to a JSON file, import one back. The format and the merge rules live in src/lib/backup.ts.
import { messages } from '../i18n/messages';
import { applyImport, createBackup, MAX_BACKUP_BYTES, parseBackup, planImport, type BackupError } from '../lib/backup';
import { confirmAction } from './confirm';
import { notify } from './notify';
import { downloadBlob } from './share';
import { readStore, readTurns, writeStore, writeTurns } from './storage';

export const NOTICE_KEY = 'ronda.notice'; // shown once after the page reloads with the imported data

const t = messages[document.documentElement.lang === 'en' ? 'en' : 'es'];
const fileInput = document.getElementById('backup-file') as HTMLInputElement;
const errors: Record<BackupError, string> = {
  json: t.backupErrorJson,
  format: t.backupErrorFormat,
  version: t.backupErrorVersion,
  size: t.backupErrorSize,
};

// App state is saved on every change, so what is stored is what is on screen.
function current() {
  const store = readStore(t.defaultListName(1));
  return { store, turns: readTurns(store.lists.map((list) => list.id)) };
}

document.getElementById('backup-export')!.addEventListener('click', () => {
  const { store, turns } = current();
  const backup = createBackup(store, turns, Date.now());
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  notify(downloadBlob(blob, t.backupFile(date)) ? t.backupExported(store.lists.length) : t.saveFailed);
});

document.getElementById('backup-import')!.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = ''; // so choosing the same file again fires change again
  if (!file) return;
  if (file.size > MAX_BACKUP_BYTES) return notify(t.backupErrorSize);
  let text: string;
  try {
    text = await file.text();
  } catch {
    return notify(t.backupErrorRead);
  }
  const parsed = parseBackup(text);
  if (!parsed.ok) return notify(errors[parsed.error]);

  const { store, turns } = current();
  const plan = planImport(store, turns, parsed.backup);
  const confirmed = await confirmAction({ title: t.backupConfirmTitle, body: t.backupConfirmBody(plan.replace, plan.add, plan.untouched), confirm: t.backupConfirmOk });
  if (!confirmed) return;

  const next = applyImport(store, turns, parsed.backup);
  if (!writeStore(next.store) || !writeTurns(next.turns)) return notify(t.saveFailed);
  try {
    sessionStorage.setItem(NOTICE_KEY, t.backupImported(parsed.backup.lists.length));
  } catch {
    // The page reloads anyway; it just will not say so.
  }
  location.reload(); // every module reads its data on load, so this is the one way they all agree
});
