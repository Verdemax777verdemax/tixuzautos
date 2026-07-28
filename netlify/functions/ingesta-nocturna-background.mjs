import { createHmac, timingSafeEqual } from 'node:crypto';
import nightly from './lib/nightly-ingest.cjs';

function env(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || '';
}

function expectedToken() {
  const secret = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SERVICE_KEY');
  if (!secret) throw new Error('missing_SUPABASE_SERVICE_ROLE_KEY');
  return createHmac('sha256', secret).update('tixuz-nightly-ingest-v1').digest('hex');
}

function authorized(request) {
  const actual = request.headers.get('x-tixuz-ingest-token') || '';
  const expected = expectedToken();
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export default async function handler(request) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!authorized(request)) return new Response('Unauthorized', { status: 401 });
  const url = new URL(request.url);
  await nightly.runNightly({
    queueLimit: url.searchParams.get('limit'),
    maxRuntimeMs: url.searchParams.get('max_runtime_ms'),
    perSourceLimit: url.searchParams.get('per_source_limit')
  });
  return new Response(null, { status: 204 });
}
