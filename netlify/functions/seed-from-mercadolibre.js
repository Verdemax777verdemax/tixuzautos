// Tixuz Autos — Seed from MercadoLibre
// Trae autos usados de la API pública de MercadoLibre México (MLM1744 = Autos y Camionetas)
// y los inserta en Supabase con source='mercadolibre'. Cada listing guarda el link al
// anuncio original para que el botón "Ver en MercadoLibre" lleve al comprador al vendedor real.
//
// Requiere env var en Netlify:
//   SUPABASE_SERVICE_ROLE_KEY  (service role key — NO lo hardcodees, ponlo en Site settings > Environment variables)
//
// Admin password opcional:
//   SEED_ADMIN_PASSWORD  (si está puesto, la llamada debe incluir ?pass=... que coincida)

const SUPABASE_URL = 'https://rbiuoljoduekajivffzh.supabase.co';
const SUPABASE_TABLE = 'marketplace_listings';
const ML_CATEGORY = 'MLM1744'; // Autos y Camionetas MX
const ML_SEARCH = 'https://api.mercadolibre.com/sites/MLM/search';
const ML_ITEM = 'https://api.mercadolibre.com/items/';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.SITE_URL || 'https://cool-kataifi-78a65b.netlify.app',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store'
};

// --- Helpers ------------------------------------------------------------

function respond(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

function pickAttribute(attributes, id) {
  if (!Array.isArray(attributes)) return '';
  const found = attributes.find(a => a && a.id === id);
  if (!found) return '';
  return (found.value_name || (found.values && found.values[0] && found.values[0].name) || '').trim();
}

function normalizeTransmission(raw) {
  const v = String(raw || '').toLowerCase();
  if (v.indexOf('cvt') > -1) return 'CVT';
  if (v.indexOf('manu') > -1 || v.indexOf('estándar') > -1 || v.indexOf('estandar') > -1) return 'Manual';
  if (v.indexOf('auto') > -1 || v.indexOf('tiptron') > -1 || v.indexOf('dsg') > -1 || v.indexOf('pdk') > -1) return 'Automática';
  return 'Automática';
}

function normalizeFuel(raw) {
  const v = String(raw || '').toLowerCase();
  if (v.indexOf('eléct') > -1 || v.indexOf('elect') > -1) return 'Eléctrico';
  if (v.indexOf('híbri') > -1 || v.indexOf('hibri') > -1) return 'Híbrido';
  if (v.indexOf('dies') > -1 || v.indexOf('diés') > -1) return 'Diésel';
  if (v.indexOf('gas ') > -1 && v.indexOf('lp') > -1) return 'Gasolina';
  return 'Gasolina';
}

function parseKm(raw) {
  if (!raw) return 0;
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (!digits) return 0;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}

function normalizeImageUrl(url) {
  if (!url) return '';
  // ML thumbnails come in low-res -I.jpg; swap for -F.jpg (full) and force https
  let u = String(url).replace(/^http:\/\//, 'https://');
  u = u.replace(/-I\.(jpg|jpeg|png|webp)$/i, '-F.$1');
  u = u.replace(/-S\.(jpg|jpeg|png|webp)$/i, '-F.$1');
  return u;
}

function buildLocation(address, city, state) {
  const c = (city || (address && address.city_name) || '').trim();
  const s = (state || (address && address.state_name) || '').trim();
  if (c && s) return c + ', ' + s;
  return c || s || 'México';
}

function shuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = out[i]; out[i] = out[j]; out[j] = t;
  }
  return out;
}

// --- MercadoLibre fetching ----------------------------------------------

async function fetchMLSearch(offset, limit) {
  const url = `${ML_SEARCH}?category=${ML_CATEGORY}&condition=used&limit=${limit}&offset=${offset}`;
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw new Error('MercadoLibre search falló: ' + r.status);
  return r.json();
}

async function fetchMLItem(id) {
  try {
    const r = await fetch(ML_ITEM + encodeURIComponent(id), { headers: { 'Accept': 'application/json' } });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

function resultHasMinimumData(item) {
  if (!item || !item.id || !item.permalink) return false;
  if (!item.price || Number(item.price) < 20000) return false; // filter garbage
  if (Number(item.price) > 5000000) return false; // filter outliers
  const make = pickAttribute(item.attributes, 'BRAND');
  const model = pickAttribute(item.attributes, 'MODEL');
  const year = pickAttribute(item.attributes, 'VEHICLE_YEAR');
  if (!make || !model || !year) return false;
  return true;
}

async function buildListingFromML(raw, fetchFullDetail) {
  const make = pickAttribute(raw.attributes, 'BRAND');
  const model = pickAttribute(raw.attributes, 'MODEL');
  const year = parseInt(pickAttribute(raw.attributes, 'VEHICLE_YEAR'), 10) || 0;
  const km = parseKm(pickAttribute(raw.attributes, 'KILOMETERS'));
  const transmission = normalizeTransmission(pickAttribute(raw.attributes, 'TRANSMISSION'));
  const fuel = normalizeFuel(pickAttribute(raw.attributes, 'FUEL_TYPE'));
  const color = pickAttribute(raw.attributes, 'COLOR') || 'No especificado';

  let images = [];
  let description = raw.title || `${make} ${model} ${year}`.trim();

  if (fetchFullDetail) {
    const detail = await fetchMLItem(raw.id);
    if (detail && Array.isArray(detail.pictures) && detail.pictures.length) {
      images = detail.pictures.slice(0, 8).map(p => normalizeImageUrl(p.secure_url || p.url));
    }
  }
  if (!images.length && raw.thumbnail) {
    images = [normalizeImageUrl(raw.thumbnail)];
  }

  const city = (raw.address && raw.address.city_name) || '';
  const state = (raw.address && raw.address.state_name) || (raw.seller_address && raw.seller_address.state && raw.seller_address.state.name) || '';
  const location = buildLocation(raw.address, city, state);

  return {
    make,
    model,
    year,
    price: Math.round(Number(raw.price) || 0),
    mileage: km,
    transmission,
    fuel_type: fuel,
    color,
    location,
    description,
    images,
    seller_name: 'MercadoLibre',
    seller_whatsapp: '',
    seller_pin: '',
    seller_type: 'Agregado',
    featured: false,
    plan: 'basic',
    status: 'active',
    expires_at: new Date(Date.now() + 60 * 86400000).toISOString(),
    stripe_ref: 'ml-' + raw.id,
    source: 'mercadolibre',
    source_url: raw.permalink,
    is_demo: false
  };
}

// --- Supabase insert (tries with source fields, falls back without) ----

async function supabaseInsert(rows, serviceKey) {
  const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?on_conflict=stripe_ref`;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': 'Bearer ' + serviceKey,
    'Prefer': 'resolution=merge-duplicates,return=representation'
  };
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(rows) });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!r.ok) {
    // If the error mentions source or source_url, retry without those fields
    const errMsg = (data && data.message) || text || '';
    if (/source|source_url/i.test(errMsg)) {
      const stripped = rows.map(row => {
        const copy = Object.assign({}, row);
        delete copy.source;
        delete copy.source_url;
        return copy;
      });
      const r2 = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?on_conflict=stripe_ref`, {
        method: 'POST',
        headers,
        body: JSON.stringify(stripped)
      });
      const t2 = await r2.text();
      let d2 = null;
      try { d2 = t2 ? JSON.parse(t2) : null; } catch (_) { d2 = t2; }
      if (!r2.ok) throw new Error('Supabase insert (fallback) falló: ' + (d2 && d2.message || t2 || r2.status));
      return { data: d2, warning: 'Inserté sin las columnas source/source_url — corre SUPABASE_MIGRATION_V13.sql para habilitarlas.' };
    }
    throw new Error('Supabase insert falló: ' + (errMsg || r.status));
  }
  return { data };
}

// --- Main handler -------------------------------------------------------

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: JSON_HEADERS, body: '' };
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return respond(500, {
      ok: false,
      error: 'Falta SUPABASE_SERVICE_ROLE_KEY en las Environment Variables de Netlify. Agrégala en Site settings > Environment variables y vuelve a intentar.'
    });
  }

  // Esta funcion inserta inventario activo con service_role.
  // Queda cerrada por defecto; habilitala solo con SEED_ADMIN_PASSWORD.
  const adminPass = process.env.SEED_ADMIN_PASSWORD;
  const qp = event.queryStringParameters || {};
  if (!adminPass) {
    return respond(403, { ok: false, error: 'Seed deshabilitado. Configura SEED_ADMIN_PASSWORD solo cuando vayas a usarlo.' });
  }
  if (qp.pass !== adminPass) {
    return respond(401, { ok: false, error: 'Contraseña de seed incorrecta' });
  }

  const requestedCount = Math.max(1, Math.min(50, parseInt(qp.count || '20', 10) || 20));
  const fetchDetails = qp.details !== '0'; // default ON

  try {
    // Fetch a pool of candidates, using a random offset so repeated seeds bring variety
    const randomOffset = Math.floor(Math.random() * 400); // ML exposes first ~1000 results
    const searchResp = await fetchMLSearch(randomOffset, 50);
    const results = (searchResp && searchResp.results) || [];
    if (!results.length) {
      return respond(502, { ok: false, error: 'MercadoLibre no devolvió resultados' });
    }

    // Filter, shuffle, slice
    const valid = results.filter(resultHasMinimumData);
    if (!valid.length) {
      return respond(502, { ok: false, error: 'Ningún resultado de MercadoLibre pasó el filtro mínimo' });
    }

    // Diversity: prefer not repeating the same make more than 3 times
    const byMake = {};
    const shuffled = shuffle(valid);
    const chosen = [];
    for (const item of shuffled) {
      const m = pickAttribute(item.attributes, 'BRAND') || '_';
      byMake[m] = (byMake[m] || 0);
      if (byMake[m] >= 3) continue;
      chosen.push(item);
      byMake[m]++;
      if (chosen.length >= requestedCount) break;
    }
    // If diversity filter left us short, fill with remaining
    if (chosen.length < requestedCount) {
      for (const item of shuffled) {
        if (chosen.indexOf(item) === -1) chosen.push(item);
        if (chosen.length >= requestedCount) break;
      }
    }

    // Build listings (optionally fetch full item detail for pictures)
    const listings = [];
    for (const item of chosen) {
      try {
        const row = await buildListingFromML(item, fetchDetails);
        if (row.make && row.model && row.price > 0) listings.push(row);
      } catch (e) {
        // skip bad item
      }
    }

    if (!listings.length) {
      return respond(502, { ok: false, error: 'No pude normalizar ningún listing de MercadoLibre' });
    }

    const { data, warning } = await supabaseInsert(listings, serviceKey);

    return respond(200, {
      ok: true,
      requested: requestedCount,
      fetched_from_ml: results.length,
      valid_candidates: valid.length,
      inserted: Array.isArray(data) ? data.length : listings.length,
      sample: listings.slice(0, 3).map(l => ({ make: l.make, model: l.model, year: l.year, price: l.price, location: l.location, source_url: l.source_url })),
      warning: warning || undefined
    });
  } catch (err) {
    return respond(500, { ok: false, error: err.message || 'Error inesperado en seed' });
  }
};
