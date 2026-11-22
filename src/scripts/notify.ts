// A short message that is both announced (live region) and shown, wherever the user is: the status line
// inside the results panel is hidden in the Turns and Ranking modes, so it cannot carry feedback on its own.
// With `undo`, the message carries an "Undo" button for as long as it is on screen.
import { messages } from '../i18n/messages';

const t = messages[document.documentElement.lang === 'en' ? 'en' : 'es'];
const toast = document.getElementById('toast')!;
const SHOW_MS = 6000;
let timer: number | undefined;

function clear() {
  toast.replaceChildren();
}

// The message stays while the pointer or the keyboard is on it, so there is time to reach the button.
function arm() {
  clearTimeout(timer);
  if (toast.matches(':hover, :focus-within')) return;
  timer = window.setTimeout(clear, SHOW_MS);
}
toast.addEventListener('pointerleave', arm);
toast.addEventListener('focusout', arm);
toast.addEventListener('pointerenter', () => clearTimeout(timer));
toast.addEventListener('focusin', () => clearTimeout(timer));

export function notify(message: string, undo?: () => void) {
  clearTimeout(timer);
  if (!message) return clear();
  const text = document.createElement('span');
  text.textContent = message;
  if (!undo) {
    toast.replaceChildren(text);
  } else {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-undo';
    button.textContent = t.undo;
    button.addEventListener('click', () => {
      clear();
      undo();
    });
    toast.replaceChildren(text, button);
  }
  timer = window.setTimeout(clear, SHOW_MS);
}
