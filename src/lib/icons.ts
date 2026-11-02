// Inline SVG icons shared by the app scripts, the page markup and the help page, so each glyph is drawn once.
// They inherit the text color and are aria-hidden: the control or the help text names them.

const stroke = (body: string, width = '1.75') =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  clock: stroke('<circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6" />'),
  pencil: stroke('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />'),
  trash: stroke('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />'),
  away: stroke('<circle cx="12" cy="12" r="8" /><path d="M6.3 6.3l11.4 11.4" />'),
  x: stroke('<path d="M7 7l10 10M17 7 7 17" />', '2'),
  up: stroke('<path d="m6 15 6-6 6 6" />', '2'),
  down: stroke('<path d="m6 9 6 6 6-6" />', '2'),
  grip: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M7 4.5v15l12-7.5z" /></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z" /></svg>',
} as const;

export type IconName = keyof typeof ICONS;
