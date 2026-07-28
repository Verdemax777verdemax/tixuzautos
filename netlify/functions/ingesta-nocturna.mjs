import { createHmac } from 'node:crypto';

function env(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || '';
}

function ingestToken() {
  const secret = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SERVICE_KEY');
  if (!secret) throw new Error('missing_SUPABASE_SERVICE_ROLE_KEY');
  return createHmac('sha256', secret).update('tixuz-nightly-ingest-v1').digest('hex');
}

export default async function handler(request) {
  const incoming = new URL(request.url);
  const backgroundUrl = new URL('/.netlify/functions/ingesta-nocturna-background', incoming.origin);
  for (const key of ['limit', 'max_runtime_ms', 'per_source_limit']) {
    if (incoming.searchParams.has(key)) backgroundUrl.searchParams.set(key, incoming.searchParams.get(key));
  }
  const response = await fetch(backgroundUrl, {
    method: 'POST',
    headers: { 'x-tixuz-ingest-token': ingestToken(), 'content-type': 'application/json' },
    body: JSON.stringify({ trigger: 'scheduled', requested_at: new Date().toISOString() })
  });
  return Response.json({ ok: response.ok, queued: response.status === 202, status: response.status }, { status: response.ok ? 202 : 502 });
}

export const config = { schedule: '0 9 * * *' };
