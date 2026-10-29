export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/** Web Share where available, clipboard otherwise. Closing the share sheet is not an error. */
export async function shareText(text: string): Promise<ShareOutcome> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Ronda', text });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // Any other failure falls through to the clipboard.
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export type ImageOutcome = 'shared' | 'cancelled' | 'failed';

/** Phones and tablets: where the share sheet is the natural way out. On desktop it is a detour, so it is not offered. */
export function canShareImageFile(): boolean {
  if (typeof navigator.canShare !== 'function' || !matchMedia('(pointer: coarse)').matches) return false;
  return navigator.canShare({ files: [new File([], 'ronda.png', { type: 'image/png' })] });
}

/** The share sheet with the image as a file. Closing the sheet is not an error. */
export async function shareImage(blob: Blob, filename: string, title: string): Promise<ImageOutcome> {
  try {
    await navigator.share({ files: [new File([blob], filename, { type: 'image/png' })], title });
    return 'shared';
  } catch (error) {
    return error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

export const canCopyImage = () => typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function';

/** Puts the picture on the clipboard to paste anywhere. The promise goes in unresolved so the click's permission lasts while it is drawn. */
export async function copyImage(blob: Promise<Blob>): Promise<'copied' | 'failed'> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** Saves a file through the browser's download. Returns false when it could not start. */
export function downloadBlob(blob: Blob, filename: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}
