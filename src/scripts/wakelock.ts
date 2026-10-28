// Keeps the screen on while a turn runs. The browser drops the lock when the tab is hidden, so callers ask again on return.
let wakeLock: WakeLockSentinel | null = null;

export async function holdScreen() {
  if (wakeLock && !wakeLock.released) return;
  try {
    wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
  } catch {
    wakeLock = null; // unsupported or refused: the clock still works, the screen may dim
  }
}

export function releaseScreen() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}
