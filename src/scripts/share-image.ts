// Draws the ranking as a 1080x1350 (4:5) PNG, tall enough to read on a phone without being cropped by chat apps.
// It always uses the light palette (hex values of the tokens in global.css): the picture leaves the app.

export interface ImageRow {
  position: number;
  name: string;
  percent: string;
  days: string;
}

export interface ImageInput {
  title: string;
  subtitle: string;
  dateLabel: string;
  rows: ImageRow[]; // best first; the first three go on the podium
  more: string | null; // "and 5 more", when rows were left out
  footer: string;
}

export const IMAGE_WIDTH = 1080;
export const IMAGE_HEIGHT = 1350;
export const MAX_IMAGE_ROWS = 10; // podium plus table

const W = IMAGE_WIDTH;
const H = IMAGE_HEIGHT;
const PAD = 72;
const C = {
  bg: '#faf6f1', surface: '#fffdfb', ink: '#261d1a', muted: '#6e605a', line: '#e1d9d3',
  accent: '#bc442c', accentInk: '#b63d26', soft: '#ffe3d7', onAccent: '#fefbf8',
};

const cssVar = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function mark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const k = size / 32;
  const dots: [number, number, number][] = [[16, 5, 1], [25.5, 10.5, 1], [25.5, 21.5, 1], [16, 27, 1], [6.5, 21.5, 1], [6.5, 10.5, 0.4]];
  for (const [cx, cy, alpha] of dots) {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x + cx * k, y + cy * k, 3.2 * k, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export async function renderRankingImage(input: ImageInput): Promise<Blob> {
  const head = cssVar('--font-heading', 'Georgia, serif');
  const body = cssVar('--font-body', 'system-ui, sans-serif');
  // Web fonts are only drawn once loaded, and only for the characters they were asked about.
  const text = [input.title, input.subtitle, input.dateLabel, input.footer, ...input.rows.flatMap((r) => [r.name, r.percent, r.days])].join(' ');
  await Promise.all([`500 76px ${head}`, `600 52px ${head}`, `400 30px ${body}`, `600 32px ${body}`, `700 30px ${body}`].map((font) => document.fonts.load(font, text)));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = C.accent;
  mark(ctx, PAD, PAD, 48);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.ink;
  ctx.font = `600 40px ${head}`;
  ctx.textAlign = 'left';
  ctx.fillText('Ronda', PAD + 64, PAD + 38);
  ctx.fillStyle = C.muted;
  ctx.font = `400 30px ${body}`;
  ctx.textAlign = 'right';
  ctx.fillText(input.dateLabel, W - PAD, PAD + 36);

  // Title
  ctx.textAlign = 'left';
  ctx.fillStyle = C.ink;
  ctx.font = `500 76px ${head}`;
  ctx.fillText(fit(ctx, input.title, W - 2 * PAD), PAD, 262);
  ctx.fillStyle = C.muted;
  ctx.font = `400 30px ${body}`;
  ctx.fillText(fit(ctx, input.subtitle, W - 2 * PAD), PAD, 318);

  // Podium: lowest in the middle, then the second on the left and the third on the right.
  const colWidth = (W - 2 * PAD - 48) / 3;
  const slotX = [PAD + colWidth + 24, PAD, PAD + 2 * (colWidth + 24)];
  const baseY = 760;
  input.rows.slice(0, 3).forEach((row, index) => {
    const x = slotX[index]!;
    const first = row.position === 1;
    const stepHeight = row.position === 1 ? 220 : row.position === 2 ? 150 : 110;
    const stepTop = baseY - stepHeight;
    const centerX = x + colWidth / 2;

    ctx.beginPath();
    ctx.roundRect(x, stepTop, colWidth, stepHeight, [20, 20, 0, 0]);
    ctx.fillStyle = first ? C.soft : C.surface;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = first ? C.accent : C.line;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = first ? C.accentInk : C.ink;
    ctx.font = `600 52px ${head}`;
    ctx.fillText(row.percent, centerX, stepTop + 76);

    ctx.fillStyle = C.ink;
    ctx.font = `600 32px ${body}`;
    ctx.fillText(fit(ctx, row.name, colWidth), centerX, stepTop - 22);

    const radius = first ? 44 : 36;
    const cy = stepTop - 22 - 38 - radius;
    ctx.beginPath();
    ctx.arc(centerX, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = first ? C.accent : C.soft;
    ctx.fill();
    ctx.fillStyle = first ? C.onAccent : C.accentInk;
    ctx.font = `700 ${first ? 40 : 32}px ${body}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(([...row.name][0] ?? '').toLocaleUpperCase(), centerX, cy + 2);
    ctx.textBaseline = 'alphabetic';
  });

  // Everyone after the podium
  const rest = input.rows.slice(3);
  const top = baseY + 56;
  const rowHeight = 56;
  rest.forEach((row, i) => {
    const y = top + i * rowHeight;
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, y + rowHeight);
    ctx.lineTo(W - PAD, y + rowHeight);
    ctx.stroke();
    const baseline = y + 38;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.muted;
    ctx.font = `700 30px ${body}`;
    ctx.fillText(String(row.position), PAD, baseline);
    ctx.fillStyle = C.ink;
    ctx.font = `600 30px ${body}`;
    ctx.fillText(fit(ctx, row.name, W - 2 * PAD - 80 - 300), PAD + 80, baseline);
    ctx.textAlign = 'right';
    ctx.fillStyle = C.muted;
    ctx.font = `400 30px ${body}`;
    ctx.fillText(row.days, W - PAD - 150, baseline);
    ctx.fillStyle = C.ink;
    ctx.font = `700 32px ${body}`;
    ctx.fillText(row.percent, W - PAD, baseline);
  });
  if (input.more) {
    ctx.textAlign = 'left';
    ctx.fillStyle = C.muted;
    ctx.font = `400 30px ${body}`;
    ctx.fillText(input.more, PAD, top + rest.length * rowHeight + 38);
  }

  // Footer
  ctx.textAlign = 'left';
  ctx.fillStyle = C.muted;
  ctx.font = `400 30px ${body}`;
  ctx.fillText(fit(ctx, input.footer, W - 2 * PAD), PAD, H - 40);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))), 'image/png'));
}
