// Floats the "speaking now" card in a Picture-in-Picture window (Document PiP: Chrome and Edge on desktop).
// The card is moved, not cloned, so the controller keeps painting and its buttons keep working.
interface DocumentPip {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

const pipApi = () => (window as unknown as { documentPictureInPicture?: DocumentPip }).documentPictureInPicture;

export const floatSupported = () => pipApi() !== undefined;

interface FloatOptions {
  card: HTMLElement;
  /** Stays in the page, in the card's place, while the card floats. */
  slot: HTMLElement;
  /** Fired after the card moved out or came back. */
  onChange(): void;
}

export function createFloat({ card, slot, onChange }: FloatOptions) {
  let win: Window | null = null;

  function restore() {
    if (!win) return;
    win = null;
    slot.before(card);
    slot.hidden = true;
    delete card.dataset.floating;
    onChange();
  }

  /** Resolves false when the window could not open (blocked, or not from a click). */
  async function open(): Promise<boolean> {
    if (win) return true;
    const api = pipApi();
    if (!api) return false;
    try {
      const next = await api.requestWindow({ width: 360, height: 300 });
      // The page's own styles and theme, so the card looks the same out there.
      for (const sheet of document.querySelectorAll('link[rel="stylesheet"], style')) next.document.head.append(sheet.cloneNode(true));
      for (const { name, value } of document.documentElement.attributes) next.document.documentElement.setAttribute(name, value);
      next.document.title = document.title;
      next.document.body.className = 'float-body';
      next.document.body.append(card);
      card.dataset.floating = 'true';
      slot.hidden = false;
      win = next;
      next.addEventListener('pagehide', restore);
      onChange();
      return true;
    } catch {
      return false;
    }
  }

  function close() {
    const closing = win;
    restore();
    closing?.close();
  }

  return { open, close, isOpen: () => win !== null, window: () => win };
}
