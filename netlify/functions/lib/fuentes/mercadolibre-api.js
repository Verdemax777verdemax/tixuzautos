const { sb } = require('../../_shared');
const {
  cleanText,
  decodeHtml,
  integerOrNull,
  isoDateOrNull,
  normalizeCity,
  normalizeListingQuality,
  normalizeState,
  normalizeTransmission,
  stripTags,
  validHttpUrl,
  yearOrNull
} = require('../listing-normalize.cjs');

const ML_API = 'https://api.mercadolibre.com';
const ML_SITE = 'MLM';
const ML_CATEGORY = 'MLM1744';
const ML_CLIENT_ID = '7121462285530717';
const REFRESH_AFTER_MS = 5.5 * 60 * 60 * 1000;
const TOKEN_KEYS = [
  'ml_access_token',
  'ml_refresh_token',
  'ml_token_obtained_at',
  'ml_token_expires_in'
];
const IMAGE_HOSTS = ['mlstatic.com'];
const SERPER_API = 'https://google.serper.dev/search';
const PUBLIC_CATALOG = 'https://autos.mercadolibre.com.mx';
const nativeFetch = global.fetch.bind(global);
let refreshPromise = null;
let listingAccessBlockedUntil = 0;

function env(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || '';
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, done: () => clearTimeout(timer) };
}

async function readTokenConfig() {
  const response = await sb(`app_config?key=in.(${TOKEN_KEYS.join(',')})&select=key,value`);
  if (!response.ok) throw new Error(`ml_config_${response.status}`);
  const values = Object.fromEntries((response.data || []).map(row => [row.key, row.value]));
  const missing = TOKEN_KEYS.filter(key => !values[key]);
  if (missing.length) throw new Error(`ml_config_missing:${missing.join(',')}`);
  return {
    accessToken: values.ml_access_token,
    refreshToken: values.ml_refresh_token,
    obtainedAt: values.ml_token_obtained_at,
    expiresIn: Number(values.ml_token_expires_in) || 21600
  };
}

async function saveTokenConfig(tokens) {
  if (!tokens?.access_token || !tokens?.refresh_token) throw new Error('ml_refresh_incomplete_response');
  const obtainedAt = new Date().toISOString();
  const rows = [
    { key: 'ml_access_token', value: String(tokens.access_token), updated_at: obtainedAt },
    { key: 'ml_refresh_token', value: String(tokens.refresh_token), updated_at: obtainedAt },
    { key: 'ml_token_obtained_at', value: obtainedAt, updated_at: obtainedAt },
    { key: 'ml_token_expires_in', value: String(Number(tokens.expires_in) || 21600), updated_at: obtainedAt }
  ];
  const response = await sb('app_config?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows)
  });
  if (!response.ok) throw new Error(`ml_config_save_${response.status}:${JSON.stringify(response.data).slice(0, 180)}`);
  return {
    accessToken: String(tokens.access_token),
    refreshToken: String(tokens.refresh_token),
    obtainedAt,
    expiresIn: Number(tokens.expires_in) || 21600
  };
}

async function refreshAccessToken(current) {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const clientSecret = env('ML_CLIENT_SECRET');
    if (!clientSecret) throw new Error('missing_ML_CLIENT_SECRET');
    const form = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env('ML_APP_ID') || ML_CLIENT_ID,
      client_secret: clientSecret,
      refresh_token: current.refreshToken
    });
    const { controller, done } = withTimeout(15000);
    try {
      const response = await nativeFetch(`${ML_API}/oauth/token`, {
        method: 'POST',
        signal: controller.signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString()
      });
      const text = await response.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { message: text }; }
      if (!response.ok) throw new Error(`ml_refresh_${response.status}:${data.error || data.message || 'unknown'}`);
      return saveTokenConfig(data);
    } finally {
      done();
    }
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

function tokenNeedsRefresh(config, now = Date.now()) {
  const obtained = Date.parse(config?.obtainedAt || '');
  if (!config?.accessToken || !config?.refreshToken || !Number.isFinite(obtained)) return true;
  const age = Math.max(0, now - obtained);
  const expiresMs = Math.max(0, Number(config.expiresIn) || 21600) * 1000;
  return age >= REFRESH_AFTER_MS || (expiresMs > 0 && age >= expiresMs - 15 * 60 * 1000);
}

async function getAccessToken(options = {}) {
  const current = await readTokenConfig();
  if (options.forceRefresh || tokenNeedsRefresh(current)) return (await refreshAccessToken(current)).accessToken;
  return current.accessToken;
}

async function apiJson(path, options = {}) {
  const token = await getAccessToken();
  const request = async accessToken => {
    const { controller, done } = withTimeout(options.timeoutMs || 15000);
    try {
      const response = await nativeFetch(`${ML_API}${path}`, {
        method: options.method || 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` }
      });
      const text = await response.text();
      let data;
      try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
      return { response, data };
    } finally {
      done();
    }
  };
  let result = await request(token);
  if (result.response.status === 401) {
    const latest = await readTokenConfig();
    const retryToken = latest.accessToken !== token
      ? latest.accessToken
      : await getAccessToken({ forceRefresh: true });
    result = await request(retryToken);
  }
  if (!result.response.ok) {
    const detail = result.data?.message || result.data?.error || result.response.statusText || 'unknown';
    throw new Error(`ml_api_${result.response.status}:${String(detail).slice(0, 160)}`);
  }
  return result.data;
}

function attributeValue(attributes, ids) {
  const wanted = new Set((Array.isArray(ids) ? ids : [ids]).map(id => String(id).toUpperCase()));
  const attribute = (attributes || []).find(item => wanted.has(String(item?.id || '').toUpperCase()));
  return attribute?.value_name
    || attribute?.value_struct?.number
    || attribute?.values?.[0]?.name
    || attribute?.values?.[0]?.struct?.number
    || null;
}

function mlItemIdFromUrl(value) {
  try {
    return decodeURIComponent(new URL(value).pathname).match(/\b(MLM-?\d+)\b/i)?.[1]?.replace('-', '').toUpperCase() || null;
  } catch (_) {
    return String(value || '').match(/\b(MLM-?\d+)\b/i)?.[1]?.replace('-', '').toUpperCase() || null;
  }
}

function isMercadoLibreVehicleUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    return /(^|\.)mercadolibre\.com\.mx$/.test(host) && Boolean(mlItemIdFromUrl(value));
  } catch (_) {
    return false;
  }
}

function normalizePicture(raw) {
  const image = validHttpUrl(raw, IMAGE_HOSTS);
  if (!image) return null;
  return image.replace(/^http:\/\//i, 'https://').replace(/-I\.(jpg|jpeg|png|webp)$/i, '-O.$1');
}

function slugify(value) {
  return String(value || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function htmlAttribute(tag, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return decodeHtml(String(tag || '').match(new RegExp(`${escaped}=["']([^"']+)["']`, 'i'))?.[1] || '');
}

function textByClass(html, className) {
  const escaped = String(className).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const value = String(html || '').match(new RegExp(`<[^>]+class=["'][^"']*${escaped}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i'))?.[1];
  return cleanText(stripTags(value || ''));
}

function locationFromPublicCard(value) {
  const text = cleanText(value);
  if (!text) return { city: null, state: null };
  const separator = text.lastIndexOf(' - ');
  if (separator < 1) return { city: normalizeCity(text), state: null };
  return {
    city: normalizeCity(text.slice(0, separator)),
    state: normalizeState(text.slice(separator + 3))
  };
}

function parsePublicCatalogCard(card) {
  const anchor = String(card || '').match(/<a[^>]+class=["'][^"']*poly-component__title[^"']*["'][^>]*>[\s\S]*?<\/a>/i)?.[0] || '';
  const urlValue = htmlAttribute(anchor, 'href');
  let sourceUrl = '';
  try {
    const url = new URL(urlValue);
    url.hash = '';
    sourceUrl = url.href;
  } catch (_) {
    return null;
  }
  const id = mlItemIdFromUrl(sourceUrl);
  if (!id || !isMercadoLibreVehicleUrl(sourceUrl)) return null;
  const title = cleanText(stripTags(anchor));
  const imageTag = String(card || '').match(/<img[^>]+class=["'][^"']*poly-component__picture[^"']*["'][^>]*>/i)?.[0] || '';
  const image = normalizePicture(htmlAttribute(imageTag, 'src'));
  const priceTag = String(card || '').match(/<span[^>]+class=["'][^"']*andes-money-amount[^"']*["'][^>]*>/i)?.[0] || '';
  const price = integerOrNull(htmlAttribute(priceTag, 'aria-label') || textByClass(card, 'andes-money-amount__fraction'));
  const attributes = [...String(card || '').matchAll(/<li[^>]+class=["'][^"']*poly-attributes_list__item[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)]
    .map(match => cleanText(stripTags(match[1]))).filter(Boolean);
  const year = yearOrNull(attributes[0] || title);
  const mileage = integerOrNull(attributes.find(value => /\bkm\b/i.test(value)));
  const location = locationFromPublicCard(textByClass(card, 'poly-component__location'));
  const seller = textByClass(card, 'poly-component__seller');
  const words = title.split(/\s+/).filter(Boolean);
  const modelWords = words.slice(1).filter(word => !/^20\d{2}$/.test(word));
  return {
    id,
    external_id: id,
    url: sourceUrl,
    source_url: sourceUrl,
    title,
    marca: words[0] || null,
    make: words[0] || null,
    modelo: modelWords[0] || null,
    model: modelWords[0] || null,
    anio: year,
    year,
    precio: price,
    price_mxn: price,
    km: mileage,
    mileage_km: mileage,
    city: location.city,
    state: location.state,
    ubicacion: [location.city, location.state].filter(Boolean).join(', ') || null,
    location: [location.city, location.state].filter(Boolean).join(', ') || null,
    seller_name: seller,
    seller_type: seller ? 'dealer' : null,
    image_url: image,
    thumbnail_url: image,
    image_verified: Boolean(image),
    image_source: image ? 'public_catalog_card' : null,
    images: image ? [{ url: image, source: 'public_catalog_card' }] : [],
    discovery_method: 'public_catalog_card',
    portal: 'MercadoLibre',
    fuente_portal: 'MercadoLibre'
  };
}

function parsePublicCatalog(html, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 50);
  const sections = String(html || '').split(/<li[^>]+class=["'][^"']*ui-search-layout__item[^"']*["'][^>]*>/i).slice(1);
  const seen = new Set();
  const out = [];
  for (const section of sections) {
    const listing = parsePublicCatalogCard(section);
    if (!listing || seen.has(listing.id)) continue;
    if (!listing.image_verified || !listing.price_mxn || !listing.mileage_km || listing.mileage_km <= 0) continue;
    if (!listing.city || !listing.state) continue;
    seen.add(listing.id);
    out.push(listing);
    if (out.length >= limit) break;
  }
  return out;
}

async function searchPublicCatalog(marca = '', modelo = '', options = {}) {
  const path = [slugify(marca), slugify(modelo), 'autos-usados'].filter(Boolean).join('/');
  const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 50);
  const pages = Math.min(Math.max(Number(options.pages) || 4, 1), 6);
  const out = [];
  const seen = new Set();
  for (let page = 0; page < pages && out.length < limit; page++) {
    const suffix = page === 0 ? '' : `_Desde_${49 + (page - 1) * 48}_NoIndex_True`;
    const url = `${PUBLIC_CATALOG}/${path}/${suffix}`;
    const { controller, done } = withTimeout(options.timeoutMs || 20000);
    try {
      const response = await nativeFetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36 TixuzBot/1.0'
        }
      });
      if (!response.ok) throw new Error(`ml_public_catalog_${response.status}`);
      for (const listing of parsePublicCatalog(await response.text(), { limit: 50 })) {
        if (seen.has(listing.id)) continue;
        seen.add(listing.id);
        out.push(listing);
        if (out.length >= limit) break;
      }
    } finally {
      done();
    }
  }
  return out;
}

async function discoverWithSerper(marca, modelo, limit) {
  const apiKey = env('SERPER_API_KEY');
  if (!apiKey) throw new Error('ml_search_forbidden_and_missing_SERPER_API_KEY');
  const queries = [
    `${marca} ${modelo} usado venta Mexico site:auto.mercadolibre.com.mx`,
    `${marca} ${modelo} site:auto.mercadolibre.com.mx/MLM`
  ];
  const attempts = await Promise.allSettled(queries.map(async q => {
    const { controller, done } = withTimeout(12000);
    try {
      const response = await nativeFetch(SERPER_API, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, gl: 'mx', hl: 'es', num: 10 })
      });
      if (!response.ok) throw new Error(`ml_serper_${response.status}`);
      return (await response.json()).organic || [];
    } finally {
      done();
    }
  }));
  const organic = attempts.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  if (!organic.length && attempts.every(result => result.status === 'rejected')) {
    throw attempts[0].reason;
  }
  const seen = new Set();
  const candidateLimit = Math.min(Math.max(limit * 3, 10), 20);
  return organic.map(item => {
      const id = mlItemIdFromUrl(item.link);
      if (!id || seen.has(id)) return null;
      seen.add(id);
      return { id, permalink: item.link, title: item.title, discovery_method: 'serper_ids_official_item_api' };
    }).filter(Boolean).slice(0, candidateLimit);
}

function itemLocation(detail, searchItem) {
  const city = normalizeCity(
    detail?.location?.city?.name
    || detail?.address?.city_name
    || searchItem?.location?.city?.name
    || searchItem?.address?.city_name
    || detail?.seller_address?.city?.name
    || searchItem?.seller_address?.city?.name
  );
  const state = normalizeState(
    detail?.location?.state?.name
    || detail?.address?.state_name
    || searchItem?.location?.state?.name
    || searchItem?.address?.state_name
    || detail?.seller_address?.state?.name
    || searchItem?.seller_address?.state?.name
  );
  return { city, state };
}

function mapListing(searchItem, detail, seller, fallback = {}) {
  const attributes = detail?.attributes || searchItem?.attributes || [];
  const id = cleanText(detail?.id || searchItem?.id);
  const sourceUrl = cleanText(detail?.permalink || searchItem?.permalink);
  if (!id || !sourceUrl || !isMercadoLibreVehicleUrl(sourceUrl)) return null;
  const make = cleanText(attributeValue(attributes, ['BRAND', 'VEHICLE_BRAND']) || fallback.marca);
  const model = cleanText(attributeValue(attributes, ['MODEL', 'VEHICLE_MODEL']) || fallback.modelo);
  const version = cleanText(attributeValue(attributes, ['TRIM', 'VERSION', 'VEHICLE_VERSION']));
  const transmission = normalizeTransmission(attributeValue(attributes, ['TRANSMISSION', 'VEHICLE_TRANSMISSION']));
  const rawYear = attributeValue(attributes, ['VEHICLE_YEAR', 'MODEL_YEAR', 'YEAR']) || detail?.title || searchItem?.title;
  const rawMileage = attributeValue(attributes, ['KILOMETERS', 'MILEAGE', 'VEHICLE_MILEAGE']);
  const location = itemLocation(detail, searchItem);
  const pictureRecords = detail?.pictures?.length
    ? detail.pictures
    : searchItem?.pictures?.length
      ? searchItem.pictures
      : [{ secure_url: searchItem?.thumbnail }];
  const pictures = pictureRecords
    .map(picture => normalizePicture(picture?.secure_url || picture?.url))
    .filter(Boolean);
  const image = pictures[0] || null;
  const sellerName = cleanText(searchItem?.seller?.nickname || detail?.seller?.nickname || seller?.nickname);
  const sellerType = detail?.official_store_id || seller?.user_type === 'brand' || seller?.eshop ? 'dealer' : null;
  const publishedAt = isoDateOrNull(detail?.date_created || searchItem?.date_created);
  const rawPrice = detail?.price ?? searchItem?.price;
  const sourceTitle = cleanText(detail?.title || searchItem?.title);
  const quality = normalizeListingQuality(
    { price: rawPrice, year: rawYear, mileage: rawMileage },
    { source: 'MercadoLibre', priceContext: `${sourceTitle || ''} ${detail?.subtitle || ''}` }
  );
  const { price, year, mileage } = quality;
  const title = sourceTitle || [year, make, model, version].filter(Boolean).join(' ');
  return {
    id,
    external_id: id,
    url: sourceUrl,
    source_url: sourceUrl,
    permalink: sourceUrl,
    title,
    marca: make,
    make,
    modelo: model,
    model,
    version,
    transmission,
    anio: year,
    year,
    precio: price,
    price_mxn: price,
    km: mileage,
    mileage_km: mileage,
    city: location.city,
    state: location.state,
    ubicacion: [location.city, location.state].filter(Boolean).join(', ') || null,
    location: [location.city, location.state].filter(Boolean).join(', ') || null,
    seller_name: sellerName,
    seller_type: sellerType,
    published_at: publishedAt,
    image_url: image,
    thumbnail_url: image,
    image_verified: Boolean(image),
    image_source: image ? 'item_pictures' : null,
    images: pictures.map(url => ({ url, source: 'item_pictures' })),
    quality_rejections: quality.rejections,
    discovery_method: searchItem?.discovery_method || 'official_search_api',
    portal: 'MercadoLibre',
    fuente_portal: 'MercadoLibre'
  };
}

async function mapLimit(items, concurrency, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return out;
}

async function searchListings(marca, modelo, options = {}) {
  const query = [marca, modelo].filter(Boolean).join(' ').trim();
  if (!query) return [];
  if (Date.now() < listingAccessBlockedUntil) throw new Error('ml_listing_api_forbidden_cached');
  const limit = Math.min(Math.max(Number(options.limit) || 8, 1), 20);
  const params = new URLSearchParams({
    category: ML_CATEGORY,
    q: query,
    condition: 'used',
    limit: String(limit)
  });
  let results;
  let officialSearch = false;
  try {
    const search = await apiJson(`/sites/${ML_SITE}/search?${params.toString()}`, { timeoutMs: options.timeoutMs || 15000 });
    results = Array.isArray(search?.results)
      ? search.results.slice(0, limit).map(item => ({ ...item, discovery_method: 'official_search_api' }))
      : [];
    officialSearch = true;
  } catch (error) {
    if (!/^ml_api_403:/.test(String(error.message || error))) throw error;
    const publicResults = await searchPublicCatalog(marca, modelo, { limit, timeoutMs: options.timeoutMs || 20000 });
    if (publicResults.length) return publicResults;
    return [];
  }
  const detailResults = await mapLimit(results, 4, async item => {
    try {
      return { detail: await apiJson(`/items/${encodeURIComponent(item.id)}`, { timeoutMs: options.timeoutMs || 15000 }), error: null };
    } catch (error) {
      return { detail: null, error: String(error.message || error) };
    }
  });
  const details = detailResults.map(result => result.detail);
  if (!officialSearch && detailResults.length
    && details.every(detail => !detail)
    && detailResults.some(result => /^ml_api_403:/.test(result.error || ''))) {
    listingAccessBlockedUntil = Date.now() + 10 * 60 * 1000;
    throw new Error('ml_items_api_403:Access to listings is forbidden for the current OAuth grant');
  }
  const sellerIds = [...new Set(results.map((item, index) => details[index]?.seller_id || item?.seller?.id).filter(Boolean))];
  const sellers = new Map();
  await mapLimit(sellerIds, 4, async id => {
    const seller = await apiJson(`/users/${encodeURIComponent(id)}`, { timeoutMs: options.timeoutMs || 15000 }).catch(() => null);
    if (seller) sellers.set(String(id), seller);
  });
  return results
    .map((item, index) => {
      const detail = details[index] || (officialSearch ? item : null);
      if (!detail) return null;
      const sellerId = detail.seller_id || item?.seller?.id;
      return mapListing(item, detail, sellers.get(String(sellerId)), { marca, modelo });
    })
    .filter(Boolean)
    .slice(0, limit);
}

module.exports = {
  ML_CATEGORY,
  ML_CLIENT_ID,
  REFRESH_AFTER_MS,
  apiJson,
  getAccessToken,
  isMercadoLibreVehicleUrl,
  mapListing,
  mlItemIdFromUrl,
  normalizePicture,
  parsePublicCatalog,
  parsePublicCatalogCard,
  readTokenConfig,
  discoverWithSerper,
  searchListings,
  searchPublicCatalog,
  tokenNeedsRefresh
};
