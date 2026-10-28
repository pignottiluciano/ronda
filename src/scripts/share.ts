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

export type ImageOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed';

/** The share sheet with the image as a file where the browser allows it, a download otherwise. */
export async function shareImage(blob: Blob, filename: string, title: string): Promise<ImageOutcome> {
  const file = new File([blob], filename, { type: 'image/png' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // Any other failure falls through to the download.
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
