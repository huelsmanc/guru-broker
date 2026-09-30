// Single entry point for every backend function: POST /api/fn/<name>
// (GET works too, for the few functions that read query parameters).
// One route instead of 63 keeps you well under Vercel's function limits.

import { run } from '../../server/lib/runner.js';

function nameFrom(request) {
  const path = new URL(request.url).pathname;
  return decodeURIComponent(path.split('/').filter(Boolean).pop() || '');
}

export async function POST(request) {
  return run(nameFrom(request), request);
}

export async function GET(request) {
  return run(nameFrom(request), request);
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}
