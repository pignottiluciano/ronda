// A short message that is both announced (live region) and shown, wherever the user is: the status line
// inside the results panel is hidden in the Turns and Ranking modes, so it cannot carry feedback on its own.
const toast = document.getElementById('toast')!;
let timer: number | undefined;

export function notify(message: string) {
  toast.textContent = message;
  clearTimeout(timer);
  if (message) timer = window.setTimeout(() => (toast.textContent = ''), 6000);
}
