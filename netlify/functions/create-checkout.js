// Tixuz Autos v45 · create-checkout sin SDK externo.
// Usa Stripe REST API directo para que funcione también en deploy manual ZIP sin node_modules.

const DEFAULT_PLANS = {
  basic:    { key: 'basic',    name: 'Básico',    price_mxn: 49,  interval_type: 'one_time',  active_days: 30, max_photos: 5 },
  featured: { key: 'featured', name: 'Destacado', price_mxn: 199, interval_type: 'one_time',  active_days: 60, max_photos: 12 },
  pro:      { key: 'pro',      name: 'PRO',       price_mxn: 499, interval_type: 'one_time',  active_days: 30, max_photos: 30 },
};

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': process.env.SITE_URL || 'https://cool-kataifi-78a65b.netlify.app',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function respond(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function cleanSiteUrl(raw, event) {
  const fallback = event.headers.origin || 'https://cool-kataifi-78a65b.netlify.app';
  return String(raw || fallback).replace(/\/$/, '');
}

function addLineItem(params, planKey) {
  const p = DEFAULT_PLANS[planKey] || DEFAULT_PLANS.basic;
  const priceId = process.env[`STRIPE_PRICE_${planKey.toUpperCase()}`]
    || process.env[`STRIPE_${planKey.toUpperCase()}_PRICE_ID`];

  params.set('line_items[0][quantity]', '1');

  if (priceId) {
    params.set('line_items[0][price]', priceId);
    return;
  }

  params.set('line_items[0][price_data][currency]', 'mxn');
  params.set('line_items[0][price_data][unit_amount]', String(Math.round(Number(p.price_mxn) * 100)));
  params.set('line_items[0][price_data][product_data][name]', `Tixuz Autos — ${p.name}`);
  params.set('line_items[0][price_data][product_data][description]', `${p.max_photos} fotos · ${p.active_days} días${p.interval_type === 'recurring' ? ' · mensual' : ''}`);
  if (p.interval_type === 'recurring') {
    params.set('line_items[0][price_data][recurring][interval]', 'month');
  }
}

async function fetchWithTimeout(url, options, ms = 7000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function createDraftListing({ listingData, planKey, SUPABASE_URL, SUPABASE_KEY }) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY en Netlify.');
  }

  const sbRes = await fetchWithTimeout(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/create_listing`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({
      p_make:            listingData.make,
      p_model:           listingData.model,
      p_year:            Number(listingData.year),
      p_price:           Number(listingData.price),
      p_mileage:         Number(listingData.mileage || 0),
      p_transmission:    listingData.transmission || 'Automática',
      p_fuel_type:       listingData.fuel_type || 'Gasolina',
      p_color:           listingData.color || 'Blanco',
      p_location:        listingData.location || 'México',
      p_description:     listingData.description || '',
      p_images:          Array.isArray(listingData.images) ? listingData.images : [],
      p_seller_name:     listingData.seller_name,
      p_seller_whatsapp: listingData.seller_whatsapp,
      p_seller_type:     listingData.seller_type || 'Particular',
      p_plan:            planKey,
      p_pin:             String(listingData.pin || ''),
    }),
  }, 7000);

  const text = await sbRes.text();
  let result = {};
  try { result = text ? JSON.parse(text) : {}; } catch { result = { error: text }; }

  if (!sbRes.ok || !result || result.ok === false || !result.listing_id) {
    const detail = result.error || result.message || text || `HTTP ${sbRes.status}`;
    throw new Error(`Supabase no creó el anuncio: ${detail}`);
  }

  return result.listing_id;
}

async function createStripeCheckout({ STRIPE_KEY, SITE_URL, planKey, listingId }) {
  const params = new URLSearchParams();
  params.set('mode', DEFAULT_PLANS[planKey]?.interval_type === 'recurring' ? 'subscription' : 'payment');
  params.set('client_reference_id', listingId);
  params.set('metadata[listing_id]', listingId);
  params.set('metadata[plan]', planKey);
  params.set('success_url', `${SITE_URL}/payment_success=1&listing_id=${listingId}&session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${SITE_URL}/payment_cancelled=1&listing_id=${listingId}`);
  params.set('locale', 'es');
  params.set('payment_method_types[0]', 'card');
  addLineItem(params, planKey);

  const res = await fetchWithTimeout('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  }, 12000);

  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: { message: text } }; }

  if (!res.ok || !data.url) {
    throw new Error(data.error.message || text || `Stripe HTTP ${res.status}`);
  }

  return data.url;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return respond(200, { ok: true });
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method Not Allowed' });

  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  const SITE_URL = cleanSiteUrl(process.env.SITE_URL, event);

  if (!STRIPE_KEY) return respond(500, { error: 'Falta STRIPE_SECRET_KEY en Netlify.', stage: 'env' });
  if (!SUPABASE_URL || !SUPABASE_KEY) return respond(500, { error: 'Faltan variables de Supabase en Netlify.', stage: 'env' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return respond(400, { error: 'JSON inválido', stage: 'input' }); }

  const { listingData, plan } = body;
  const planKey = DEFAULT_PLANS[plan] ? plan : 'basic';

  if (!listingData) return respond(400, { error: 'Missing listingData', stage: 'input' });
  if (!listingData.make || !listingData.model || !listingData.year || !listingData.price) return respond(400, { error: 'Faltan datos del auto', stage: 'input' });
  if (!Array.isArray(listingData.images) || listingData.images.length < 1) return respond(400, { error: 'Sube al menos 1 foto real del auto para revisión.', stage: 'input' });
  if (!listingData.seller_name || String(listingData.seller_name).trim().length < 2) return respond(400, { error: 'Nombre inválido', stage: 'input' });
  if (!/^\d{10}$/.test(String(listingData.seller_whatsapp || ''))) return respond(400, { error: 'WhatsApp debe ser de 10 dígitos', stage: 'input' });
  if (!/^\d{4}$/.test(String(listingData.pin || ''))) return respond(400, { error: 'PIN debe ser de 4 dígitos', stage: 'input' });

  let listingId;
  try {
    listingId = await createDraftListing({ listingData, planKey, SUPABASE_URL, SUPABASE_KEY });
  } catch (err) {
    console.error('create_listing failed:', err);
    return respond(500, { error: err.message || 'Error al guardar el anuncio antes del pago', stage: 'supabase_create_listing' });
  }

  try {
    const url = await createStripeCheckout({ STRIPE_KEY, SITE_URL, planKey, listingId });
    return respond(200, { ok: true, url, listing_id: listingId });
  } catch (err) {
    console.error('stripe checkout failed:', err);
    return respond(500, { error: err.message || 'Stripe no pudo crear el Checkout', stage: 'stripe_checkout' });
  }
};
