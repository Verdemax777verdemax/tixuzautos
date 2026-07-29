const { createHmac } = require('node:crypto');
const { clientIp, trackingFields, tixuzTrack } = require('./_shared');

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

  const ip = clientIp(event);
  const userAgent = String(event.headers?.['user-agent'] || 'unknown');
  const hash = visitorHash(ip, userAgent, serviceKey);

  try {
    const tracked = await tixuzTrack({
      event: 'view',
      listing_id: listingId,
      visitor_hash: hash,
      source: String(body?.source || 'marketplace_listing').slice(0, 80),
      ...trackingFields(event, body?.tracking || body),
    });
    if (!tracked.ok || tracked.data?.ok === false) {
      console.error('tixuz_track view failed', tracked.status, tracked.data);
    }
  } catch (error) {
    // Analytics must never make a public listing fail to open.
    console.error('tixuz_track view request failed', error.message);
  }
  return json(202, { ok: true });
};

exports.visitorHash = visitorHash;
