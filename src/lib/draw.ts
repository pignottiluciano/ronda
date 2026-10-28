// Pure draw logic: no DOM, no storage. Safe to unit test and to reuse.

export type DrawResult = string[][];

export const MIN_PARTICIPANTS = 2;

/** Trims each line and drops empty ones. Duplicates are kept on purpose. */
export function parseParticipants(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function hasDuplicates(list: readonly string[]): boolean {
  return new Set(list).size !== list.length;
}

export type DrawError = 'min' | 'integer' | 'max';

/** Returns what is wrong with the input (the UI words it per language), or null when it is valid. */
export function validateDraw(participants: number, groups: number): DrawError | null {
  if (participants < MIN_PARTICIPANTS) return 'min';
  if (!Number.isInteger(groups) || groups < 1) return 'integer';
  if (groups > participants) return 'max';
  return null;
}

/** Fisher–Yates on a copy. ponytail: Math.random is fine for casual draws; use crypto if prizes or audits come in. */
export function shuffle<T>(list: readonly T[], random: () => number = Math.random): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/** Round-robin, so group sizes differ by at most one. */
export function distribute<T>(list: readonly T[], groups: number): T[][] {
  const result: T[][] = Array.from({ length: groups }, () => []);
  list.forEach((item, i) => result[i % groups]!.push(item));
  return result;
}

export function draw(participants: readonly string[], groups: number, random?: () => number): DrawResult {
  return distribute(shuffle(participants, random), groups);
}

/** Plain text for sharing: numbered list for one group, labelled blocks otherwise. */
export function formatResult(result: DrawResult, groupLabel: (n: number) => string): string {
  if (result.length === 1) return result[0]!.map((name, i) => `${i + 1}. ${name}`).join('\n');
  return result
    .map((members, i) => [groupLabel(i + 1), ...members.map((name) => `- ${name}`)].join('\n'))
    .join('\n\n');
}
