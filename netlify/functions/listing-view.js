const { createHmac } = require('node:crypto');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function visitorHash(ip, userAgent, secret) {
  return createHmac('sha256', secret)
    .update(`${String(ip || 'unknown')}\n${String(userAgent || 'unknown')}`)
    .digest('hex');
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Metodo no permitido' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'JSON invalido' });
  }

  const listingId = String(body?.listing_id || '').trim();
  if (!UUID_PATTERN.test(listingId)) return json(400, { error: 'listing_id invalido' });

  const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!supabaseUrl || !serviceKey) return json(500, { error: 'Configuracion incompleta' });

  const headers = event.headers || {};
  const ip = headers['x-nf-client-connection-ip']
    || headers['x-forwarded-for']?.split(',')[0]?.trim()
    || 'unknown';
  const userAgent = headers['user-agent'] || 'unknown';
  const hash = visitorHash(ip, userAgent, serviceKey);

  const response = await fetch(`${supabaseUrl}/rest/v1/listing_views`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ listing_id: listingId, visitor_hash: hash }),
  });

  if (!response.ok) {
    console.error('listing_views insert failed', response.status, await response.text());
    return json(502, { error: 'No se pudo registrar la vista' });
  }
  return json(201, { ok: true });
};

exports.visitorHash = visitorHash;
