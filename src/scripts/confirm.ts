// One confirmation dialog for destructive actions. Resolves to true only when the confirm button is pressed.
interface Options {
  title: string;
  body: string;
  confirm: string;
}

export function confirmAction({ title, body, confirm }: Options): Promise<boolean> {
  const dialog = document.getElementById('confirm-dialog') as HTMLDialogElement;
  document.getElementById('confirm-title')!.textContent = title;
  document.getElementById('confirm-body')!.textContent = body;
  document.getElementById('confirm-ok')!.textContent = confirm;
  dialog.returnValue = '';
  dialog.showModal();
  // Cancel, Escape and a click outside all close it with another return value.
  return new Promise((resolve) => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true }));
}
