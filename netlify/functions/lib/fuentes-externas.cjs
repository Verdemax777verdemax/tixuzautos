const { hash, hasPII } = require('../_shared');
const seminuevos = require('../seminuevos-discover.cjs');
const autocosmos = require('../autocosmos-discover.cjs');
const carone = require('../carone-discover.cjs');
const mercadolibre = require('./fuentes/mercadolibre-api.js');
const {
  cleanText,
  normalizeCity,
  normalizeListingQuality,
  normalizeState,
  normalizeTransmission
} = require('./listing-normalize.cjs');

const TIXUZBOT_UA = 'TixuzBot/1.0 (+https://tixuzautos.com/bot; contacto: bot@tixuzautos.com)';
const SERPER_API = 'https://google.serper.dev/search';
const REQUEST_GAP_MS = 2000;
const SOURCE_TIMEOUT_MS = 6500;
const TOTAL_SEARCH_BUDGET_MS = 10000;
const robotsCache = new Map();
const domainQueues = new Map();
const SERPER_PORTALS = [
  { key: 'seminuevos', label: 'Seminuevos', domain: 'seminuevos.com', searchSite: 'seminuevos.com/vehicle' },
  { key: 'autocosmos', label: 'AutoCosmos', domain: 'autocosmos.com.mx', searchSite: 'autocosmos.com.mx/auto/usado', queryExtra: '-inurl:? -inurl:listado' }
];
const KNOWN_MODELS = [
  { re: /\bjetta\b/i, make: 'Volkswagen', model: 'Jetta' },
  { re: /\btaos\b/i, make: 'Volkswagen', model: 'Taos' },
  { re: /\bkwid\b/i, make: 'Renault', model: 'Kwid' },
  { re: /\baveo\b/i, make: 'Chevrolet', model: 'Aveo' },
  { re: /\bversa\b/i, make: 'Nissan', model: 'Versa' },
  { re: /\bsentra\b/i, make: 'Nissan', model: 'Sentra' },
  { re: /\bmarch\b/i, make: 'Nissan', model: 'March' },
  { re: /\bcivic\b/i, make: 'Honda', model: 'Civic' },
  { re: /\bcorolla\b/i, make: 'Toyota', model: 'Corolla' },
  { re: /\btucson\b/i, make: 'Hyundai', model: 'Tucson' },
  { re: /\bmazda\s*3\b|\bmazda3\b/i, make: 'Mazda', model: '3' },
  { re: /\bcx[-\s]?5\b/i, make: 'Mazda', model: 'CX-5' },
  { re: /\bcx[-\s]?30\b/i, make: 'Mazda', model: 'CX-30' }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, done: () => clearTimeout(timer) };
}

function cleanCar(c, source) {
  const url = String(c.url || c.source_url || c.fuente_url || '').trim();
  const title = String(c.title || `${c.marca || c.make || ''} ${c.modelo || c.model || ''}`).trim();
  const rawPrice = c.precio ?? c.price_mxn ?? c.price;
  const rawYear = c.anio ?? c.year ?? title;
  const kmRaw = String(c.km ?? c.mileage_km ?? c.mileage ?? '').replace(/[^\d]/g, '');
  const quality = normalizeListingQuality(
    { price: rawPrice, year: rawYear, mileage: kmRaw === '' ? null : Number(kmRaw) },
    { source: source.label, priceContext: `${title} ${c.description || c.snippet || c.raw?.snippet || ''}` }
  );
  const thumbnail = String(c.thumbnail_url || c.image_url || '').trim();
  return {
    source_name: source.label,
    source_key: source.key,
    source_url: url,
    external_id: source.externalId ? source.externalId(url) : hash(url || title).slice(0, 24),
    make: String(c.marca || c.make || '').trim(),
    model: String(c.modelo || c.model || '').trim(),
    year: quality.year,
    price_mxn: quality.price,
    mileage_km: quality.mileage,
    location: [normalizeCity(c.city || c.ubicacion || c.location), normalizeState(c.state)].filter(Boolean).join(', ') || null,
    city: normalizeCity(c.city || c.ubicacion || c.location),
    state: normalizeState(c.state),
    version: String(c.version || '').trim() || null,
    transmission: normalizeTransmission(c.transmission),
    seller_name: String(c.seller_name || '').trim() || null,
    seller_type: String(c.seller_type || '').trim() || null,
    published_at: c.published_at || null,
    thumbnail_url: /^https?:\/\//i.test(thumbnail) ? thumbnail : null,
    image_kind: /^https?:\/\//i.test(thumbnail) ? 'real_source' : 'missing',
    title,
    quality_rejections: [...(Array.isArray(c.quality_rejections) ? c.quality_rejections : []), ...quality.rejections],
    raw: c
  };
}

function totalPriceFromSearchText(value) {
  const text = cleanText(value) || '';
  const total = text.match(/\bprecio(?:\s+(?:total|de contado|contado))?\s*[:\-]?\s*(?:mxn\s*)?\$\s*([\d.,]{5,})/i);
  if (total) return Number(total[1].replace(/[^\d]/g, '')) || null;
  const matches = [...text.matchAll(/(?:\$|mxn|m\.n\.)\s*([\d.,]{5,})|\b([\d.,]{5,})\s*(?:mxn|m\.n\.)\b/gi)];
  for (const match of matches) {
    const amount = Number(String(match[1] || match[2]).replace(/[^\d]/g, '')) || null;
    const context = text.slice(Math.max(0, match.index - 90), match.index + match[0].length + 90);
    if (/mensual|al\s+mes|enganche|inversi[oó]n\s+inicial|pago\s+inicial|apartado/i.test(context)) continue;
    if (amount) return amount;
  }
  return null;
}

function cleanSerperCar(item, source, marca, modelo, ciudad) {
  const url = String(item.link || item.url || '').trim();
  const title = String(item.title || '').trim();
  const snippet = String(item.snippet || '').trim();
  const text = `${title} ${snippet}`;
  const year = Number(text.match(/\b(19|20)\d{2}\b/)?.[0] || '') || null;
  const price = totalPriceFromSearchText(text);
  const inferredCity = source.key === 'seminuevos'
    ? seminuevos.cityFromVehicleUrl(url, marca, modelo)
    : null;
  return {
    source_name: source.label,
    source_key: source.key,
    source_url: url,
    external_id: hash(url || `${source.key}:${title}`).slice(0, 24),
    make: marca,
    model: modelo,
    year,
    price_mxn: price,
    mileage_km: null,
    location: normalizeCity(ciudad || inferredCity),
    city: normalizeCity(ciudad || inferredCity),
    state: null,
    version: null,
    transmission: null,
    seller_name: null,
    seller_type: null,
    published_at: null,
    thumbnail_url: null,
    image_kind: 'missing',
    title: title || `${marca} ${modelo}`.trim(),
    raw: { title, snippet, source: item.source || source.label, link: url }
  };
}

async function enrichSerperCars(cars, source, fallback) {
  const canEnrich = source.key === 'autocosmos'
    || (source.key === 'seminuevos' && Boolean(globalThis.Netlify?.env?.get('SCRAPERAPI_KEY') || process.env.SCRAPERAPI_KEY));
  if (!canEnrich || !cars.length) return cars;
  const extractor = source.key === 'autocosmos' ? autocosmos : seminuevos;
  const timeoutMs = source.key === 'autocosmos' ? 12000 : 30000;
  return Promise.all(cars.slice(0, 6).map(async car => {
    const detail = await extractor.extractListing(car.source_url, {
      timeoutMs,
      fallback: { ...fallback, ...car, title: car.title, snippet: car.raw?.snippet }
    });
    return detail && !detail.error ? cleanCar(detail, source) : car;
  }));
}

function precioValido(p) {
  return p === null || (Number.isFinite(p) && p >= 20000 && p <= 5000000);
}

function isIndividualSerperUrl(source, value) {
  let parsed;
  try { parsed = new URL(value); } catch (_) { return false; }
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const path = decodeURIComponent(parsed.pathname || '');
  if (!(host === source.domain || host.endsWith(`.${source.domain}`))) return false;
  if (source.key === 'mercadolibre') return /\/MLM-\d+/i.test(path);
  if (source.key === 'seminuevos') return /\/vehicle\/(?:[^/?]+\/)?\d+(?:[/?]|$)/i.test(path);
  if (source.key === 'autocosmos') return /\/auto\/usado\/[^/]+\/[^/]+\/[^/]+\/[a-f0-9]{32}(?:[/?]|$)/i.test(path);
  return false;
}

function isAllowedByRobots(rules, url) {
  if (!rules.length) return true;
  let path = '/';
  try {
    const parsed = new URL(url);
    path = parsed.pathname || '/';
  } catch (_) {}
  return !rules.some(rule => rule && path.startsWith(rule));
}

function parseRobots(text) {
  const groups = [];
  let current = null;
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = String(rawKey || '').trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      current = { agents: [value.toLowerCase()], disallow: [], crawlDelay: null };
      groups.push(current);
    } else if (key === 'disallow' && current) {
      current.disallow.push(value);
    } else if (key === 'crawl-delay' && current) {
      const seconds = Number(value);
      if (Number.isFinite(seconds)) current.crawlDelay = seconds;
    }
  }
  const matching = groups.filter(g => g.agents.some(a => a === '*' || a === 'tixuzbot'));
  const disallow = matching.flatMap(g => g.disallow).filter(Boolean);
  const delays = matching.map(g => g.crawlDelay).filter(d => d !== null);
  const crawlDelayMs = delays.length ? Math.max(...delays) * 1000 : null;
  return { disallow, crawlDelayMs };
}

async function loadRobotsFor(url) {
  const parsed = new URL(url);
  const origin = parsed.origin;
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  const robotsUrl = `${origin}/robots.txt`;
  try {
    const { controller, done } = withTimeout(5000);
    const res = await originalFetch(robotsUrl, {
      headers: { 'User-Agent': TIXUZBOT_UA, Accept: 'text/plain,*/*' },
      signal: controller.signal
    }).finally(done);
    const rules = res.ok ? parseRobots(await res.text()) : { disallow: [], crawlDelayMs: null };
    robotsCache.set(origin, rules);
    return rules;
  } catch (_) {
    const empty = { disallow: [], crawlDelayMs: null };
    robotsCache.set(origin, empty);
    return empty;
  }
}

const originalFetch = global.fetch.bind(global);
const domainLastFetchAt = new Map();

// Espera ANTES de disparar (no despues) para no pagar la pausa de rate-limit
// en la ultima peticion de una tanda corta (critico para fuentes con
// Crawl-delay alto como Kavak, corriendo dentro del timeout de una function).
async function queuedFetch(url, opts = {}) {
  const parsed = new URL(url);
  const host = parsed.hostname;
  const previous = domainQueues.get(host) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  domainQueues.set(host, previous.then(() => current));
  await previous;
  try {
    let gapMs = REQUEST_GAP_MS;
    if (!opts.skipRobots) {
      const { disallow, crawlDelayMs } = await loadRobotsFor(url);
      if (!isAllowedByRobots(disallow, url)) {
        const err = new Error(`robots_disallow:${parsed.pathname}`);
        err.code = 'ROBOTS_DISALLOW';
        throw err;
      }
      if (crawlDelayMs) gapMs = Math.max(gapMs, crawlDelayMs);
    }
    const lastAt = domainLastFetchAt.get(host) || 0;
    const waitMs = lastAt + gapMs - Date.now();
    if (waitMs > 0) await sleep(waitMs);
    const headers = { ...(opts.headers || {}), 'User-Agent': TIXUZBOT_UA };
    const res = await originalFetch(url, { ...opts, headers });
    domainLastFetchAt.set(host, Date.now());
    return res;
  } finally {
    release();
  }
}

async function withCrawlerFetch(fn) {
  const previous = global.fetch;
  global.fetch = queuedFetch;
  try {
    return await fn();
  } finally {
    global.fetch = previous;
  }
}

const SOURCES = [
  {
    key: 'seminuevos',
    label: 'Seminuevos',
    externalId: seminuevos.vehicleIdFromUrl,
    async discover(marca, modelo, ciudad, options) {
      return seminuevos.discover(marca, modelo, ciudad, options);
    },
    isVehicleUrl: seminuevos.isSeminuevosVehicleUrl
  },
  {
    key: 'autocosmos',
    label: 'AutoCosmos',
    externalId: autocosmos.autocosmosIdFromUrl,
    async discover(marca, modelo, ciudad, options) {
      return autocosmos.discover(marca, modelo, ciudad, options);
    },
    isVehicleUrl: autocosmos.isAutocosmosVehicleUrl
  },
  // 'carone' removido de la busqueda en vivo: carone.com.mx tiene
  // "User-agent: * / Disallow: /" en robots.txt, bloquea a TixuzBot por
  // completo (verificado 2026-07-11). Queda en agg_source_registry como
  // 'blocked' y el adaptador carone-discover.cjs se conserva por si cambian
  // su politica, pero no se le llama desde ningun lado.
  // GoCAR se conserva para la ingesta nocturna, pero no para búsquedas en
  // vivo: su HTML tarda más que el presupuesto de la función y no entrega
  // imágenes consistentes. El inventario persistido sigue disponible.
];

async function buscarFuentesExternas({ marca, modelo, ciudad = '', limitPerSource = 8 }) {
  const sourceTask = async source => {
    try {
      const found = await Promise.race([
        source.discover(marca, modelo, ciudad, { limit: limitPerSource, pages: 1 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('source_timeout')), SOURCE_TIMEOUT_MS))
      ]);
      const normalized = (Array.isArray(found) ? found : [])
        .map(item => cleanCar({ ...item, marca: item.marca || marca, modelo: item.modelo || modelo }, source))
        .filter(car => car.source_url && source.isVehicleUrl(car.source_url))
        .filter(car => car.external_id)
        .filter(car => precioValido(car.price_mxn))
        .filter(car => !hasPII({
          title: car.title,
          make: car.make,
          model: car.model,
          location: car.location,
          seller_name: car.seller_name
        }));
      return { cars: normalized, detail: { source: source.label, ok: true, count: normalized.length, method: 'direct_source' } };
    } catch (err) {
      return { cars: [], detail: { source: source.label, ok: false, count: 0, error: String(err.message || err).slice(0, 160) } };
    }
  };

  const timedOut = Symbol('total_timeout');
  const settled = await withCrawlerFetch(() => Promise.race([
    Promise.allSettled(SOURCES.map(sourceTask)),
    new Promise(resolve => setTimeout(() => resolve(timedOut), TOTAL_SEARCH_BUDGET_MS))
  ]));

  const detail = [];
  const cars = [];
  if (settled === timedOut) {
    for (const source of SOURCES) detail.push({ source: source.label, ok: false, count: 0, error: 'total_budget_timeout' });
  } else {
    for (const result of settled) {
      const value = result.status === 'fulfilled'
        ? result.value
        : { cars: [], detail: { ok: false, count: 0, error: String(result.reason?.message || result.reason).slice(0, 160) } };
      cars.push(...(value.cars || []));
      detail.push(value.detail);
    }
  }

  const seen = new Set();
  return {
    cars: cars.filter(car => {
      const key = `${car.source_key}:${car.external_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
    detail,
    partial: detail.some(item => !item.ok)
  };
}

async function buscarPorTexto(q, ciudad = '') {
  const text = String(q || '').trim();
  const known = KNOWN_MODELS.find(item => item.re.test(text));
  const parts = text.split(/\s+/).filter(Boolean);
  const marca = known?.make || parts[0] || '';
  const modelo = known?.model || parts.slice(1).join(' ');
  if (!marca || !modelo) return { cars: [], detail: [{ source: 'Fuentes externas', ok: false, count: 0, error: 'no_intent' }], partial: true };

  const queryBase = `${marca} ${modelo} usado venta Mexico ${ciudad || ''}`.replace(/\s+/g, ' ').trim();
  const modelTokens = normText(modelo).split(/\s+/).filter(Boolean);
  const searchVariant = async query => {
    const { controller, done } = withTimeout(7000);
    try {
      const res = await originalFetch(SERPER_API, {
        method: 'POST',
        headers: { 'X-API-KEY': serperApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: query,
          gl: 'mx',
          hl: 'es',
          num: 10
        }),
        signal: controller.signal
      }).finally(done);
      if (!res.ok) throw new Error(`serper_${res.status}`);
      const data = await res.json();
      return data.organic || [];
    } finally {
      done();
    }
  };

  const sourceTask = async source => {
    try {
      const site = source.searchSite || source.domain;
      const queries = [`${queryBase} site:${site} ${source.queryExtra || ''}`.trim()];
      if (source.key === 'mercadolibre') {
        queries.push(`${marca} ${modelo} site:${site}/MLM`);
      }
      if (source.key === 'seminuevos') {
        queries.push(`${marca} ${modelo} seminuevo site:${site}`);
      }
      if (source.key === 'autocosmos') {
        if (normText(modelo) === 'kwid') {
          queries.push(`${marca} ${modelo} Intens site:${site}/renault/kwid/intens`);
          queries.push(`${marca} ${modelo} Iconic site:${site}/renault/kwid`);
        } else {
          queries.push(`${marca} ${modelo} site:${site} -inurl:? -inurl:listado`);
          queries.push(`"${marca} ${modelo}" site:${site}`);
        }
      }

      const attempts = await Promise.allSettled(queries.map(searchVariant));
      const successful = attempts.filter(result => result.status === 'fulfilled');
      if (!successful.length) {
        const reason = attempts.find(result => result.status === 'rejected')?.reason;
        throw reason || new Error('serper_no_response');
      }
      const organic = successful.flatMap(result => result.value || []);
      const normalized = organic
        .filter(item => {
          const text = normText(`${item.title || ''} ${item.link || ''}`);
          return !text.includes('no disponible') && modelTokens.every(token => text.includes(token));
        })
        .map(item => cleanSerperCar(item, source, marca, modelo, ciudad))
        .filter(car => car.source_url && car.external_id)
        .filter(car => isIndividualSerperUrl(source, car.source_url))
        .filter(car => !hasPII({
          title: car.title,
          make: car.make,
          model: car.model,
          location: car.location
        }))
        .filter(car => precioValido(car.price_mxn));
      const enriched = await enrichSerperCars(normalized, source, { marca, modelo, city: ciudad || null });
      return { cars: enriched, detail: { source: source.label, ok: true, count: enriched.length, method: source.key === 'autocosmos' ? 'serper_discovery_direct_detail' : 'serper_discovery' } };
    } catch (err) {
      return { cars: [], detail: { source: source.label, ok: false, count: 0, error: String(err.message || err).slice(0, 160) } };
    }
  };

  const mlSource = {
    key: 'mercadolibre',
    label: 'MercadoLibre',
    externalId: mercadolibre.mlItemIdFromUrl
  };
  const mlTask = async () => {
    try {
      const found = await mercadolibre.searchListings(marca, modelo, { limit: 10, timeoutMs: 12000 });
      const normalized = found
        .map(item => cleanCar(item, mlSource))
        .filter(car => car.source_url && mercadolibre.isMercadoLibreVehicleUrl(car.source_url))
        .filter(car => car.external_id && precioValido(car.price_mxn))
        .filter(car => !hasPII({ title: car.title, make: car.make, model: car.model, location: car.location }));
      return {
        cars: normalized,
        detail: {
          source: 'MercadoLibre',
          ok: normalized.length > 0,
          count: normalized.length,
          method: 'official_api',
          ...(normalized.length ? {} : { error: 'no_accessible_api_listings' })
        }
      };
    } catch (err) {
      return { cars: [], detail: { source: 'MercadoLibre', ok: false, count: 0, method: 'official_api', error: String(err.message || err).slice(0, 160) } };
    }
  };
  const directTask = async () => buscarFuentesExternas({ marca, modelo, ciudad, limitPerSource: 8 });
  const tasks = [mlTask(), directTask()];
  const settled = await Promise.allSettled(tasks);
  const detail = [];
  const cars = [];
  for (const result of settled) {
    const value = result.status === 'fulfilled'
      ? result.value
      : { cars: [], detail: { source: 'Fuentes directas', ok: false, count: 0, error: String(result.reason?.message || result.reason).slice(0, 160) } };
    cars.push(...(value.cars || []));
    if (Array.isArray(value.detail)) detail.push(...value.detail);
    else if (value.detail) detail.push(value.detail);
  }

  const seen = new Set();
  return {
    cars: cars.filter(car => {
      const key = String(car.source_url || '').replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
    detail,
    partial: detail.some(item => !item.ok)
  };
}

module.exports = {
  TIXUZBOT_UA,
  SOURCES,
  normText,
  buscarFuentesExternas,
  buscarPorTexto,
  cleanCar,
  totalPriceFromSearchText,
  withCrawlerFetch
};
