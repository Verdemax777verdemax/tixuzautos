// Tixuz Autos - carga asistida para lotes y agencias.
// Crea anuncios gratis en revisión humana; no activa inventario público automáticamente.

const { patchListingWithFallback, notifyReviewCreated } = require('./_review-utils.cjs');

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
function respond(statusCode, body) { return { statusCode, headers, body: JSON.stringify(body) }; }
function digits(v) { return String(v || '').replace(/\D/g, ''); }
function clean(v, max = 1000) { return String(v ?? '').trim().slice(0, max); }
function n(v, fallback = 0) {
  const x = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(x) ? x : fallback;
}
async function fetchWithTimeout(url, options, ms = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}
function imageList(v) {
  const raw = Array.isArray(v) ? v : String(v || '').split(/\||,|;|\n/);
  return raw.map(x => clean(x, 1000)).filter(u => /^https?:\/\//i.test(u) && !/javascript:|data:|file:/i.test(u)).slice(0, 12);
}
function normalizeListing(raw, lot) {
  const make = clean(raw.make || raw.marca, 80);
  const model = clean(raw.model || raw.modelo, 140);
  const year = Math.round(n(raw.year || raw.ano || raw.anio || raw['año']));
  const price = Math.round(n(raw.price || raw.precio));
  const images = imageList(raw.images || raw.fotos || raw.imagenes || raw['imágenes']);
  const description = clean(raw.description || raw.descripcion || raw['descripción'] || 'Inventario de lote fundador Tixuz Autos.', 1600);
  const noPhotoNote = images.length ? '' : '\n\nPendiente: agregar fotos reales antes de activar.';
  return {
    make, model, year, price, images,
    mileage: Math.round(n(raw.mileage || raw.km || raw.kilometraje)),
    transmission: clean(raw.transmission || raw.transmision || raw['transmisión'] || 'Automática', 40),
    fuel_type: clean(raw.fuel_type || raw.combustible || 'Gasolina', 40),
    color: clean(raw.color || 'No especificado', 50),
    location: clean(raw.location || raw.ubicacion || raw['ubicación'] || raw.ciudad || lot.city || 'México', 180),
    description: `${description}${noPhotoNote}`.trim(),
    seller_name: clean(lot.name || raw.seller_name || raw.vendedor || 'Lote fundador Tixuz Autos', 120),
    seller_whatsapp: digits(lot.whatsapp || raw.seller_whatsapp || raw.whatsapp || raw.telefono),
    seller_type: 'Agencia',
    pin: clean(lot.pin, 8),
  };
}
function validListing(x) {
  if (!x.make || !x.model) return false;
  if (!x.year || x.year < 1980 || x.year > 2027) return false;
  if (!x.price || x.price < 1000) return false;
  if (!/^\d{10}$/.test(x.seller_whatsapp)) return false;
  if (!/^\d{4}$/.test(String(x.pin || ''))) return false;
  return true;
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
      p_make: listingData.make,
      p_model: listingData.model,
      p_year: listingData.year,
      p_price: listingData.price,
      p_mileage: listingData.mileage || 0,
      p_transmission: listingData.transmission || 'Automática',
      p_fuel_type: listingData.fuel_type || 'Gasolina',
      p_color: listingData.color || 'No especificado',
      p_location: listingData.location || 'México',
      p_description: listingData.description || '',
      p_images: listingData.images || [],
      p_seller_name: listingData.seller_name,
      p_seller_whatsapp: listingData.seller_whatsapp,
      p_seller_type: listingData.seller_type || 'Lote fundador',
      p_plan: 'basic',
      p_pin: listingData.pin,
    }),
  }, 10000);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!res.ok || !data || data.ok === false || !data.listing_id) throw new Error(data.error || text || `Supabase HTTP ${res.status}`);
  return data.listing_id;
}
async function queueFounderListing({ endpoint, key, listingId, days }) {
  const expires = new Date(Date.now() + Number(days || 90) * 86400000).toISOString();
  return patchListingWithFallback({ endpoint, key, listingId, payload: {
    status: 'pending_payment',
    manual_review: true,
    payment_status: 'not_required',
    featured: false,
    expires_at: expires,
    verification_badge: false,
  }});
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return respond(200, { ok: true });
  if (event.httpMethod !== 'POST') return respond(405, { ok: false, error: 'Method Not Allowed' });

  const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const MAX_PER_REQUEST = Number(process.env.FOUNDER_LOT_REQUEST_LIMIT || 50);
  const MAX_PER_PHONE = Number(process.env.FOUNDER_LOT_PHONE_LIMIT || 80);
  const FOUNDER_DAYS = Number(process.env.FOUNDER_LOT_DAYS || 90);
  if (!SUPABASE_URL || !SERVICE_KEY) return respond(500, { ok: false, error: 'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Netlify.' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return respond(400, { ok: false, error: 'JSON inválido' }); }
  if (!body.authorized) return respond(400, { ok: false, error: 'Debes confirmar autorización del lote.' });

  const lot = body.lot || {};
  lot.whatsapp = digits(lot.whatsapp);
  lot.name = clean(lot.name, 120);
  lot.city = clean(lot.city, 180);
  lot.pin = clean(lot.pin, 8);
  if (!lot.name) return respond(400, { ok: false, error: 'Falta nombre del lote.' });
  if (!/^\d{10}$/.test(lot.whatsapp)) return respond(400, { ok: false, error: 'WhatsApp del lote debe tener 10 dígitos.' });
  if (!/^\d{4}$/.test(lot.pin)) return respond(400, { ok: false, error: 'PIN del lote debe tener 4 dígitos.' });

  const input = Array.isArray(body.listings) ? body.listings.slice(0, MAX_PER_REQUEST) : [];
  if (!input.length) return respond(400, { ok: false, error: 'No recibí autos para importar.' });

  const existing = await supaCount({ endpoint: SUPABASE_URL, key: SERVICE_KEY, query: `seller_whatsapp=eq.${encodeURIComponent(lot.whatsapp)}&payment_status=eq.not_required&status=in.(active,paused,pending_payment)` });
  if (existing >= MAX_PER_PHONE) return respond(409, { ok: false, error: `Este WhatsApp ya tiene ${existing} anuncios gratis. Revisa el lote antes de agregar más.` });

  const allowed = Math.max(0, MAX_PER_PHONE - existing);
  const normalized = input.map(x => normalizeListing(x, lot));
  const valid = normalized.filter(validListing).slice(0, allowed);
  if (!valid.length) return respond(400, { ok: false, error: 'Ningún auto válido. Revisa marca, modelo, año, precio, WhatsApp y PIN.' });

  const created = [];
  const errors = [];
  for (const listing of valid) {
    try {
      const listingId = await createDraftListing({ listingData: listing, endpoint: SUPABASE_URL, key: SERVICE_KEY });
      await queueFounderListing({ endpoint: SUPABASE_URL, key: SERVICE_KEY, listingId, days: FOUNDER_DAYS });
      created.push({ id: listingId, needs_photos: !listing.images.length });
    } catch (err) {
      errors.push({ title: `${listing.year || ''} ${listing.make} ${listing.model}`.trim(), error: err.message });
    }
  }

  let notification = null;
  if (created[0]) {
    notification = await notifyReviewCreated({ endpoint: SUPABASE_URL, key: SERVICE_KEY, listingId: created[0].id, event, source: 'lot-founder-intake' }).catch(err => ({ attempted:false, reason:err.message }));
  }

  return respond(200, {
    ok: true,
    inserted: created.length,
    skipped: normalized.length - valid.length + errors.length,
    needs_photos: created.filter(x => x.needs_photos).length,
    limit_remaining: Math.max(0, allowed - created.length),
    errors: errors.slice(0, 5),
    notification,
  });
};
