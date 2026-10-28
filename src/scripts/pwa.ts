// Offline support. Only in production builds: in dev a cached app would hide code changes.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Not installable (private mode, blocked): the app still works online.
    });
  });
}
