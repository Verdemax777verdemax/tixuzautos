// Tixuz Autos v58 · Confirmación de pago post-Stripe.
// Confirma pago, pero deja el anuncio en revisión manual de fotos antes de hacerlo público.

const DEFAULT_PLANS = {
  basic:    { active_days: 30, featured: false },
  featured: { active_days: 60, featured: true  },
  pro:      { active_days: 30, featured: true  },
};

const { patchListingWithFallback, notifyReviewCreated } = require('./_review-utils.cjs');

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': process.env.SITE_URL || 'https://cool-kataifi-78a65b.netlify.app',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
function respond(statusCode, body) { return { statusCode, headers, body: JSON.stringify(body) }; }
function siteUrl(event){ return String(process.env.SITE_URL || event.headers.origin || 'https://cool-kataifi-78a65b.netlify.app').replace(/\/$/, ''); }
function digits(v){ return String(v||'').replace(/\D/g,''); }
async function fetchWithTimeout(url, options, ms = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}
function addDays(days) { return new Date(Date.now() + (Number(days || 30) * 86400000)).toISOString(); }
async function getStripeSession(sessionId, stripeKey) {
  const res = await fetchWithTimeout(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'GET', headers: { Authorization: `Bearer ${stripeKey}` },
  }, 10000);
  const txt = await res.text(); let data = {};
  try { data = txt ? JSON.parse(txt) : {}; } catch { data = { error: { message: txt } }; }
  if (!res.ok) throw new Error(data.error?.message || txt || `Stripe HTTP ${res.status}`);
  return data;
}
async function getListingPaymentState({ supabaseUrl, serviceKey, listingId }) {
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/marketplace_listings?select=id,payment_status,stripe_session_id&limit=1&id=eq.${encodeURIComponent(listingId)}`;
  const res = await fetchWithTimeout(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  }, 8000);
  if (!res.ok) return null;
  const arr = await res.json().catch(() => []);
  return Array.isArray(arr) ? arr[0] : null;
}
async function queueListingForReview({ supabaseUrl, serviceKey, listingId, session }) {
  const planKey = (session.metadata && session.metadata.plan) || 'basic';
  const plan = DEFAULT_PLANS[planKey] || DEFAULT_PLANS.basic;
  const payload = {
    status: 'pending_payment',
    manual_review: true,
    payment_status: 'paid',
    featured: !!plan.featured,
    verification_badge: false,
    stripe_session_id: session.id,
    stripe_subscription_id: session.subscription || null,
    expires_at: addDays(plan.active_days),
  };
  const data = await patchListingWithFallback({ endpoint: supabaseUrl, key: serviceKey, listingId, payload });
  if (Array.isArray(data) && data.length === 0) throw new Error('Supabase no encontró el anuncio para revisión');
  return data;
}



exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return respond(200, { ok: true });
  if (!['GET', 'POST'].includes(event.httpMethod)) return respond(405, { ok: false, error: 'Method Not Allowed' });

  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!STRIPE_KEY) return respond(500, { ok: false, error: 'Falta STRIPE_SECRET_KEY', stage: 'env' });
  if (!SUPABASE_URL || !SERVICE_KEY) return respond(500, { ok: false, error: 'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY', stage: 'env' });

  let body = {};
  if (event.httpMethod === 'POST') {
    try { body = JSON.parse(event.body || '{}'); }
    catch { return respond(400, { ok: false, error: 'JSON inválido', stage: 'input' }); }
  }
  const qs = event.queryStringParameters || {};
  const sessionId = String(body.session_id || qs.session_id || '').trim();
  const requestedListingId = String(body.listing_id || qs.listing_id || '').trim();
  if (!sessionId || !sessionId.startsWith('cs_')) return respond(400, { ok: false, error: 'session_id inválido', stage: 'input' });

  try {
    const session = await getStripeSession(sessionId, STRIPE_KEY);
    const listingId = String(session.client_reference_id || session.metadata?.listing_id || requestedListingId || '').trim();
    if (!listingId) return respond(400, { ok: false, error: 'Stripe no trae listing_id', stage: 'stripe_session' });
    if (requestedListingId && requestedListingId !== listingId) return respond(400, { ok: false, error: 'listing_id no coincide con Stripe', stage: 'stripe_session' });
    const paid = session.status === 'complete' && (session.payment_status === 'paid' || session.payment_status === 'no_payment_required');
    if (!paid) return respond(402, { ok: false, error: `Stripe todavía no marca pagado. status=${session.status}, payment_status=${session.payment_status}`, stage: 'stripe_session' });

    const existing = await getListingPaymentState({ supabaseUrl: SUPABASE_URL, serviceKey: SERVICE_KEY, listingId });
    if (existing?.payment_status === 'paid' && existing?.stripe_session_id === session.id) {
      return respond(200, { ok: true, listing_id: listingId, status: 'pending_payment', review_status: 'pending_review', already_processed: true });
    }

    const data = await queueListingForReview({ supabaseUrl: SUPABASE_URL, serviceKey: SERVICE_KEY, listingId, session });
    const notification = await notifyReviewCreated({ endpoint: SUPABASE_URL.replace(/\/$/,''), key: SERVICE_KEY, listingId, event, source: 'confirm-checkout' }).catch(err=>({attempted:false,reason:err.message}));
    return respond(200, { ok: true, listing_id: listingId, status: 'pending_payment', review_status: 'pending_review', notification, data });
  } catch (err) {
    console.error('confirm-checkout failed:', err);
    return respond(500, { ok: false, error: err.message || 'No se pudo confirmar/mandar a revisión', stage: 'confirm_checkout' });
  }
};
