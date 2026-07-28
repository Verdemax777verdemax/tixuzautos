// Tixuz Autos v62 · reenvío manual/seguro de aviso interno de revisión.
// POST { listing_id, token}  o GET id=...&token=...
const { notifyReviewCreated, reviewSecret } = require('./_review-utils.cjs');

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': process.env.SITE_URL || 'https://cool-kataifi-78a65b.netlify.app',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
function respond(statusCode, body) { return { statusCode, headers, body: JSON.stringify(body) }; }

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return respond(200, { ok: true });
  if (!['GET', 'POST'].includes(event.httpMethod)) return respond(405, { ok: false, error: 'Method Not Allowed' });

  const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!SUPABASE_URL || !SERVICE_KEY) return respond(500, { ok: false, error: 'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY' });

  let body = {};
  if (event.httpMethod === 'POST') {
    try { body = JSON.parse(event.body || '{}'); } catch { return respond(400, { ok: false, error: 'JSON inválido' }); }
  }
  const qs = event.queryStringParameters || {};
  const listingId = String(body.listing_id || body.id || qs.listing_id || qs.id || '').trim();
  const token = String(body.token || qs.token || '').trim();
  const requiredToken = reviewSecret();

  if (!listingId) return respond(400, { ok: false, error: 'Falta listing_id' });
  if (!requiredToken) return respond(500, { ok: false, error: 'Falta REVIEW_SECRET en Netlify' });
  if (token !== requiredToken) return respond(401, { ok: false, error: 'Token inválido' });

  const notification = await notifyReviewCreated({ endpoint: SUPABASE_URL, key: SERVICE_KEY, listingId, event, source: 'notify-review-created' });
  return respond(200, { ok: true, listing_id: listingId, notification });
};
