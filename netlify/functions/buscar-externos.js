// ============================================================
// buscar-vivo.js - CAPA 2: busqueda viva hibrida
// Busca en tiempo real por portal, normaliza anuncios, balancea fuentes
// y enriquece thumbnail_url con og:image cuando el portal lo permite.
// GET /api/buscar-vivo?q=tucson%202020%20guadalajara
// ============================================================
const { sb, hash, json, cors, checkRateLimit, hasPII, requireEnv } = require('./_shared');
const {
  discover: discoverSeminuevos,
  extractListing: extractSeminuevosListing,
  vehicleIdFromUrl,
  isSeminuevosVehicleUrl,
  isListingImage: isSeminuevosListingImage
} = require('./seminuevos-discover.cjs');
const {
  discover: discoverAutocosmos,
  extractListing: extractAutocosmosListing,
  autocosmosIdFromUrl,
  isAutocosmosVehicleUrl
} = require('./autocosmos-discover.cjs');
const {
  discover: discoverNissan,
  nissanIdFromUrl,
  isNissanVehicleUrl
} = require('./nissan-discover.cjs');
const {
  discover: discoverCarOne,
  isCarOneVehicleUrl
} = require('./carone-discover.cjs');
const {
  discover: discoverGocar,
  isGocarVehicleUrl
} = require('./gocar-discover.cjs');
const { attachVeredictos } = require('./veredicto.cjs');
const { buscarPorTexto } = require('./lib/fuentes-externas.cjs');
const { fetchPublicListings } = require('./seo-utils.cjs');

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const SERPER_KEY = process.env.SERPER_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_SEARCH_MODEL = process.env.OPENAI_SEARCH_MODEL || 'gpt-4.1-mini';
const CACHE_VERSION = 'multiportal-veredicto-v7-focused-fanout';
const MIN_PORTAL_TARGET = 8;
const LIVE_RESULT_LIMIT = 24;
const PORTALS = [
  { domain: 'seminuevos.com', label: 'Seminuevos' },
  { domain: 'autos.mercadolibre.com.mx', label: 'MercadoLibre' },
  { domain: 'kavak.com', label: 'Kavak' },
  { domain: 'autocosmos.com.mx', label: 'AutoCosmos' },
  { domain: 'automexico.com', label: 'Automexico' },
  { domain: 'www.daltonseminuevos.com.mx', label: 'Dalton Seminuevos' },
  { domain: 'clikauto.com', label: 'ClikAuto' },
  { domain: 'www.gruporivero.com', label: 'Grupo Rivero' }
];
const BAD_THUMBNAIL_PATTERNS = [
  'main-hero',
  'placeholder',
  'default',
  'logo',
  'sprite',
  'no-image',
  'not-available',
  'source.unsplash.com',
  'mlstatic.com/d_nq_np_2x_944019-mlm49701901904_042022-f',
  'mlstatic.com/d_nq_np_2x_975019-mlm46001901904_052021-f',
  'mlstatic.com/d_nq_np_2x_988019-mlm46001901904_052021-f'
];

function publicListingMatchesQuery(listing, q) {
  const queryTokens = normTextForKey(q).split(/\s+/).filter(token => token.length >= 3);
  if (!queryTokens.length) return false;
  const text = normTextForKey([
    listing.title,
    listing.make,
    listing.model,
    listing.location,
    listing.description,
    listing.transmission,
    listing.fuelType,
    listing.color,
  ].filter(Boolean).join(' '));
  return queryTokens.every(token => text.includes(token));
}

async function searchOwnInventory(q, limit = 12) {
  try {
    const listings = await fetchPublicListings(100);
    return listings
      .filter(listing => publicListingMatchesQuery(listing, q))
      .slice(0, limit)
      .map(listing => ({
        marca: listing.make,
        modelo: listing.model,
        anio: listing.year,
        precio: listing.price,
        km: listing.mileage,
        ubicacion: listing.location,
        portal: 'Tixuz Autos',
        url: listing.url,
        thumbnail_url: listing.images?.[0] || null,
        imagen_tipo: listing.images?.[0] ? 'real_source' : 'placeholder',
      }));
  } catch (err) {
    console.warn('buscar-vivo own_inventory_fallback_error', String(err.message || err));
    return [];
  }
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, done: () => clearTimeout(timer) };
}

const KNOWN_MODEL_INTENTS = [
  { re: /\baveo\b/i, marca: 'Chevrolet', modelo: 'Aveo' },
  { re: /\bjetta\b/i, marca: 'Volkswagen', modelo: 'Jetta' },
  { re: /\bversa\b/i, marca: 'Nissan', modelo: 'Versa' },
  { re: /\bsentra\b/i, marca: 'Nissan', modelo: 'Sentra' },
  { re: /\bmarch\b/i, marca: 'Nissan', modelo: 'March' },
  { re: /\bcx[-\s]?5\b/i, marca: 'Mazda', modelo: 'CX-5' },
  { re: /\bcx[-\s]?30\b/i, marca: 'Mazda', modelo: 'CX-30' },
  { re: /\bmazda\s*3\b|\bmazda3\b/i, marca: 'Mazda', modelo: '3' },
  { re: /\bcr[-\s]?v\b|\bcrv\b/i, marca: 'Honda', modelo: 'CR-V' },
  { re: /\bcivic\b/i, marca: 'Honda', modelo: 'Civic' },
  { re: /\bcorolla\b/i, marca: 'Toyota', modelo: 'Corolla' },
  { re: /\bhilux\b/i, marca: 'Toyota', modelo: 'Hilux' },
  { re: /\brav[-\s]?4\b|\brav4\b/i, marca: 'Toyota', modelo: 'RAV4' },
  { re: /\bforte\b/i, marca: 'Kia', modelo: 'Forte' },
  { re: /\brio\b/i, marca: 'Kia', modelo: 'Rio' },
  { re: /\btucson\b/i, marca: 'Hyundai', modelo: 'Tucson' },
  { re: /\besplorer\b|\bexplorer\b/i, marca: 'Ford', modelo: 'Explorer' },
  { re: /\bespace\b|\bescape\b/i, marca: 'Ford', modelo: 'Escape' },
  { re: /\bmaverick\b/i, marca: 'Ford', modelo: 'Maverick' },
  { re: /\btracker\b/i, marca: 'Chevrolet', modelo: 'Tracker' },
  { re: /\btrax\b/i, marca: 'Chevrolet', modelo: 'Trax' },
  { re: /\bonix\b/i, marca: 'Chevrolet', modelo: 'Onix' }
];

function knownSearchIntent(q, ciudad) {
  const text = String(q || '');
  const found = KNOWN_MODEL_INTENTS.find(item => item.re.test(text));
  return found ? { marca: found.marca, modelo: found.modelo, ciudad: ciudad || '' } : null;
}

function parseIntentJson(txt) {
  try {
    const clean = String(txt || '').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    const marca = String(parsed.marca || '').trim();
    const modelo = String(parsed.modelo || '').trim();
    if (!marca || !modelo) return null;
    return { marca, modelo, ciudad: String(parsed.ciudad || '').trim() };
  } catch (_) {
    return null;
  }
}

async function searchIntentWithAI(q, ciudad) {
  if (!OPENAI_API_KEY) return null;
  const prompt = `Convierte esta busqueda libre de auto usado en Mexico a marca y modelo.
Devuelve SOLO JSON valido con esta forma:
{"marca":"","modelo":"","ciudad":""}
Reglas:
- No inventes si no hay modelo claro; deja marca/modelo vacios.
- "aveo" => {"marca":"Chevrolet","modelo":"Aveo"}.
- Usa ciudad del filtro si viene.
Busqueda: ${JSON.stringify(q)}
Ciudad filtro: ${JSON.stringify(ciudad || '')}`;

  const { controller, done } = withTimeout(5000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 180
      }),
      signal: controller.signal
    });
    if (!res.ok) return null;
    const data = await res.json();
    return parseIntentJson(data.choices?.[0]?.message?.content);
  } catch (_) {
    return null;
  } finally {
    done();
  }
}

async function resolveSearchIntent(q, ciudad) {
  return knownSearchIntent(q, ciudad) || await searchIntentWithAI(q, ciudad);
}

async function mapLimit(items, limit, mapper) {
  const out = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      out[current] = await mapper(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function portalQuery(q, portal) {
  return `${q} autos usados venta site:${portal.domain}`;
}

async function searchSerpAPI(q, portal) {
  requireEnv('SERPAPI_KEY', SERPAPI_KEY);
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(portalQuery(q, portal))}&hl=es&gl=mx&num=6&api_key=${SERPAPI_KEY}`;
  const { controller, done } = withTimeout(8000);
  const res = await fetch(url, { signal: controller.signal }).finally(done);
  if (!res.ok) throw new Error('serpapi_fail');
  const data = await res.json();
  return (data.organic_results || []).map(r => ({
    title: r.title,
    link: r.link,
    snippet: r.snippet,
    source: r.source || portal.label,
    portalHint: portal.label,
    domain: portal.domain,
    thumbnail_url: r.thumbnail || r.rich_snippet?.top?.thumbnail || null
  }));
}

async function searchSerper(q, portal) {
  requireEnv('SERPER_API_KEY', SERPER_KEY);
  const { controller, done } = withTimeout(8000);
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: portalQuery(q, portal), gl: 'mx', hl: 'es', num: 6 }),
    signal: controller.signal
  }).finally(done);
  if (!res.ok) throw new Error('serper_fail');
  const data = await res.json();
  return (data.organic || []).map(r => ({
    title: r.title,
    link: r.link,
    snippet: r.snippet,
    source: r.source || portal.label,
    portalHint: portal.label,
    domain: portal.domain,
    thumbnail_url: r.imageUrl || null
  }));
}

async function searchPortal(q, portal) {
  const errors = [];
  if (SERPAPI_KEY) {
    try { return await searchSerpAPI(q, portal); } catch (e) { errors.push(e.message); }
  }
  if (SERPER_KEY) {
    try { return await searchSerper(q, portal); } catch (e) { errors.push(e.message); }
  }
  throw new Error(`${portal.label}:${errors.join(',') || 'no_search_provider'}`);
}

function extractOpenAIText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  const chunks = [];
  for (const item of data.output || []) {
    for (const part of item.content || []) {
      if (typeof part.text === 'string') chunks.push(part.text);
    }
  }
  return chunks.join('\n').trim();
}

function parseJsonArrayLoose(txt) {
  const clean = String(txt || '').replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {}

  const start = clean.indexOf('[');
  const end = clean.lastIndexOf(']');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(clean.slice(start, end + 1));
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {}
  }

  const objects = [];
  const re = /\{[^{}]*"url"\s*:\s*"https?:\/\/[^"]+"[^{}]*\}/g;
  for (const match of clean.matchAll(re)) {
    try { objects.push(JSON.parse(match[0])); } catch (_) {}
  }
  return objects;
}

async function searchOpenAIWeb(q) {
  requireEnv('OPENAI_API_KEY', OPENAI_API_KEY);
  const prompt = `Busca en la web autos usados reales en Mexico para: "${q}".
Consulta y mezcla, cuando existan resultados, estos portales: Seminuevos, MercadoLibre Mexico, Kavak, AutoCosmos, SoloAutos, Automexico, Dalton Seminuevos, Cambiauto, ClikAuto, Grupo Rivero, Car One, Seminuevos Gocar, Nissan Seminuevos, Spoticar y Seminuevos Autotrader.
Devuelve SOLO un array JSON, sin markdown ni texto extra, de maximo 16 objetos con esta forma exacta:
[{"marca":"","modelo":"","anio":2020,"precio":250000,"ubicacion":"","portal":"","url":"","thumbnail_url":null}]
Reglas:
- Prioriza anuncios o paginas especificas de autos usados/seminuevos en Mexico.
- Balancea portales: si hay resultados de varios portales, intenta cubrir al menos 8 portales distintos.
- Cada objeto debe representar un anuncio o pagina especifica de autos, no una nota ni guia.
- precio debe ser numero entero en MXN o null si no aparece claro.
- anio debe ser numero de 4 digitos o null.
- url debe ser una URL real vista en la busqueda.
- thumbnail_url debe ser una URL de imagen real solo si aparece en la busqueda; si no aparece usa null.
- No incluyas telefonos, correos ni datos personales.`;

  const { controller, done } = withTimeout(12000);
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_SEARCH_MODEL,
      tools: [{ type: 'web_search_preview' }],
      tool_choice: 'auto',
      max_output_tokens: 2500,
      input: prompt
    }),
    signal: controller.signal
  }).finally(done);
  if (!res.ok) throw new Error(`openai_search_fail_${res.status}`);
  const data = await res.json();
  return parseJsonArrayLoose(extractOpenAIText(data));
}

function balancedRaw(raw, limit = 20) {
  const byPortal = new Map();
  for (const item of raw) {
    const key = item.portalHint || item.domain || item.source || 'otro';
    if (!byPortal.has(key)) byPortal.set(key, []);
    byPortal.get(key).push(item);
  }
  const out = [];
  while (out.length < limit && [...byPortal.values()].some(list => list.length)) {
    for (const list of byPortal.values()) {
      const next = list.shift();
      if (next) out.push(next);
      if (out.length >= limit) break;
    }
  }
  return out;
}

async function normalizar(q, raw) {
  requireEnv('OPENAI_API_KEY', OPENAI_API_KEY);
  const prompt = `Eres un normalizador de anuncios de autos usados en Mexico. Te doy resultados de busqueda crudos. Devuelve SOLO un array JSON (sin markdown, sin texto extra) de maximo 16 objetos con esta forma exacta:
[{"marca":"","modelo":"","anio":2020,"precio":250000,"ubicacion":"","portal":"","url":"","thumbnail_url":null}]
Reglas:
- precio en pesos MXN como numero entero, sin simbolos. Si no hay precio claro, usa null.
- anio como numero de 4 digitos o null.
- NO inventes precios: si el snippet no lo dice, null.
- portal = nombre del sitio. Respeta portalHint si viene en el resultado crudo (Seminuevos, MercadoLibre, Kavak, AutoCosmos, SoloAutos, Automexico, Dalton Seminuevos, Cambiauto, ClikAuto, Grupo Rivero, Spoticar, Odetta, Autotrader Seminuevos).
- url = el link exacto del resultado.
- thumbnail_url = la imagen/thumbnail exacta del resultado crudo si existe; si no existe usa null. No inventes imagen.
- Descarta resultados que no sean un anuncio de auto especifico.
- Balancea portales: si existen resultados validos de varios portales, intenta cubrir al menos 8 portales distintos antes de repetir portal.
Busqueda del usuario: "${q}"
Resultados crudos:
${JSON.stringify(raw).slice(0, 7000)}`;

  const { controller, done } = withTimeout(10000);
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1400
    }),
    signal: controller.signal
  }).finally(done);
  if (!res.ok) return [];
  const data = await res.json();
  let txt = data.choices?.[0]?.message?.content || '[]';
  return parseJsonArrayLoose(txt);
}

function precioValido(p) {
  if (p === null || p === undefined) return true;
  return typeof p === 'number' && p >= 20000 && p <= 5000000;
}

function isBadThumbnail(url) {
  const s = String(url || '').toLowerCase();
  if (!s) return true;
  return BAD_THUMBNAIL_PATTERNS.some(pattern => s.includes(pattern));
}

function isLikelyIndividualListing(url) {
  let parsed;
  try { parsed = new URL(url); } catch (_) { return false; }
  const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
  const path = decodeURIComponent(parsed.pathname || '').toLowerCase();

  if (/mercadolibre\.com\.mx$/.test(host)) return /\/mlm-\d+/i.test(path) || /[_-]mlm\d+/i.test(path);
  if (/autos\.mercadolibre\.com\.mx$/.test(host)) return /\/mlm-\d+/i.test(path) || /[_-]mlm\d+/i.test(path);
  if (/kavak\.com/.test(host)) return /\/mx\/.*\/(compra|auto|usado|seminuevo)/i.test(path) && /\d{4}/.test(path);
  if (/autocosmos\.com\.mx/.test(host)) return /\/auto\/usado\/[^/]+\/[^/]+\/[^/]+\/[a-f0-9]{32}(?:\/)?$/i.test(path)
    || (/\/auto\/|\/autos\/usados\//i.test(path) && /\d{4}/.test(path) && /\d{5,}/.test(path));
  if (/seminuevos\.nissan\.com\.mx/.test(host)) return isNissanVehicleUrl(url);
  if (/carone\.com\.mx/.test(host)) return isCarOneVehicleUrl(url);
  if (/seminuevosgocar\.mx/.test(host)) return isGocarVehicleUrl(url);
  if (/soloautos\.mx/.test(host)) return /(auto|vehiculo|seminuevo|usado)/i.test(path) && /\d{4}/.test(path + parsed.search);
  if (/automexico\.com/.test(host)) return /(auto|autos|venta|usado)/i.test(path) && /\d{4}/.test(path + parsed.search) && !/industria|mantenimiento|noticias|precio-mexico/i.test(path);
  if (/daltonseminuevos\.com\.mx/.test(host)) return /(seminuevo|auto|autos|remate)/i.test(path) && (/\d{4}/.test(path + parsed.search) || /\/[^/]+-seminuevo\/[^/]+/i.test(path));
  if (/cambiauto\.mx/.test(host)) return /(auto|vehiculo|seminuevo|usado)/i.test(path) && /\d{4}/.test(path + parsed.search);
  if (/clikauto\.com/.test(host)) return /(auto|vehiculo|seminuevo|usado|catalogo)/i.test(path) && /\d{4}/.test(path + parsed.search);
  if (/gruporivero\.com/.test(host)) return /(auto|autos|seminuevo|usado|catalogo)/i.test(path) && /\d{4}/.test(path + parsed.search);
  if (/spoticar\.com\.mx/.test(host)) return /(auto|autos|vehiculo|seminuevo|usado)/i.test(path) && /\d{4}/.test(path + parsed.search);
  if (/odetta\.com/.test(host)) return /(auto|autos|vehiculo|seminuevo|usado)/i.test(path) && /\d{4}/.test(path + parsed.search);
  if (/seminuevos/.test(host)) return /\/vehicle\/[^/]+\/\d+(?:\/)?$/i.test(path)
    || (/\/autos\/.*\d{4}/i.test(path) && /\d{4,}/.test(path) && !/[?&](marca|modelo|estado|precio)/i.test(parsed.search));

  return /\d{4}/.test(path) && /(auto|autos|usado|seminuevo|venta)/i.test(path) && /\d{5,}/.test(path);
}

function imageTipoForUrl(url, thumbnailUrl) {
  if (!thumbnailUrl || isBadThumbnail(thumbnailUrl)) return 'placeholder';
  return isLikelyIndividualListing(url) ? 'real_source' : 'referencial';
}

function cleanCar(c) {
  const priceDigits = String(c.precio ?? '').replace(/[^\d]/g, '');
  const yearDigits = String(c.anio ?? '').match(/\b(19|20)\d{2}\b/)?.[0] || String(c.anio ?? '').replace(/[^\d]/g, '').slice(0, 4);
  const kmDigits = String(c.km ?? '').replace(/[^\d]/g, '');
  const url = String(c.url || c.fuente_url || '').trim();
  const thumbnail = /^https?:\/\//.test(String(c.thumbnail_url || '')) && !isBadThumbnail(c.thumbnail_url) ? c.thumbnail_url : null;
  return {
    ...c,
    marca: String(c.marca || '').trim(),
    modelo: String(c.modelo || '').trim(),
    anio: yearDigits ? Number(yearDigits) : null,
    precio: priceDigits ? Number(priceDigits) : null,
    km: kmDigits ? Number(kmDigits) : null,
    ubicacion: String(c.ubicacion || '').trim(),
    portal: String(c.portal || c.fuente_portal || '').trim(),
    url,
    thumbnail_url: thumbnail,
    imagen_tipo: c.imagen_tipo || imageTipoForUrl(url, thumbnail)
  };
}

function stableListingKey(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    if (isNissanVehicleUrl(raw)) return `nissan:${nissanIdFromUrl(raw) || raw.toLowerCase()}`;
  } catch (_) {}
  return raw.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
}

function dedupeCars(cars) {
  const seenUrl = new Set();
  const seenSpec = new Set();
  const out = [];
  for (const car of cars) {
    const urlKey = stableListingKey(car.url);
    const specKey = [
      String(car.marca || '').toLowerCase(),
      String(car.modelo || '').toLowerCase(),
      String(car.anio || ''),
      String(car.precio || '')
    ].join('|');
    const canUseSpecKey = Boolean(car.marca && car.modelo && car.anio && car.precio);
    if ((urlKey && seenUrl.has(urlKey)) || (canUseSpecKey && seenSpec.has(specKey))) continue;
    if (urlKey) seenUrl.add(urlKey);
    if (canUseSpecKey) seenSpec.add(specKey);
    out.push(car);
  }
  return out;
}

function carHasVisiblePII(car) {
  return hasPII({
    marca: car.marca,
    modelo: car.modelo,
    anio: car.anio,
    precio: car.precio,
    ubicacion: car.ubicacion,
    portal: car.portal
  });
}

function hostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return ''; }
}

function normalizePortalName(car) {
  const host = hostFromUrl(car.url);
  if (/mercadolibre/.test(host)) return 'MercadoLibre';
  if (/kavak/.test(host)) return 'Kavak';
  if (/autocosmos/.test(host)) return 'AutoCosmos';
  if (/seminuevos\.nissan\.com\.mx/.test(host)) return 'Nissan Seminuevos';
  if (/seminuevosgocar\.mx/.test(host)) return 'Seminuevos Gocar';
  if (/carone\.com\.mx/.test(host)) return 'Car One';
  if (/soloautos\.mx/.test(host)) return 'SoloAutos';
  if (/automexico\.com/.test(host)) return 'Automexico';
  if (/daltonseminuevos\.com\.mx/.test(host)) return 'Dalton Seminuevos';
  if (/cambiauto\.mx/.test(host)) return 'Cambiauto';
  if (/clikauto\.com/.test(host)) return 'ClikAuto';
  if (/gruporivero\.com/.test(host)) return 'Grupo Rivero';
  if (/spoticar\.com\.mx/.test(host)) return 'Spoticar';
  if (/odetta\.com/.test(host)) return 'Odetta';
  if (/autotrader/.test(host)) return 'Autotrader Seminuevos';
  if (/seminuevos/.test(host)) return 'Seminuevos';
  return car.portal || 'Portal externo';
}

function tokensForIntent(value) {
  return normTextForKey(value).split(' ').filter(Boolean);
}

function textMatchesIntent(text, intent) {
  if (!intent?.marca && !intent?.modelo) return true;
  const normalized = normTextForKey(text);
  const marcaTokens = tokensForIntent(intent.marca);
  const modeloTokens = tokensForIntent(intent.modelo);
  return marcaTokens.every(token => normalized.includes(token))
    && modeloTokens.every(token => normalized.includes(token));
}

function carMatchesIntent(car, intent) {
  if (!intent?.marca && !intent?.modelo) return true;
  return textMatchesIntent(`${car.marca || ''} ${car.modelo || ''} ${car.url || ''}`, intent);
}

function urlMatchesIntentModel(url, intent) {
  const modeloTokens = tokensForIntent(intent?.modelo);
  if (!modeloTokens.length) return true;
  const normalizedUrl = normTextForKey(decodeURIComponent(String(url || '')));
  return modeloTokens.every(token => normalizedUrl.includes(token));
}

function rawMatchesIntent(item, intent) {
  if (!intent?.marca && !intent?.modelo) return true;
  const text = `${item.title || ''} ${item.snippet || ''} ${item.link || ''}`;
  const normalized = normTextForKey(text);
  const modeloTokens = tokensForIntent(intent.modelo);
  if (modeloTokens.length) return modeloTokens.every(token => normalized.includes(token));
  return textMatchesIntent(text, intent);
}

function isUsefulSupplementalUrl(url) {
  try {
    const parsed = new URL(url);
    const path = decodeURIComponent(parsed.pathname || '').toLowerCase();
    if (!path || path === '/') return false;
    if (/\/(blog|industria|mantenimiento|noticias|news|tips)\b/i.test(path)) return false;
    return true;
  } catch (_) {
    return false;
  }
}

function slugForSource(value) {
  return normTextForKey(value).replace(/\s+/g, '-');
}

function canonicalPortalCandidates(intent) {
  if (!intent?.marca || !intent?.modelo) return [];
  const make = slugForSource(intent.marca);
  const model = slugForSource(intent.modelo);
  const upperModel = String(intent.modelo || '').trim().toUpperCase().replace(/\s+/g, '-');
  return [
    { portal: 'Automexico', url: `https://automexico.com/autos-${make}-${model}`, timeoutMs: 1200 },
    { portal: 'Dalton Seminuevos', url: `https://www.daltonseminuevos.com.mx/${make}-seminuevo/${model}`, timeoutMs: 4200 },
    { portal: 'ClikAuto', url: `https://clikauto.com/autos-seminuevos/search-${encodeURIComponent(upperModel)}`, timeoutMs: 3600 },
    { portal: 'MercadoLibre', url: `https://autos.mercadolibre.com.mx/${make}/${model}/`, timeoutMs: 2200 },
    { portal: 'Kavak', url: `https://www.kavak.com/mx/seminuevos/${make}/${model}`, timeoutMs: 2200 }
  ];
}

function firstPriceFromText(text) {
  const match = String(text || '').match(/\$\s?([\d,.]{5,})/) || String(text || '').match(/\b([\d,.]{5,})\s?(?:mxn|pesos)\b/i);
  if (!match?.[1]) return null;
  const value = Number(match[1].replace(/[^\d]/g, ''));
  return precioValido(value) ? value : null;
}

async function validateCanonicalSource(q, intent, candidate) {
  if (!candidate?.url || !isUsefulSupplementalUrl(candidate.url)) return null;
  const { controller, done } = withTimeout(candidate.timeoutMs || 2200);
  try {
    const res = await fetch(candidate.url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TixuzAutosAggregator/1.0; +https://tixuzautos.com)',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 220000);
    const pageText = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
    if (!textMatchesIntent(`${candidate.url} ${pageText}`, intent)) return null;
    const queryYear = String(q || '').match(/\b(19|20)\d{2}\b/)?.[0];
    const image = extractOgImage(html, res.url || candidate.url);
    return cleanCar({
      marca: intent.marca,
      modelo: intent.modelo,
      anio: queryYear ? Number(queryYear) : null,
      precio: firstPriceFromText(pageText),
      ubicacion: '',
      portal: candidate.portal,
      fuente_portal: candidate.portal,
      url: res.url || candidate.url,
      fuente_url: res.url || candidate.url,
      thumbnail_url: image,
      imagen_tipo: imageTipoForUrl(res.url || candidate.url, image),
      source_kind: 'verified_source_page'
    });
  } catch (_) {
    return null;
  } finally {
    done();
  }
}

async function buildCanonicalSourceCars(q, intent, excludedPortals = new Set()) {
  const candidates = canonicalPortalCandidates(intent)
    .filter(candidate => !excludedPortals.has(candidate.portal));
  if (!candidates.length) return [];
  const settled = await Promise.allSettled(candidates.map(candidate => validateCanonicalSource(q, intent, candidate)));
  return settled
    .filter(result => result.status === 'fulfilled' && result.value)
    .map(result => result.value)
    .filter(car => carMatchesIntent(car, intent))
    .filter(car => !carHasVisiblePII(car));
}

function guessFromRaw(q, raw) {
  const intent = knownSearchIntent(q, '');
  const queryYear = String(q).match(/\b(19|20)\d{2}\b/)?.[0];
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  return raw.map(item => {
    const text = `${item.title || ''} ${item.snippet || ''}`;
    const year = text.match(/\b(19|20)\d{2}\b/)?.[0] || queryYear || null;
    const priceRaw = text.match(/\$\s?([\d,.]{5,})/)?.[1] || text.match(/\b([\d,.]{5,})\s?(?:mxn|pesos)\b/i)?.[1];
    const precio = priceRaw ? Number(priceRaw.replace(/[^\d]/g, '')) : null;
    const portal = item.portalHint || normalizePortalName({ url: item.link, portal: item.source });
    const marca = intent?.marca || tokens.find(t => /mazda|volkswagen|vw|nissan|toyota|honda|ford|chevrolet|kia|hyundai|bmw|mercedes/.test(t)) || '';
    let modelo = '';
    if (intent?.modelo) modelo = intent.modelo;
    else if (/cx[-\s]?5/i.test(q + ' ' + text)) modelo = 'CX-5';
    else if (/jetta/i.test(q + ' ' + text)) modelo = 'Jetta';
    else modelo = (item.title || '').replace(/\b(19|20)\d{2}\b/g, '').split(/[-|,]/)[0].trim().slice(0, 40);
    return {
      marca: marca ? marca.charAt(0).toUpperCase() + marca.slice(1) : 'Auto',
      modelo,
      anio: year ? Number(year) : null,
      precio: precioValido(precio) ? precio : null,
      ubicacion: /guadalajara/i.test(q + ' ' + text) ? 'Guadalajara, Jal.' : '',
      portal,
      url: item.link,
      thumbnail_url: item.thumbnail_url || null
    };
  });
}

function balanceCars(cars, limit = 10) {
  const buckets = new Map();
  for (const car of cars) {
    const portal = normalizePortalName(car);
    const normalized = { ...car, portal };
    if (!buckets.has(portal)) buckets.set(portal, []);
    buckets.get(portal).push(normalized);
  }
  const out = [];
  while (out.length < limit && [...buckets.values()].some(list => list.length)) {
    for (const list of buckets.values()) {
      const next = list.shift();
      if (next) out.push(next);
      if (out.length >= limit) break;
    }
  }
  return out;
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function absolutizeImage(src, pageUrl) {
  try { return new URL(src, pageUrl).href; } catch (_) { return null; }
}

function extractOgImage(html, pageUrl) {
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["'][^>]*>/i
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    const img = match?.[1] ? absolutizeImage(decodeHtml(match[1]), pageUrl) : null;
    if (/^https?:\/\//.test(String(img || '')) && !isBadThumbnail(img)) return img;
  }
  return null;
}

async function fetchOgImage(url) {
  if (!/^https?:\/\//.test(String(url || ''))) return null;
  if (isSeminuevosVehicleUrl(url)) {
    const detail = await extractSeminuevosListing(url, { timeoutMs: 8000 });
    const image = detail?.image_url || detail?.thumbnail_url || detail?.images?.[0]?.url || null;
    return image && isSeminuevosListingImage(url, image) ? image : null;
  }
  if (isAutocosmosVehicleUrl(url)) {
    const detail = await extractAutocosmosListing(url, { timeoutMs: 7000 });
    return detail?.image_verified ? detail.image_url || detail.thumbnail_url || null : null;
  }
  const { controller, done } = withTimeout(1600);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TixuzAutosAggregator/1.0; +https://tixuzautos.com)',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    if (!res.ok) return null;
    const html = await res.text();
    return extractOgImage(html.slice(0, 250000), res.url || url);
  } catch (_) {
    return null;
  } finally {
    done();
  }
}

async function enrichWithOgImages(cars) {
  const missing = cars.map((car, index) => ({ car, index })).filter(x => !x.car.thumbnail_url).slice(0, 6);
  const settled = await Promise.allSettled(missing.map(x => fetchOgImage(x.car.url)));
  const copy = cars.map(car => ({ ...car }));
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value) {
      copy[missing[i].index].thumbnail_url = result.value;
      copy[missing[i].index].imagen_tipo = imageTipoForUrl(copy[missing[i].index].url, result.value);
    }
  });
  return copy;
}

async function readStoredImageTrace(url) {
  if (!/^https?:\/\//i.test(String(url || ''))) return null;
  const enc = encodeURIComponent(url);
  const paths = [
    `agg_listing_images?fuente_url=eq.${enc}&select=*&limit=1`,
    `agg_listing_images?source_url=eq.${enc}&select=*&limit=1`
  ];
  for (const path of paths) {
    const res = await sb(path);
    if (res.ok && Array.isArray(res.data) && res.data.length) return res.data[0];
  }
  return null;
}

function imageTipoFromTrace(trace, car) {
  const direct = String(trace?.imagen_tipo || '').toLowerCase();
  if (['real_source', 'referencial', 'placeholder'].includes(direct)) return direct;
  const kind = String(trace?.image_kind || '').toLowerCase();
  if (kind.includes('placeholder')) return 'placeholder';
  if (kind.includes('referencial')) return 'referencial';
  if (kind.includes('real')) return isLikelyIndividualListing(car.url) ? 'real_source' : 'referencial';
  if (trace?.image_url) return imageTipoForUrl(car.url, trace.image_url);
  return car.imagen_tipo || imageTipoForUrl(car.url, car.thumbnail_url);
}

async function applyStoredImageTraces(cars) {
  const settled = await Promise.allSettled(cars.map(car => readStoredImageTrace(car.url)));
  return cars.map((car, index) => {
    const trace = settled[index].status === 'fulfilled' ? settled[index].value : null;
    if (!trace) {
      return { ...car, imagen_tipo: car.imagen_tipo || imageTipoForUrl(car.url, car.thumbnail_url) };
    }
    const imageUrl = trace.image_url || trace.thumbnail_url || car.thumbnail_url || null;
    return {
      ...car,
      thumbnail_url: imageUrl && !isBadThumbnail(imageUrl) ? imageUrl : car.thumbnail_url,
      imagen_tipo: imageTipoFromTrace(trace, { ...car, thumbnail_url: imageUrl }),
      image_source: trace.image_source || car.image_source || null
    };
  });
}

function normalizeImageSource(source) {
  const value = String(source || '').toLowerCase();
  if (value === 'html') return 'og_image';
  if (['og_image', 'json_ld', 'twitter_image', 'api', 'feed', 'curated_model'].includes(value)) return value;
  return 'json_ld';
}

async function saveListingImageTrace(car, imageSource) {
  if (!car?.url || !car.thumbnail_url || car.imagen_tipo !== 'real_source') return { ok: true, skipped: true };
  const payload = {
    fuente_url: car.url,
    image_url: car.thumbnail_url,
    image_kind: 'real_source',
    image_source: normalizeImageSource(imageSource)
  };
  const enc = encodeURIComponent(car.url);
  const patched = await sb(`agg_listing_images?fuente_url=eq.${enc}`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: JSON.stringify(payload)
  });
  if (patched.ok && Array.isArray(patched.data) && patched.data.length) return { ok: true, mode: 'updated' };

  const inserted = await sb('agg_listing_images', {
    method: 'POST',
    prefer: 'return=minimal',
    body: JSON.stringify(payload)
  });
  return { ok: inserted.ok, mode: inserted.ok ? 'inserted' : 'failed', status: inserted.status, data: inserted.data };
}

function dedupeSeminuevosCars(cars) {
  const seen = new Set();
  const out = [];
  for (const car of cars) {
    const key = vehicleIdFromUrl(car.url) || stableListingKey(car.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(car);
  }
  return out;
}

function normalizedSpecKey(car) {
  const marca = normTextForKey(car.marca);
  const modelo = normTextForKey(car.modelo);
  const anio = car.anio ? String(car.anio) : '';
  const precio = car.precio ? String(Math.round(Number(car.precio) / 1000) * 1000) : '';
  return marca && modelo && anio && precio ? `${marca}|${modelo}|${anio}|${precio}` : '';
}

function normTextForKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function dedupeDiscoveredCars(cars) {
  const seenUrl = new Set();
  const seenSpec = new Map();
  const out = [];
  for (const car of cars) {
    const urlKey = stableListingKey(car.url);
    const specKey = normalizedSpecKey(car);
    if (urlKey && seenUrl.has(urlKey)) continue;
    if (specKey && seenSpec.has(specKey)) {
      const existing = seenSpec.get(specKey);
      const portals = new Set([...(existing.visto_en_portales || [existing.portal].filter(Boolean)), car.portal].filter(Boolean));
      existing.visto_en_portales = [...portals];
      existing.visto_en_count = portals.size;
      if (!existing.thumbnail_url && car.thumbnail_url) existing.thumbnail_url = car.thumbnail_url;
      continue;
    }
    if (urlKey) seenUrl.add(urlKey);
    if (specKey) seenSpec.set(specKey, car);
    out.push({
      ...car,
      visto_en_portales: [car.portal].filter(Boolean),
      visto_en_count: 1
    });
  }
  return out;
}

async function searchSeminuevosIndividuals(q, ciudad, intentOverride = null) {
  const intent = intentOverride || await resolveSearchIntent(q, ciudad);
  const debug = {
    source: 'seminuevos_individual',
    ok: false,
    intent,
    discovered: 0,
    withImages: 0,
    error: null
  };
  if (!intent?.marca || !intent?.modelo) {
    debug.error = 'no_intent';
    return { cars: [], debug };
  }

  try {
    const discovered = await discoverSeminuevos(intent.marca, intent.modelo, ciudad || intent.ciudad || '', { limit: 10 });
    debug.discovered = discovered.length;
    if (!discovered.length) {
      debug.error = 'no_individual_urls';
      return { cars: [], debug };
    }

    const detailed = await mapLimit(discovered, 3, async item => {
      const storedTrace = await readStoredImageTrace(item.url);
      const storedImage = storedTrace?.image_url || storedTrace?.thumbnail_url || null;
      const storedTipo = storedTrace ? imageTipoFromTrace(storedTrace, { url: item.url, thumbnail_url: storedImage }) : null;
      const shouldFetchDetail = !storedImage || !item.precio || !item.km;
      let detail = null;
      if (shouldFetchDetail) {
        detail = await extractSeminuevosListing(item.url, {
          timeoutMs: storedImage ? 5500 : 10000,
          fallback: {
            title: item.title,
            snippet: item.snippet,
            marca: intent.marca,
            modelo: intent.modelo,
            ubicacion: item.ubicacion
          }
        });
        if (/no\s+disponible|vendido|pausado/i.test(`${detail.title || ''} ${detail.description || ''}`)) return null;
      }
      if (storedImage && storedTipo === 'real_source' && !isBadThumbnail(storedImage) && isSeminuevosListingImage(item.url, storedImage)) {
        const car = cleanCar({
          marca: intent.marca || item.marca,
          modelo: intent.modelo || item.modelo,
          anio: detail?.anio || item.anio,
          precio: detail?.precio || item.precio,
          km: detail?.km || null,
          ubicacion: detail?.ubicacion || item.ubicacion || '',
          portal: 'Seminuevos',
          fuente_portal: 'Seminuevos',
          url: item.url,
          fuente_url: item.url,
          thumbnail_url: storedImage,
          imagen_tipo: 'real_source'
        });
        car.image_source = normalizeImageSource(storedTrace.image_source);
        return car;
      }

      const image = Array.isArray(detail.images) && detail.images.length ? detail.images[0] : null;
      const car = cleanCar({
        marca: intent.marca || detail.marca || item.marca,
        modelo: intent.modelo || detail.modelo || item.modelo,
        anio: detail.anio || item.anio,
        precio: detail.precio && precioValido(detail.precio) ? detail.precio : item.precio,
        km: detail.km || null,
        ubicacion: detail.ubicacion || item.ubicacion || '',
        portal: 'Seminuevos',
        fuente_portal: 'Seminuevos',
        url: item.url,
        fuente_url: item.url,
        thumbnail_url: image?.url || null,
        imagen_tipo: image?.url ? 'real_source' : 'placeholder'
      });
      car.image_source = image?.source || null;
      return car;
    });

    const cars = dedupeSeminuevosCars(detailed
      .filter(Boolean)
      .filter(c => c.url && isSeminuevosVehicleUrl(c.url))
      .filter(c => !carHasVisiblePII(c))
      .filter(c => precioValido(c.precio)))
      .slice(0, 10);

    const traceResults = await Promise.allSettled(cars.map(car => saveListingImageTrace(car, car.image_source)));
    debug.withImages = cars.filter(car => car.thumbnail_url && car.imagen_tipo === 'real_source').length;
    debug.traceErrors = traceResults.filter(r => r.status === 'fulfilled' && r.value && !r.value.ok).length
      + traceResults.filter(r => r.status === 'rejected').length;
    debug.ok = cars.length > 0;
    return { cars, debug };
  } catch (err) {
    debug.error = String(err.message || err);
    return { cars: [], debug };
  }
}

async function searchAutocosmosIndividuals(q, ciudad, intentOverride = null) {
  const intent = intentOverride || await resolveSearchIntent(q, ciudad);
  const debug = {
    source: 'autocosmos_individual',
    ok: false,
    intent,
    discovered: 0,
    withImages: 0,
    error: null
  };
  if (!intent?.marca || !intent?.modelo) {
    debug.error = 'no_intent';
    return { cars: [], debug };
  }

  try {
    const discovered = await discoverAutocosmos(intent.marca, intent.modelo, ciudad || intent.ciudad || '', { limit: 8, pages: 1 });
    debug.discovered = discovered.length;
    if (!discovered.length) {
      debug.error = 'no_individual_urls';
      return { cars: [], debug };
    }

    const cars = dedupeSeminuevosCars(discovered.map(item => cleanCar({
      marca: item.marca || intent.marca,
      modelo: item.modelo || intent.modelo,
      anio: item.anio,
      precio: item.precio,
      km: item.km,
      ubicacion: item.ubicacion || '',
      portal: 'AutoCosmos',
      fuente_portal: 'AutoCosmos',
      url: item.url,
      fuente_url: item.url,
      thumbnail_url: item.thumbnail_url || null,
      imagen_tipo: item.thumbnail_url ? 'real_source' : 'placeholder',
      image_source: item.image_source || 'api'
    }))
      .filter(c => c.url && isAutocosmosVehicleUrl(c.url))
      .filter(c => !carHasVisiblePII(c))
      .filter(c => precioValido(c.precio)))
      .slice(0, 8);

    const traceResults = await Promise.allSettled(cars.map(car => saveListingImageTrace(car, car.image_source || 'api')));
    debug.withImages = cars.filter(car => car.thumbnail_url && car.imagen_tipo === 'real_source').length;
    debug.traceErrors = traceResults.filter(r => r.status === 'fulfilled' && r.value && !r.value.ok).length
      + traceResults.filter(r => r.status === 'rejected').length;
    debug.ok = cars.length > 0;
    return { cars, debug };
  } catch (err) {
    debug.error = String(err.message || err);
    return { cars: [], debug };
  }
}

async function searchNissanIndividuals(q, ciudad, intentOverride = null) {
  const intent = intentOverride || await resolveSearchIntent(q, ciudad);
  const debug = {
    source: 'nissan_seminuevos_individual',
    ok: false,
    intent,
    discovered: 0,
    withImages: 0,
    error: null
  };
  if (!intent?.marca || !intent?.modelo) {
    debug.error = 'no_intent';
    return { cars: [], debug };
  }
  if (!/nissan/i.test(normTextForKey(intent.marca))) {
    debug.error = 'make_not_nissan';
    return { cars: [], debug };
  }

  try {
    const discovered = await discoverNissan(intent.marca, intent.modelo, ciudad || intent.ciudad || '', { limit: 10 });
    debug.discovered = discovered.length;
    if (!discovered.length) {
      debug.error = 'no_individual_urls';
      return { cars: [], debug };
    }

    const cars = dedupeSeminuevosCars(discovered.map(item => cleanCar({
      marca: item.marca || intent.marca,
      modelo: item.modelo || intent.modelo,
      anio: item.anio,
      precio: item.precio,
      km: item.km,
      ubicacion: item.ubicacion || '',
      portal: 'Nissan Seminuevos',
      fuente_portal: 'Nissan Seminuevos',
      url: item.url,
      fuente_url: item.url,
      thumbnail_url: item.thumbnail_url || null,
      imagen_tipo: item.thumbnail_url ? 'real_source' : 'placeholder',
      image_source: item.image_source || 'api'
    }))
      .filter(c => c.url && isNissanVehicleUrl(c.url))
      .filter(c => !carHasVisiblePII(c))
      .filter(c => precioValido(c.precio)))
      .slice(0, 10);

    const traceResults = await Promise.allSettled(cars.map(car => saveListingImageTrace(car, car.image_source || 'api')));
    debug.withImages = cars.filter(car => car.thumbnail_url && car.imagen_tipo === 'real_source').length;
    debug.traceErrors = traceResults.filter(r => r.status === 'fulfilled' && r.value && !r.value.ok).length
      + traceResults.filter(r => r.status === 'rejected').length;
    debug.ok = cars.length > 0;
    return { cars, debug };
  } catch (err) {
    debug.error = String(err.message || err);
    return { cars: [], debug };
  }
}

async function searchCarOneIndividuals(q, ciudad, intentOverride = null) {
  const intent = intentOverride || await resolveSearchIntent(q, ciudad);
  const debug = {
    source: 'carone_individual',
    ok: false,
    intent,
    discovered: 0,
    withImages: 0,
    error: null
  };
  if (!intent?.marca || !intent?.modelo) {
    debug.error = 'no_intent';
    return { cars: [], debug };
  }

  try {
    const discovered = await discoverCarOne(intent.marca, intent.modelo, ciudad || intent.ciudad || '', { limit: 8, pages: 3 });
    debug.discovered = discovered.length;
    if (!discovered.length) {
      debug.error = 'no_individual_urls';
      return { cars: [], debug };
    }

    const cars = dedupeSeminuevosCars(discovered.map(item => cleanCar({
      marca: item.marca || intent.marca,
      modelo: item.modelo || intent.modelo,
      anio: item.anio,
      precio: item.precio,
      km: item.km,
      ubicacion: item.ubicacion || '',
      portal: 'Car One',
      fuente_portal: 'Car One',
      url: item.url,
      fuente_url: item.url,
      thumbnail_url: item.thumbnail_url || null,
      imagen_tipo: item.thumbnail_url ? 'real_source' : 'placeholder',
      image_source: item.image_source || 'html'
    }))
      .filter(c => c.url && isCarOneVehicleUrl(c.url))
      .filter(c => !carHasVisiblePII(c))
      .filter(c => precioValido(c.precio)))
      .slice(0, 8);

    const traceResults = await Promise.allSettled(cars.map(car => saveListingImageTrace(car, car.image_source || 'html')));
    debug.withImages = cars.filter(car => car.thumbnail_url && car.imagen_tipo === 'real_source').length;
    debug.traceErrors = traceResults.filter(r => r.status === 'fulfilled' && r.value && !r.value.ok).length
      + traceResults.filter(r => r.status === 'rejected').length;
    debug.ok = cars.length > 0;
    return { cars, debug };
  } catch (err) {
    debug.error = String(err.message || err);
    return { cars: [], debug };
  }
}

async function searchGocarIndividuals(q, ciudad, intentOverride = null) {
  const intent = intentOverride || await resolveSearchIntent(q, ciudad);
  const debug = {
    source: 'gocar_individual',
    ok: false,
    intent,
    discovered: 0,
    withImages: 0,
    error: null
  };
  if (!intent?.marca || !intent?.modelo) {
    debug.error = 'no_intent';
    return { cars: [], debug };
  }

  try {
    const discovered = await discoverGocar(intent.marca, intent.modelo, ciudad || intent.ciudad || '', { limit: 8 });
    debug.discovered = discovered.length;
    if (!discovered.length) {
      debug.error = 'no_individual_urls';
      return { cars: [], debug };
    }

    const cars = dedupeSeminuevosCars(discovered.map(item => cleanCar({
      marca: item.marca || intent.marca,
      modelo: item.modelo || intent.modelo,
      anio: item.anio,
      precio: item.precio,
      km: item.km,
      ubicacion: item.ubicacion || '',
      portal: 'Seminuevos Gocar',
      fuente_portal: 'Seminuevos Gocar',
      url: item.url,
      fuente_url: item.url,
      thumbnail_url: item.thumbnail_url || null,
      imagen_tipo: item.thumbnail_url ? 'real_source' : 'placeholder',
      image_source: item.image_source || 'html'
    }))
      .filter(c => c.url && isGocarVehicleUrl(c.url))
      .filter(c => !carHasVisiblePII(c))
      .filter(c => precioValido(c.precio)))
      .slice(0, 8);

    const traceResults = await Promise.allSettled(cars.map(car => saveListingImageTrace(car, car.image_source || 'html')));
    debug.withImages = cars.filter(car => car.thumbnail_url && car.imagen_tipo === 'real_source').length;
    debug.traceErrors = traceResults.filter(r => r.status === 'fulfilled' && r.value && !r.value.ok).length
      + traceResults.filter(r => r.status === 'rejected').length;
    debug.ok = cars.length > 0;
    return { cars, debug };
  } catch (err) {
    debug.error = String(err.message || err);
    return { cars: [], debug };
  }
}

async function searchIndividualPortals(q, ciudad, intentOverride = null) {
  const intent = intentOverride || await resolveSearchIntent(q, ciudad);
  const tasks = [
    searchSeminuevosIndividuals(q, ciudad, intent),
    searchAutocosmosIndividuals(q, ciudad, intent),
    searchNissanIndividuals(q, ciudad, intent),
    searchCarOneIndividuals(q, ciudad, intent),
    searchGocarIndividuals(q, ciudad, intent)
  ];
  const settled = await Promise.allSettled(tasks);
  const debug = settled.map(result => result.status === 'fulfilled'
    ? result.value.debug
    : { ok: false, error: String(result.reason?.message || result.reason) });
  const rawCars = settled.flatMap(result => result.status === 'fulfilled' ? result.value.cars : []);
  let cars = await applyStoredImageTraces(rawCars);
  cars = cars.filter(car =>
    car.thumbnail_url
    && car.imagen_tipo === 'real_source'
    && (isSeminuevosVehicleUrl(car.url) || isAutocosmosVehicleUrl(car.url) || isNissanVehicleUrl(car.url) || isCarOneVehicleUrl(car.url) || isGocarVehicleUrl(car.url))
    && !isBadThumbnail(car.thumbnail_url)
  );
  cars = await attachVeredictos(balanceCars(dedupeDiscoveredCars(cars), 24));
  return { cars, debug, intent };
}

function portalNamesFromCars(cars) {
  return [...new Set((cars || []).map(car => normalizePortalName(car)).filter(Boolean))];
}

function hasPortalTarget(cars) {
  return portalNamesFromCars(cars).length >= MIN_PORTAL_TARGET;
}

async function searchUpstreamAggregator(q, ciudad, debug) {
  const params = new URLSearchParams({ q });
  if (ciudad) params.set('ciudad', ciudad);
  if (debug) params.set('debug', '1');
  const url = `https://12d85096-24f3-40d9-a7d2-701582b13dc9.netlify.app/.netlify/functions/buscar-vivo?${params.toString()}`;
  const { controller, done } = withTimeout(26000);
  const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } }).finally(done);
  if (!res.ok) throw new Error(`upstream_aggregator_${res.status}`);
  const payload = await res.json();
  const cars = Array.isArray(payload.cars) ? payload.cars : [];
  return {
    cars,
    cached: Boolean(payload.cached),
    count: cars.length,
    upstream: 'tixuz-agregador',
    ...(debug ? { upstreamDebug: payload.debug || null } : {})
  };
}

async function prepareSearchCars(q, raw, options = {}) {
  const {
    limit = LIVE_RESULT_LIMIT,
    attach = true,
    requireLikelyListing = false,
    excludeLandingPages = false,
    intent = null,
    requireModelInUrl = false,
    enrichImages = true,
    applyImageTraces = true,
    allowOpenAIWhenRawEmpty = true
  } = options;

  let cars = null;
  let openAiError = null;
  let normalizerError = null;

  if (!raw.length && allowOpenAIWhenRawEmpty) {
    try {
      cars = await searchOpenAIWeb(q);
    } catch (e) {
      openAiError = String(e.message || e);
    }
  }

  if (cars === null && !raw.length) {
    return { cars: [], normalizedCount: 0, cleanedForDebug: [], openAiError, normalizerError };
  }

  if (cars === null) {
    try {
      cars = await normalizar(q, raw);
    } catch (e) {
      normalizerError = String(e.message || e);
      cars = [];
    }
  }

  const normalizedCount = (cars || []).length;
  if ((!cars || !cars.length) && raw.length) {
    try {
      cars = await searchOpenAIWeb(q);
    } catch (e) {
      openAiError = String(e.message || e);
      cars = guessFromRaw(q, raw);
    }
  }
  if ((!cars || !cars.length) && raw.length) cars = guessFromRaw(q, raw);

  const cleanedForDebug = (cars || []).map(cleanCar);
  cars = dedupeCars(cleanedForDebug
    .filter(c => c && c.url && c.marca)
    .filter(c => !requireLikelyListing || isLikelyIndividualListing(c.url))
    .filter(c => !excludeLandingPages || isUsefulSupplementalUrl(c.url))
    .filter(c => carMatchesIntent(c, intent))
    .filter(c => !requireModelInUrl || urlMatchesIntentModel(c.url, intent))
    .filter(c => !carHasVisiblePII(c))
    .filter(c => precioValido(c.precio)));
  cars = balanceCars(cars, limit);
  if (enrichImages) cars = await enrichWithOgImages(cars);
  if (applyImageTraces) cars = await applyStoredImageTraces(cars);
  if (attach) cars = await attachVeredictos(cars);

  return { cars, normalizedCount, cleanedForDebug, openAiError, normalizerError };
}

async function mergeGuessedRawCars(q, raw, cars, limit = LIVE_RESULT_LIMIT, intent = null) {
  const scopedRaw = intent ? raw.filter(item => rawMatchesIntent(item, intent)) : raw;
  const guessed = guessFromRaw(q, scopedRaw).map(cleanCar)
    .filter(c => c && c.url && c.marca)
    .filter(c => isUsefulSupplementalUrl(c.url))
    .filter(c => carMatchesIntent(c, intent))
    .filter(c => urlMatchesIntentModel(c.url, intent))
    .filter(c => !carHasVisiblePII(c))
    .filter(c => precioValido(c.precio));
  if (!guessed.length) return cars;

  return balanceCars(dedupeCars([...cars, ...guessed]), limit);
}

async function searchSupplementalPortals(q, existingCars = [], intent = null) {
  const existingPortals = new Set(portalNamesFromCars(existingCars));
  const portals = PORTALS.filter(portal => !existingPortals.has(portal.label));
  const settled = await Promise.allSettled(portals.map(portal => searchPortal(q, portal)));
  const searchDebug = settled.map((r, i) => ({
    portal: portals[i].label,
    ok: r.status === 'fulfilled',
    count: r.status === 'fulfilled' ? r.value.length : 0,
    error: r.status === 'rejected' ? String(r.reason?.message || r.reason) : null
  }));
  let raw = settled.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  raw = dedupeRaw(balancedRaw(raw, LIVE_RESULT_LIMIT * 2));

  const prepared = await prepareSearchCars(q, raw, {
    limit: LIVE_RESULT_LIMIT,
    attach: false,
    requireLikelyListing: false,
    excludeLandingPages: true,
    intent,
    requireModelInUrl: true,
    enrichImages: false,
    applyImageTraces: false,
    allowOpenAIWhenRawEmpty: true
  });
  const targetRemaining = Math.max(0, MIN_PORTAL_TARGET - existingPortals.size);
  let preparedCars = prepared.cars;
  let canonicalFillCount = 0;
  if (portalNamesFromCars(preparedCars).length < targetRemaining && raw.length) {
    preparedCars = await mergeGuessedRawCars(q, raw, preparedCars, LIVE_RESULT_LIMIT, intent);
  }
  if (portalNamesFromCars(preparedCars).length < targetRemaining) {
    const occupiedPortals = new Set([...existingPortals, ...portalNamesFromCars(preparedCars)]);
    const canonicalCars = await buildCanonicalSourceCars(q, intent, occupiedPortals);
    if (canonicalCars.length) {
      canonicalFillCount = canonicalCars.length;
      preparedCars = balanceCars(dedupeCars([...preparedCars, ...canonicalCars]), LIVE_RESULT_LIMIT);
    }
  }

  const newPortalCars = preparedCars.filter(car => !existingPortals.has(normalizePortalName(car)));
  return {
    ...prepared,
    cars: newPortalCars.length ? newPortalCars : prepared.cars,
    guessedFillCount: Math.max(0, preparedCars.length - prepared.cars.length),
    canonicalFillCount,
    rawCount: raw.length,
    searchDebug
  };
}

function normalizedQuery(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isRealExternalCar(car) {
  const portal = String(car?.portal || car?.fuente_portal || '').toLowerCase();
  const url = String(car?.url || car?.fuente_url || '').toLowerCase();
  return Boolean(
    car
    && car.url
    && car.marca
    && car.modelo
    && !portal.includes('tixuz')
    && !url.includes('tixuzautos.com')
    && (Number(car.precio || 0) > 0 || Number(car.anio || 0) > 0)
    && car.source_kind !== 'verified_source_page'
  );
}

function fastPortalLinks(q, ciudad = '') {
  const intent = knownSearchIntent(q, ciudad);
  if (!intent?.marca || !intent?.modelo) return [];
  return canonicalPortalCandidates(intent).map(item => ({
    portal: item.portal,
    url: item.url,
    source_kind: 'verified_source_page'
  }));
}

async function readHotfixCache(q, ciudad) {
  const key = `direct-v13:${normalizedQuery(`${q} ${ciudad || ''}`)}`;
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const qHash = hash(key);

  const preferred = await sb(`agg_search_cache?query=eq.${encodeURIComponent(key)}&created_at=gte.${encodeURIComponent(sixHoursAgo)}&select=payload,created_at&order=created_at.desc&limit=1`).catch(() => ({ ok: false }));
  if (preferred.ok && Array.isArray(preferred.data) && preferred.data[0]?.payload) {
    return { ...preferred.data[0].payload, cached: true, cache_table: 'agg_search_cache' };
  }

  const fallback = await sb(`agg_autos_live_cache?query_hash=eq.${qHash}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=results,result_count,hit_count&limit=1`).catch(() => ({ ok: false }));
  if (fallback.ok && Array.isArray(fallback.data) && fallback.data[0]) {
    sb(`agg_autos_live_cache?query_hash=eq.${qHash}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ hit_count: (fallback.data[0].hit_count || 0) + 1 })
    }).catch(() => {});
    return { ...(fallback.data[0].results || {}), cached: true, cache_table: 'agg_autos_live_cache' };
  }
  return null;
}

async function writeHotfixCache(q, ciudad, payload) {
  const key = `direct-v13:${normalizedQuery(`${q} ${ciudad || ''}`)}`;
  const qHash = hash(key);
  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
  await sb('agg_search_cache', {
    method: 'POST',
    prefer: 'return=minimal',
    body: JSON.stringify({ query: key, payload, created_at: new Date().toISOString() })
  }).catch(() => {});
  await sb('agg_autos_live_cache', {
    method: 'POST',
    prefer: 'return=minimal',
    body: JSON.stringify({ query_hash: qHash, query_text: key, results: payload, result_count: payload.count || 0, expires_at: expiresAt })
  }).catch(() => {});
}

async function saveRealExternalCars(sharedCars) {
  const cars = Array.isArray(sharedCars) ? sharedCars : [];
  if (!cars.length) return { attempted: 0, saved: 0 };
  const sourcesRes = await sb('agg_source_registry?select=*').catch(() => ({ ok: false, data: [] }));
  const sources = new Map();
  for (const row of sourcesRes.data || []) {
    const key = String(row.source_name || row.name || row.slug || row.id || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (key) sources.set(key, row);
  }
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows = [];
  for (const car of cars) {
    const key = String(car.source_name || car.source_key || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const source = sources.get(key);
    if (!source?.id) continue;
    rows.push({
      source_id: source.id,
      external_id: String(car.external_id || hash(car.source_url || '').slice(0, 24)),
      make: car.make,
      model: car.model,
      year: car.year,
      price_mxn: car.price_mxn,
      mileage_km: car.mileage_km,
      location: car.location,
      thumbnail_url: car.thumbnail_url,
      source_url: car.source_url,
      title: car.title || `${car.year || ''} ${car.make || ''} ${car.model || ''}`.trim(),
      status: 'active',
      last_seen_at: now,
      first_seen_at: now,
      expires_at: expires,
      raw_payload: car.raw || car
    });
  }
  if (!rows.length) return { attempted: cars.length, saved: 0 };
  const res = await sb('agg_autos_inventory?on_conflict=source_id,external_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows)
  }).catch(() => ({ ok: false }));
  return { attempted: cars.length, saved: res.ok ? rows.length : 0 };
}

async function runFastSearch(q, ciudad, debug = false, nocache = false) {
  const started = Date.now();
  if (!nocache) {
    const cached = await readHotfixCache(q, ciudad);
    if (cached) return cached;
  }

  let shared = { cars: [], detail: [], partial: true };
  let externalError = null;
  try {
    shared = await buscarPorTexto(q, ciudad);
  } catch (err) {
    externalError = String(err.message || err).slice(0, 180);
  }

  let realExternal = (shared.cars || []).map(car => ({
    marca: car.make,
    modelo: car.model,
    anio: car.year,
    precio: car.price_mxn,
    km: car.mileage_km,
    ubicacion: car.location,
    city: car.city,
    state: car.state,
    version: car.version,
    transmission: car.transmission,
    seller_name: car.seller_name,
    seller_type: car.seller_type,
    published_at: car.published_at,
    portal: car.source_name,
    url: car.source_url,
    thumbnail_url: car.thumbnail_url,
    imagen_tipo: car.image_kind || (car.thumbnail_url ? 'real_source' : 'placeholder'),
    source_kind: 'listing',
    title: car.title
  })).filter(isRealExternalCar);

  realExternal = balanceCars(realExternal, LIVE_RESULT_LIMIT);
  realExternal = await enrichWithOgImages(realExternal);

  let cars = await attachVeredictos(realExternal);
  const ownFallback = await searchOwnInventory(q);
  const ownCars = await attachVeredictos(ownFallback);
  const portalLinks = fastPortalLinks(q, ciudad);
  const persist = { attempted: (shared.cars || []).length, saved: 0, reason: 'nightly_pipeline_only' };
  const failedPortals = (shared.detail || []).filter(item => !item.ok).map(item => item.source || item.portal || 'portal');
  const partial = Boolean(externalError || shared.partial || failedPortals.length || !realExternal.length);
  const payload = {
    cars: [...ownCars, ...cars],
    portal_links: portalLinks,
    partial,
    failed_portals: failedPortals,
    cached: false,
    count: ownCars.length + cars.length,
    source: 'hotfix_fast_hybrid',
    elapsed_ms: Date.now() - started,
    ...(debug ? { debug: { external: shared.detail || [], externalError, ownCount: ownCars.length, externalCount: cars.length, persist } } : {})
  };
  await writeHotfixCache(q, ciudad, payload);
  return payload;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };

  const q = (event.queryStringParameters?.q || '').trim();
  const ciudad = (event.queryStringParameters?.ciudad || '').trim();
  const debug = event.queryStringParameters?.debug === '1';
  if (!q || q.length < 3) return json(400, { error: 'Query muy corta' });

  try {
    const payload = await runFastSearch(q, ciudad, debug, event.queryStringParameters?.nocache === '1');
    return json(200, payload);
  } catch (err) {
    return json(200, {
      cars: [],
      portal_links: fastPortalLinks(q, ciudad),
      partial: true,
      failed_portals: ['internal'],
      cached: false,
      count: 0,
      source: 'hotfix_error_guard',
      ...(debug ? { debug: { error: String(err.message || err).slice(0, 300) } } : {})
    });
  }

  if (event.queryStringParameters?.legacy !== '1') {
    const shared = await buscarPorTexto(q, ciudad);
    let cars = await attachVeredictos(shared.cars.map(car => ({
      marca: car.make,
      modelo: car.model,
      anio: car.year,
      precio: car.price_mxn,
      km: car.mileage_km,
      ubicacion: car.location,
      portal: car.source_name,
      url: car.source_url,
      thumbnail_url: car.thumbnail_url,
      imagen_tipo: car.thumbnail_url ? 'real_source' : 'placeholder'
    })));
    const ownFallback = cars.length ? [] : await searchOwnInventory(q);
    if (ownFallback.length) cars = await attachVeredictos(ownFallback);
    return json(200, {
      cars,
      cached: false,
      count: cars.length,
      source: cars.length && ownFallback.length ? 'own_inventory_fallback' : 'external',
      ...(debug ? { debug: { external: shared.detail, ownFallbackCount: ownFallback.length } } : {})
    });
  }

  const rl = await checkRateLimit(event, 20, 10);
  if (!rl.allowed) {
    return json(429, { error: 'Demasiadas busquedas. Intenta en unos minutos.' },
      { 'Retry-After': String(rl.retryAfter) });
  }

  const qHash = hash(`${CACHE_VERSION}:${q.toLowerCase()}:${ciudad.toLowerCase()}`);
  const cached = await sb(`agg_autos_live_cache?query_hash=eq.${qHash}&expires_at=gt.${new Date().toISOString()}&select=id,results,result_count,hit_count&limit=1`);
  if (cached.ok && cached.data?.length) {
    const c = cached.data[0];
    sb(`agg_autos_live_cache?id=eq.${c.id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ hit_count: (c.hit_count || 0) + 1 })
    }).catch(() => {});
    return json(200, { cars: c.results, cached: true, count: c.result_count });
  }

  const intent = await resolveSearchIntent(q, ciudad);
  const supplementalPromise = searchSupplementalPortals(q, [], intent).catch(err => ({
    cars: [],
    rawCount: 0,
    normalizedCount: 0,
    cleanedForDebug: [],
    guessedFillCount: 0,
    searchDebug: [],
    openAiError: null,
    normalizerError: null,
    error: String(err.message || err)
  }));
  const individual = await searchIndividualPortals(q, ciudad, intent);
  if (individual.cars.length) {
    let cars = individual.cars;
    let supplemental = null;

    if (!hasPortalTarget(cars)) {
      supplemental = await supplementalPromise;
      const existingPortals = new Set(portalNamesFromCars(cars));
      const supplementalCars = supplemental.cars.filter(car => !existingPortals.has(normalizePortalName(car)));
      if (supplementalCars.length) {
        cars = await attachVeredictos(balanceCars(dedupeDiscoveredCars([
          ...cars,
          ...supplementalCars
        ]), LIVE_RESULT_LIMIT));
      }
    }

    console.log('buscar-vivo individual_portals result', {
      q,
      ciudad,
      finalCount: cars.length,
      imageCount: cars.filter(c => c.thumbnail_url).length,
      portalCount: portalNamesFromCars(cars).length,
      portals: portalNamesFromCars(cars),
      debug: individual.debug,
      supplemental: supplemental ? {
        rawCount: supplemental.rawCount,
        normalizedCount: supplemental.normalizedCount,
        guessedFillCount: supplemental.guessedFillCount,
        canonicalFillCount: supplemental.canonicalFillCount,
        finalCount: supplemental.cars.length,
        portals: portalNamesFromCars(supplemental.cars),
        searchDebug: supplemental.searchDebug,
        openAiError: supplemental.openAiError,
        normalizerError: supplemental.normalizerError,
        error: supplemental.error || null
      } : null
    });

    await sb('agg_autos_live_cache', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        query_hash: qHash,
        query_text: q,
        results: cars,
        result_count: cars.length
      })
    }).catch(() => {});

    return json(200, {
      cars,
      cached: false,
      count: cars.length,
      ...(debug ? { debug: { individual, supplemental } } : {})
    });
  }

  const supplementalOnly = await supplementalPromise;
  if (supplementalOnly.cars.length) {
    const cars = await attachVeredictos(balanceCars(dedupeDiscoveredCars(supplementalOnly.cars), LIVE_RESULT_LIMIT));
    console.log('buscar-vivo supplemental_only result', {
      q,
      ciudad,
      finalCount: cars.length,
      imageCount: cars.filter(c => c.thumbnail_url).length,
      portalCount: portalNamesFromCars(cars).length,
      portals: portalNamesFromCars(cars),
      supplemental: {
        rawCount: supplementalOnly.rawCount,
        normalizedCount: supplementalOnly.normalizedCount,
        guessedFillCount: supplementalOnly.guessedFillCount,
        canonicalFillCount: supplementalOnly.canonicalFillCount,
        finalCount: supplementalOnly.cars.length,
        portals: portalNamesFromCars(supplementalOnly.cars),
        searchDebug: supplementalOnly.searchDebug,
        openAiError: supplementalOnly.openAiError,
        normalizerError: supplementalOnly.normalizerError,
        error: supplementalOnly.error || null
      }
    });

    await sb('agg_autos_live_cache', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        query_hash: qHash,
        query_text: q,
        results: cars,
        result_count: cars.length
      })
    }).catch(() => {});

    return json(200, {
      cars,
      cached: false,
      count: cars.length,
      ...(debug ? { debug: { individual, supplemental: supplementalOnly } } : {})
    });
  }

  const settled = await Promise.allSettled(PORTALS.map(portal => searchPortal(q, portal)));
  const searchDebug = settled.map((r, i) => ({
    portal: PORTALS[i].label,
    ok: r.status === 'fulfilled',
    count: r.status === 'fulfilled' ? r.value.length : 0,
    error: r.status === 'rejected' ? String(r.reason?.message || r.reason) : null
  }));
  let raw = settled.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  raw = dedupeRaw(balancedRaw(raw, LIVE_RESULT_LIMIT * 2));

  const prepared = await prepareSearchCars(q, raw, {
    limit: LIVE_RESULT_LIMIT,
    attach: true,
    requireLikelyListing: false,
    allowOpenAIWhenRawEmpty: true
  });
  let cars = prepared.cars;
  const { normalizedCount, cleanedForDebug, openAiError, normalizerError } = prepared;

  if (!cars.length && !raw.length && openAiError) {
    console.warn('buscar-vivo no_search_results', { q, searchDebug, openAiError });
    try {
      const upstream = await searchUpstreamAggregator(q, ciudad, debug);
      return json(200, {
        ...upstream,
        fallback: true,
        ...(debug ? { debug: { local: { searchDebug, openAiError }, upstream: upstream.upstreamDebug || null } } : {})
      });
    } catch (fallbackErr) {
      if (debug) return json(502, { error: 'Busqueda no disponible ahora.', debug: { searchDebug, openAiError, fallbackError: String(fallbackErr.message || fallbackErr) } });
      return json(502, { error: 'Busqueda no disponible ahora.' });
    }
  }

  console.log('buscar-vivo result', {
    q,
    rawCount: raw.length,
    normalizedCount,
    finalCount: cars.length,
    portalCount: portalNamesFromCars(cars).length,
    portals: portalNamesFromCars(cars),
    imageCount: cars.filter(c => c.thumbnail_url).length,
    searchDebug,
    openAiError,
    normalizerError
  });

  await sb('agg_autos_live_cache', {
    method: 'POST',
    prefer: 'return=minimal',
    body: JSON.stringify({
      query_hash: qHash,
      query_text: q,
      results: cars,
      result_count: cars.length
    })
  }).catch(() => {});

  return json(200, {
    cars,
    cached: false,
    count: cars.length,
    ...(debug ? { debug: { individual, rawCount: raw.length, normalizedCount, cleanedSample: cleanedForDebug.slice(0, 3), searchDebug, openAiError, normalizerError } } : {})
  });
};

exports.runFastSearch = runFastSearch;

function dedupeRaw(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = String(item.link || '').replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
