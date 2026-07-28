const {
  cleanText,
  integerOrNull,
  isoDateOrNull,
  normalizeCity,
  normalizeSellerType,
  normalizeState,
  normalizeTransmission,
  validHttpUrl,
  yearOrNull
} = require('./lib/listing-normalize.cjs');

const BASE_URL = 'https://www.kavak.com';
const SITEMAP_URL = `${BASE_URL}/mx/sitemap-msku-vips-mx.xml`;
const SITEMAP_TTL_MS = 6 * 60 * 60 * 1000;
let sitemapCache = { urls: [], fetchedAt: 0 };

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, done: () => clearTimeout(timer) };
}

function normText(value) {
  return String(value || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
}

async function fetchText(url, timeoutMs = 20000) {
  const { controller, done } = withTimeout(timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'TixuzBot/1.0 (+https://tixuzautos.com/bot; contacto: bot@tixuzautos.com)',
        Accept: 'text/html,application/xml,text/xml,*/*'
      }
    });
    if (!response.ok) throw new Error(`fetch_${response.status}`);
    return await response.text();
  } finally {
    done();
  }
}

function cleanUrl(value) {
  try {
    const url = new URL(value, BASE_URL);
    url.search = '';
    url.hash = '';
    return url.href.replace(/\/$/, '');
  } catch (_) {
    return '';
  }
}

function kavakIdFromUrl(value) {
  try {
    const parts = new URL(value, BASE_URL).pathname.split('/').filter(Boolean);
    return parts[0] === 'mx' && parts[1] === 'usado' ? parts[2] || null : null;
  } catch (_) {
    return null;
  }
}

function isKavakVehicleUrl(value) {
  try {
    const url = new URL(value, BASE_URL);
    const parts = url.pathname.split('/').filter(Boolean);
    return url.hostname.replace(/^www\./i, '').toLowerCase() === 'kavak.com'
      && parts[0] === 'mx' && parts[1] === 'usado' && Boolean(parts[2]);
  } catch (_) {
    return false;
  }
}

async function getSitemapUrls(opts = {}) {
  const now = Date.now();
  if (sitemapCache.urls.length && now - sitemapCache.fetchedAt < SITEMAP_TTL_MS) return sitemapCache.urls;
  const xml = await fetchText(SITEMAP_URL, opts.timeoutMs || 25000);
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => cleanUrl(match[1])).filter(isKavakVehicleUrl);
  sitemapCache = { urls, fetchedAt: now };
  return urls;
}

function matchesIntent(url, marca, modelo) {
  const slug = normText(url);
  return (!marca || slug.includes(normText(marca))) && (!modelo || slug.includes(normText(modelo)));
}

function typeIncludes(value, type) {
  const values = Array.isArray(value) ? value : [value];
  return values.some(item => String(item || '').toLowerCase() === type.toLowerCase());
}

function findCar(value) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const car = findCar(item);
      if (car) return car;
    }
    return null;
  }
  if (typeIncludes(value['@type'], 'Car') || typeIncludes(value['@type'], 'Vehicle')) return value;
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') {
      const car = findCar(child);
      if (car) return car;
    }
  }
  return null;
}

function extractCarFromHtml(html) {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of String(html || '').matchAll(re)) {
    try {
      const car = findCar(JSON.parse(match[1]));
      if (car) return car;
    } catch (_) {
      // Continue with the next JSON-LD block.
    }
  }
  return null;
}

function objectName(value) {
  if (!value) return null;
  if (typeof value === 'string') return cleanText(value);
  return cleanText(value.name || value.legalName || '');
}

function imageFromCar(car) {
  const images = Array.isArray(car?.image) ? car.image : [car?.image];
  for (const raw of images) {
    const candidate = typeof raw === 'object' ? raw.url || raw.contentUrl : raw;
    const image = validHttpUrl(candidate, ['images.prd.kavak.io']);
    if (image) return image;
  }
  return null;
}

function additionalProperty(car, names) {
  const wanted = names.map(name => normText(name));
  const properties = Array.isArray(car?.additionalProperty) ? car.additionalProperty : [car?.additionalProperty];
  const property = properties.find(item => item && wanted.includes(normText(item.name || item.propertyID)));
  return property?.value ?? property?.valueReference ?? null;
}

function parseCar(car, url, fallback = {}) {
  const offer = Array.isArray(car.offers) ? car.offers[0] : car.offers || {};
  const sellerObject = offer.seller || offer.offeredBy || car.seller || car.provider || {};
  const address = sellerObject.address || offer.availableAtOrFrom?.address || car.availableAtOrFrom?.address || car.address || {};
  const city = normalizeCity(address.addressLocality || fallback.city);
  const state = normalizeState(address.addressRegion || fallback.state);
  const image = imageFromCar(car);
  const listingUrl = cleanUrl(url);
  return {
    id: kavakIdFromUrl(listingUrl),
    url: listingUrl,
    title: cleanText(car.name || fallback.title),
    marca: objectName(car.brand) || fallback.marca || null,
    modelo: objectName(car.model) || fallback.modelo || null,
    version: cleanText(car.vehicleConfiguration || additionalProperty(car, ['version', 'trim'])),
    transmission: normalizeTransmission(car.vehicleTransmission || additionalProperty(car, ['transmission', 'transmision'])),
    anio: yearOrNull(car.vehicleModelDate || car.productionDate),
    precio: integerOrNull(offer.price || car.price),
    km: integerOrNull(car.mileageFromOdometer?.value || car.mileageFromOdometer || additionalProperty(car, ['mileage', 'kilometraje', 'kilometers'])),
    city,
    state,
    ubicacion: [city, state].filter(Boolean).join(', ') || null,
    seller_name: objectName(sellerObject) || 'Kavak',
    seller_type: normalizeSellerType(sellerObject['@type'] || 'Kavak'),
    published_at: isoDateOrNull(car.datePosted || car.datePublished || car.dateCreated || car.releaseDate),
    image_url: image,
    thumbnail_url: image,
    image_verified: Boolean(image),
    image_source: image ? 'listing_jsonld' : null,
    images: image ? [{ url: image, source: 'listing_jsonld' }] : [],
    portal: 'Kavak',
    fuente_portal: 'Kavak'
  };
}

async function extractListing(url, opts = {}) {
  const clean = cleanUrl(url);
  if (!isKavakVehicleUrl(clean)) {
    return { url: clean || url, id: kavakIdFromUrl(url), image_url: null, thumbnail_url: null, images: [], error: 'not_kavak_vehicle' };
  }
  try {
    const html = await fetchText(clean, opts.timeoutMs || 20000);
    const car = extractCarFromHtml(html);
    if (!car) return { url: clean, id: kavakIdFromUrl(clean), image_url: null, thumbnail_url: null, images: [], error: 'no_jsonld_car' };
    return parseCar(car, clean, opts.fallback || {});
  } catch (error) {
    return { url: clean, id: kavakIdFromUrl(clean), image_url: null, thumbnail_url: null, images: [], error: error.message || String(error) };
  }
}

async function discover(marca, modelo, ciudad = '', opts = {}) {
  if (!marca && !modelo) return [];
  const limit = Math.min(Math.max(opts.limit || 2, 1), 5);
  const candidateLimit = Math.min(Math.max(opts.candidateLimit || 20, limit), 100);
  const maxAttempts = Math.min(Math.max(opts.maxAttempts || Math.max(limit * 2, 3), limit), candidateLimit);
  const urls = (await getSitemapUrls(opts)).filter(url => matchesIntent(url, marca, modelo)).slice(0, maxAttempts);
  const out = [];
  for (const url of urls) {
    if (out.length >= limit) break;
    const item = await extractListing(url, { ...opts, fallback: { marca, modelo, city: ciudad || null } });
    if (!item.error && item.id && item.precio) out.push(item);
  }
  return out;
}

module.exports = {
  discover,
  extractCarFromHtml,
  extractListing,
  getSitemapUrls,
  isKavakVehicleUrl,
  kavakIdFromUrl,
  matchesIntent,
  normText,
  parseCar
};
