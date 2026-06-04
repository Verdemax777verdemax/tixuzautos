import jwt from 'jsonwebtoken';
const SUPABASE_URL = Netlify.env.get('SUPABASE_URL');
const SERVICE_KEY  = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');
const JWT_SECRET   = Netlify.env.get('ADMIN_JWT_SECRET') || Netlify.env.get('STRIPE_WEBHOOK_SECRET');

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
function verifyAdmin(req) {
  if (!JWT_SECRET) return false;
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace('Bearer ', '');
  try { jwt.verify(token, JWT_SECRET); return true; } catch { return false; }
}
function cleanText(v, max = 500) { return String(v ?? '').trim().slice(0, max); }
function digits(v) { return String(v ?? '').replace(/\D/g, ''); }
function asNumber(v, fallback = 0) {
  const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}
function asBool(v) { return ['1','true','si','sí','yes','destacado','pro'].includes(String(v ?? '').trim().toLowerCase()); }
function imagesArray(v) {
  // v66: solo URLs http(s) — bloquea javascript:, data:, file: y otras inseguras
  const cleanUrl = (u) => {
    const s = cleanText(u, 1000);
    if (!/^https?:\/\//i.test(s)) return null;
    // Bloquear esquemas embebidos disfrazados
    if (/javascript:|data:|file:|vbscript:/i.test(s)) return null;
    return s;
  };
  if (Array.isArray(v)) return v.map(cleanUrl).filter(Boolean).slice(0, 12);
  return String(v ?? '')
    .split(/\||;|\n/)
    .map(cleanUrl)
    .filter(Boolean)
    .slice(0, 12);
}
function normalizeListing(raw) {
  const make = cleanText(raw.make || raw.marca, 80);
  const model = cleanText(raw.model || raw.modelo, 120);
  const year = Math.round(asNumber(raw.year || raw.ano || raw.anio || raw['año']));
  const price = Math.round(asNumber(raw.price || raw.precio));
  const wa = digits(raw.seller_whatsapp || raw.whatsapp || raw.telefono || raw['teléfono']);
  const planRaw = cleanText(raw.plan || 'basic', 20).toLowerCase();
  const plan = ['basic','featured','pro'].includes(planRaw) ? planRaw : 'basic';
  return {
    make, model, year, price,
    mileage: Math.round(asNumber(raw.mileage || raw.km || raw.kilometraje)),
    transmission: cleanText(raw.transmission || raw.transmision || raw['transmisión'] || 'Automática', 40),
    fuel_type: cleanText(raw.fuel_type || raw.combustible || 'Gasolina', 40),
    color: cleanText(raw.color || 'No especificado', 40),
    location: cleanText(raw.location || raw.ubicacion || raw['ubicación'] || raw.ciudad || 'México', 160),
    description: cleanText(raw.description || raw.descripcion || raw['descripción'] || 'Inventario real autorizado para Tixuz Autos.', 1500),
    images: imagesArray(raw.images || raw.fotos || raw.imagenes || raw['imágenes'] || raw.foto || raw.image),
    seller_name: cleanText(raw.seller_name || raw.vendedor || raw.nombre_vendedor || 'Agencia autorizada', 120),
    seller_whatsapp: wa,
    seller_type: cleanText(raw.seller_type || raw.tipo_vendedor || raw.tipo || 'Agencia', 40),
    plan,
    featured: asBool(raw.featured || raw.destacado) || plan === 'featured' || plan === 'pro',
    status: 'active',
    payment_status: 'not_required',
    verification_badge: asBool(raw.verificado || raw.verified),
    expires_at: new Date(Date.now() + 180 * 86400000).toISOString(),
    source: cleanText(raw.source || 'lanzamiento_autorizado', 60),
    source_url: cleanText(raw.source_url || raw.url || raw.link, 1000),
  };
}
function isValid(x) {
  if (!x.make || !x.model) return false;
  if (!x.year || x.year < 1980 || x.year > 2027) return false;
  if (!x.price || x.price < 1000) return false;
  if (!/^\d{10}$/.test(x.seller_whatsapp)) return false;
  if (!x.images.length) return false;
  return true;
}
async function insertRows(rows) {
  const endpoint = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/marketplace_listings`;
  const headers = { 'Content-Type': 'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: 'return=representation' };
  let res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(rows) });
  if (res.ok) return res;
  const text = await res.text();
  // Si aún no corriste la migración source/source_url, reintenta sin esas columnas.
  if (/source|source_url|column/i.test(text)) {
    const safe = rows.map(({ source, source_url, ...r }) => r);
    res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(safe) });
    if (res.ok) return res;
    const text2 = await res.text();
    throw new Error(text2 || text || `Supabase HTTP ${res.status}`);
  }
  throw new Error(text || `Supabase HTTP ${res.status}`);
}
export default async (req) => {
  if (!SUPABASE_URL || !SERVICE_KEY || !JWT_SECRET) return json(500, { ok: false, error: 'Admin no configurado. Faltan variables privadas en Netlify.' });
  if (!verifyAdmin(req)) return json(401, { ok: false, error: 'No autorizado' });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method Not Allowed' });
  let body = {};
  try { body = await req.json(); } catch { return json(400, { ok: false, error: 'JSON inválido' }); }
  if (!body.authorized) return json(400, { ok: false, error: 'Debes confirmar que el inventario está autorizado.' });
  const input = Array.isArray(body.listings) ? body.listings : [];
  const normalized = input.slice(0, 100).map(normalizeListing);
  const valid = normalized.filter(isValid);
  const skipped = normalized.length - valid.length;
  if (!valid.length) return json(400, { ok: false, error: 'Ninguna fila válida. Revisa marca, modelo, año, precio, WhatsApp de 10 dígitos y al menos una foto URL.' });
  try {
    const res = await insertRows(valid);
    const inserted = await res.json().catch(() => []);
    return json(200, { ok: true, inserted: Array.isArray(inserted) ? inserted.length : valid.length, skipped });
  } catch (e) {
    console.error('import-inventory failed', e);
    return json(500, { ok: false, error: e.message || 'Supabase no pudo importar inventario' });
  }
};
