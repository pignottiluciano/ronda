/** mm:ss of elapsed time, rounding down so a clock never runs ahead of the speaker. */
export function formatClock(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

/** Time left of a budget as mm:ss, or `+mm:ss` once it is used up. Rounds the remainder up so 00:00 means the time is really gone. */
export function formatRemaining(spokenMs: number, budgetMs: number): string {
  if (spokenMs > budgetMs) return `+${formatClock(spokenMs - budgetMs)}`;
  return formatClock(Math.ceil((budgetMs - spokenMs) / 1000) * 1000);
}
