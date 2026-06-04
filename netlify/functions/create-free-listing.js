// Tixuz Autos v58 · Gratis por lanzamiento + revisión manual de fotos.
// No toca Stripe. Crea el anuncio y lo deja en cola de autorización (no público) hasta que Admin apruebe.

const { patchListingWithFallback, notifyReviewCreated } = require('./_review-utils.cjs');

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': process.env.SITE_URL || 'https://cool-kataifi-78a65b.netlify.app',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function respond(statusCode, body) { return { statusCode, headers, body: JSON.stringify(body) }; }
function digits(v) { return String(v || '').replace(/\D/g, ''); }
function n(v, fallback = 0) {
  const x = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(x) ? x : fallback;
}
function siteUrl(event){ return String(process.env.SITE_URL || event.headers.origin || 'https://cool-kataifi-78a65b.netlify.app').replace(/\/$/, ''); }
async function fetchWithTimeout(url, options, ms = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}
async function supaCount({ endpoint, key, query }) {
  const url = `${endpoint}/rest/v1/marketplace_listings?select=id&${query}`;
  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact', Range: '0-0' },
  }, 7000);
  const cr = res.headers.get('content-range') || '';
  const m = cr.match(/\/(\d+)$/);
  if (m) return Number(m[1]);
  if (!res.ok) return 0;
  const arr = await res.json().catch(() => []);
  return Array.isArray(arr) ? arr.length : 0;
}
async function createDraftListing({ listingData, endpoint, key }) {
  const res = await fetchWithTimeout(`${endpoint}/rest/v1/rpc/create_listing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      p_make: String(listingData.make || '').trim(),
      p_model: String(listingData.model || '').trim(),
      p_year: Math.round(n(listingData.year)),
      p_price: n(listingData.price),
      p_mileage: Math.round(n(listingData.mileage)),
      p_transmission: listingData.transmission || 'Automática',
      p_fuel_type: listingData.fuel_type || 'Gasolina',
      p_color: listingData.color || 'Sin especificar',
      p_location: listingData.location || 'México',
      p_description: listingData.description || '',
      p_images: Array.isArray(listingData.images) ? listingData.images : [],
      p_seller_name: listingData.seller_name,
      p_seller_whatsapp: digits(listingData.seller_whatsapp),
      p_seller_type: listingData.seller_type || 'Particular',
      p_plan: 'basic',
      p_pin: String(listingData.pin || ''),
    }),
  }, 9000);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!res.ok || !data || data.ok === false || !data.listing_id) throw new Error(data.error || text || `Supabase HTTP ${res.status}`);
  return data.listing_id;
}
async function queueFreeListingForReview({ endpoint, key, listingId, days }) {
  const expires = new Date(Date.now() + Number(days || 30) * 86400000).toISOString();
  return patchListingWithFallback({ endpoint, key, listingId, payload: {
    status: 'pending_payment',
    manual_review: true,
    payment_status: 'not_required',
    featured: false,
    expires_at: expires,
    verification_badge: false
  }});
}



exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return respond(200, { ok: true });
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method Not Allowed' });

  const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const FREE_LIMIT = Number(process.env.FREE_LAUNCH_LIMIT || 300);
  const FREE_PER_PHONE = Number(process.env.FREE_LAUNCH_PER_PHONE || 3);
  const FREE_DAYS = Number(process.env.FREE_LAUNCH_DAYS || 30);
  if (!SUPABASE_URL || !SERVICE_KEY) return respond(500, { error: 'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Netlify.' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return respond(400, { error: 'JSON inválido' }); }
  const listingData = body.listingData || {};
  const wa = digits(listingData.seller_whatsapp);

  if (!listingData.make || !listingData.model || !listingData.year || !listingData.price) return respond(400, { error: 'Faltan datos del auto' });
  if (!Array.isArray(listingData.images) || listingData.images.length < 1) return respond(400, { error: 'Sube al menos 1 foto real del auto para revisión.' });
  if (!listingData.seller_name || String(listingData.seller_name).trim().length < 2) return respond(400, { error: 'Nombre inválido' });
  if (!/^\d{10}$/.test(wa)) return respond(400, { error: 'WhatsApp debe ser de 10 dígitos' });
  if (!/^\d{4}$/.test(String(listingData.pin || ''))) return respond(400, { error: 'PIN debe ser de 4 dígitos' });

  try {
    const globalFree = await supaCount({ endpoint: SUPABASE_URL, key: SERVICE_KEY, query: 'payment_status=eq.not_required&status=in.(active,paused,pending_payment)' });
    if (globalFree >= FREE_LIMIT) return respond(409, { error: 'La promoción gratis de lanzamiento llegó a su límite. Elige un plan de pago para publicar.' });

    const phoneFree = await supaCount({ endpoint: SUPABASE_URL, key: SERVICE_KEY, query: `seller_whatsapp=eq.${encodeURIComponent(wa)}&payment_status=eq.not_required&status=in.(active,paused,pending_payment)` });
    if (phoneFree >= FREE_PER_PHONE) return respond(409, { error: `Este WhatsApp ya usó ${FREE_PER_PHONE} publicaciones gratis de lanzamiento. Puedes publicar con un plan de pago.` });

    const listingId = await createDraftListing({ listingData, endpoint: SUPABASE_URL, key: SERVICE_KEY });
    await queueFreeListingForReview({ endpoint: SUPABASE_URL, key: SERVICE_KEY, listingId, days: FREE_DAYS });
    const notification = await notifyReviewCreated({ endpoint: SUPABASE_URL, key: SERVICE_KEY, listingId, event, source: 'create-free-listing' }).catch(err => ({ attempted:false, reason:err.message }));
    return respond(200, { ok: true, listing_id: listingId, payment_status: 'not_required', status: 'pending_payment', review_status: 'pending_review', notification });
  } catch (err) {
    console.error('create-free-listing failed:', err);
    return respond(500, { error: err.message || 'No se pudo mandar el anuncio a revisión' });
  }
};
