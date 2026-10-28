import type { APIRoute } from 'astro';
import source from '../sw/worker.js?raw';

// A new version on every build makes the browser install the worker again and drop the old cache.
const VERSION = Date.now().toString(36);

export const GET: APIRoute = () =>
  new Response(source.replaceAll('__VERSION__', VERSION), { headers: { 'Content-Type': 'text/javascript' } });
