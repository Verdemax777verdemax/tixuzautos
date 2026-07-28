const {
  absoluteDateFromHtml,
  cleanText,
  decodeHtml,
  integerOrNull,
  isoDateOrNull,
  labelValue,
  metaContent,
  normalizeCity,
  normalizeSellerType,
  normalizeState,
  normalizeTransmission,
  schemaAddress,
  schemaImageUrls,
  schemaName,
  schemaOffer,
  validHttpUrl,
  vehicleJsonLdFromHtml,
  yearOrNull
} = require('./lib/listing-normalize.cjs');

const BASE_URL = 'https://www.seminuevos.com';
const SCRAPER_API_URL = 'https://api.scraperapi.com';
const VEHICLE_HOST_RE = /(^|\.)seminuevos\.com$/i;
const TIXUZBOT_UA = 'TixuzBot/1.0 (+https://tixuzautos.com/bot; contacto: bot@tixuzautos.com)';

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, done: () => clearTimeout(timer) };
}

function env(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || '';
}

function normText(value) {
  return String(value || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function slugify(value) {
  return normText(value).replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function cleanUrl(value) {
  try {
    const url = new URL(decodeHtml(value), BASE_URL);
    url.hash = '';
    url.search = '';
    return url.href.replace(/\/$/, '');
  } catch (_) {
    return '';
  }
}

function vehicleIdFromUrl(value) {
  try {
    return decodeURIComponent(new URL(value, BASE_URL).pathname).match(/\/vehicle\/[^/]+\/(\d+)(?:\/)?$/i)?.[1] || null;
  } catch (_) {
    return null;
  }
}

function isSeminuevosVehicleUrl(value) {
  try {
    const url = new URL(value, BASE_URL);
    return VEHICLE_HOST_RE.test(url.hostname.replace(/^www\./i, ''))
      && /\/vehicle\/[^/]+\/\d+(?:\/)?$/i.test(url.pathname);
  } catch (_) {
    return false;
  }
}

function cityFromVehicleUrl(value, marca, modelo) {
  try {
    const path = decodeURIComponent(new URL(value, BASE_URL).pathname.toLowerCase());
    const slug = path.split('/vehicle/')[1]?.replace(/\/\d+\/?$/, '') || '';
    const prefix = `${slugify(marca)}-${slugify(modelo)}-`;
    const tail = slug.replace(/^autos-/, '').replace(prefix, '').replace(/-(19|20)\d{2}$/, '');
    if (!tail || tail === slug) return null;
    return normalizeCity(tail.split(/[-_]+/).map(p => p ? p[0].toUpperCase() + p.slice(1) : '').join(' '));
  } catch (_) {
    return null;
  }
}

function isListingImage(listingUrl, imageUrl) {
  const id = vehicleIdFromUrl(listingUrl);
  const image = validHttpUrl(imageUrl, ['images.latamautos.com']);
  if (!id || !image) return false;
  const path = new URL(image).pathname;
  return path.includes(`/${id}/`) || path.includes(`_${id}_`) || path.includes(`pt_${id}_`);
}

function listingImages(html, listingUrl) {
  const id = vehicleIdFromUrl(listingUrl);
  if (!id) return [];
  const candidates = [];
  const re = /https?:\/\/images\.latamautos\.com\/[^"'\\\s<>]+/gi;
  for (const match of String(html || '').matchAll(re)) {
    const raw = decodeHtml(match[0]).replace(/\\u0026/g, '&').replace(/[),]+$/, '');
    const image = validHttpUrl(raw, ['images.latamautos.com']);
    if (!image || !isListingImage(listingUrl, image)) continue;
    const large = image.replace('/thumbs/w/sm/', '/thumbs/w/lg/');
    if (!candidates.includes(large)) candidates.push(large);
  }
  return candidates;
}

async function fetchViaScraperApi(targetUrl, opts = {}) {
  const key = env('SCRAPERAPI_KEY');
  if (!key) {
    const error = new Error('missing_SCRAPERAPI_KEY');
    error.code = 'MISSING_SCRAPERAPI_KEY';
    throw error;
  }
  const proxy = new URL(SCRAPER_API_URL);
  proxy.searchParams.set('api_key', key);
  proxy.searchParams.set('url', targetUrl);
  proxy.searchParams.set('country_code', 'mx');
  proxy.searchParams.set('render', opts.render ? 'true' : 'false');
  const { controller, done } = withTimeout(opts.timeoutMs || 30000);
  try {
    const response = await fetch(proxy, {
      signal: controller.signal,
      headers: { Accept: 'text/html,application/xhtml+xml' }
    });
    if (!response.ok) throw new Error(`scraperapi_${response.status}`);
    return { html: await response.text(), finalUrl: targetUrl };
  } finally {
    done();
  }
}

async function fetchDirect(targetUrl, opts = {}) {
  const { controller, done } = withTimeout(opts.timeoutMs || 12000);
  try {
    const response = await fetch(targetUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': TIXUZBOT_UA
      }
    });
    if (!response.ok) throw new Error(`seminuevos_direct_${response.status}`);
    const html = await response.text();
    if (html.length < 1000) throw new Error('seminuevos_direct_empty');
    return { html, finalUrl: response.url || targetUrl, method: 'direct' };
  } finally {
    done();
  }
}

async function fetchPublicHtml(targetUrl, opts = {}) {
  try {
    return await fetchDirect(targetUrl, opts);
  } catch (directError) {
    if (!env('SCRAPERAPI_KEY')) throw directError;
    try {
      return await fetchViaScraperApi(targetUrl, opts);
    } catch (proxyError) {
      throw new Error(`${directError.message || directError};${proxyError.message || proxyError}`);
    }
  }
}

function sellerFromHtml(html) {
  const dealer = cleanText(String(html || '').match(/\/dealers-profile\/[^"']+["'][\s\S]{0,900}?<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || '');
  if (dealer) return { seller_name: dealer, seller_type: 'dealer' };
  const particular = /\bparticular\b/i.test(String(html || '')) ? 'particular' : null;
  return { seller_name: null, seller_type: normalizeSellerType(particular) };
}

function parseListingHtml(html, url, fallback = {}) {
  const listingUrl = cleanUrl(url);
  const vehicle = vehicleJsonLdFromHtml(html);
  const offer = schemaOffer(vehicle);
  const address = schemaAddress(vehicle);
  const schemaSeller = offer.seller || vehicle?.seller || {};
  const title = cleanText(
    vehicle?.name
    || String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    || metaContent(html, 'og:title')
    || fallback.title
  );
  const description = metaContent(html, 'description') || fallback.snippet || null;
  const version = cleanText(vehicle?.vehicleConfiguration || labelValue(html, 'Versi\u00f3n') || labelValue(html, 'Version'));
  const transmission = normalizeTransmission(vehicle?.vehicleTransmission || labelValue(html, 'Transmisi\u00f3n') || labelValue(html, 'Transmision'));
  const city = normalizeCity(address.addressLocality || labelValue(html, 'Ciudad') || fallback.city || fallback.ubicacion || cityFromVehicleUrl(listingUrl, fallback.marca, fallback.modelo));
  const state = normalizeState(
    address.addressRegion
    || fallback.state
    || String(description || '').match(/\ben\s+(.+?)\.\s*Precio\s*:/i)?.[1]
  );
  const price = integerOrNull(offer.price || vehicle?.price || labelValue(html, 'Precio contado') || String(description || '').match(/Precio\s*:\s*\$\s*([\d,.]+)/i)?.[1]);
  const mileage = integerOrNull(vehicle?.mileageFromOdometer?.value || vehicle?.mileageFromOdometer || labelValue(html, 'Recorrido') || labelValue(html, 'Kilometraje'));
  const schemaImages = schemaImageUrls(vehicle)
    .map(image => validHttpUrl(image, ['images.latamautos.com']))
    .filter(image => image && isListingImage(listingUrl, image));
  const images = [...new Set([...schemaImages, ...listingImages(html, listingUrl)])];
  const htmlSeller = sellerFromHtml(html);
  const sellerName = schemaName(schemaSeller) || htmlSeller.seller_name;
  const sellerType = normalizeSellerType(schemaSeller['@type']) || htmlSeller.seller_type;
  const make = cleanText(schemaName(vehicle?.brand) || labelValue(html, 'Marca') || fallback.marca);
  const model = cleanText(schemaName(vehicle?.model) || labelValue(html, 'Modelo') || fallback.modelo);
  const year = yearOrNull(vehicle?.vehicleModelDate || vehicle?.productionDate || labelValue(html, 'A\u00f1o') || title || listingUrl);

  return {
    id: vehicleIdFromUrl(listingUrl),
    url: listingUrl,
    title,
    description,
    marca: make,
    modelo: model,
    version,
    transmission,
    anio: year,
    precio: price,
    km: mileage,
    city,
    state,
    ubicacion: [city, state].filter(Boolean).join(', ') || null,
    seller_name: sellerName,
    seller_type: sellerType,
    published_at: isoDateOrNull(vehicle?.datePosted || vehicle?.datePublished || vehicle?.dateCreated) || absoluteDateFromHtml(html),
    image_url: images[0] || null,
    thumbnail_url: images[0] || null,
    image_verified: Boolean(images[0]),
    image_source: images[0] ? (schemaImages.includes(images[0]) ? 'listing_jsonld' : 'listing_html') : null,
    images: images.map(image => ({ url: image, source: schemaImages.includes(image) ? 'listing_jsonld' : 'listing_html' })),
    portal: 'Seminuevos',
    fuente_portal: 'Seminuevos'
  };
}

async function extractListing(url, opts = {}) {
  const clean = cleanUrl(url);
  if (!isSeminuevosVehicleUrl(clean)) {
    return { url: clean || url, id: vehicleIdFromUrl(url), image_url: null, thumbnail_url: null, images: [], error: 'not_seminuevos_vehicle' };
  }
  try {
    const { html } = await fetchPublicHtml(clean, { timeoutMs: opts.timeoutMs || 12000 });
    if (/veh[i\u00ed]culo\s+ya\s+est[a\u00e1]\s+en\s+manos|veh[i\u00ed]culo\s+no\s+disponible/i.test(html)) {
      return { url: clean, id: vehicleIdFromUrl(clean), image_url: null, thumbnail_url: null, images: [], error: 'listing_unavailable' };
    }
    return parseListingHtml(html.slice(0, opts.maxChars || 1200000), clean, opts.fallback || {});
  } catch (error) {
    return { url: clean, id: vehicleIdFromUrl(clean), image_url: null, thumbnail_url: null, images: [], error: error.message || String(error) };
  }
}

function candidatesFromSearchHtml(html, marca, modelo, limit) {
  const seen = new Set();
  const out = [];
  const re = /href=["']([^"']*\/vehicle\/[^"'?#]+\/\d+(?:\/)?)["']/gi;
  const sourceHtml = String(html || '');
  for (const match of sourceHtml.matchAll(re)) {
    const url = cleanUrl(match[1]);
    const id = vehicleIdFromUrl(url);
    if (!id || seen.has(id) || !isSeminuevosVehicleUrl(url)) continue;
    const blockStart = sourceHtml.lastIndexOf('<div class="group block"', match.index);
    const nextBlock = sourceHtml.indexOf('<div class="group block"', match.index + match[0].length);
    const block = sourceHtml.slice(Math.max(0, blockStart), nextBlock > match.index ? nextBlock : match.index + 9000);
    const imageRaw = block.match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i)?.[1]
      || block.match(/<source\b[^>]*\bsrcSet=["']([^"']+)["'][^>]*>/i)?.[1]
      || null;
    const image = imageRaw ? decodeHtml(imageRaw).replace(/\?format=webp$/i, '') : null;
    const cardCity = cleanText(block.match(/class=["'][^"']*\btruncate\b[^"']*["'][^>]*>([^<]+)</i)?.[1] || '');
    const year = yearOrNull(block.match(/aria-label=["']Ver\s+[^"']*\b((?:19|20)\d{2})["']/i)?.[1] || block);
    const price = integerOrNull(block.match(/\$\s*([\d,.]{5,})/i)?.[1]);
    const mileage = integerOrNull(block.match(/<span>\s*([\d,.]+)\s*km\s*<\/span>/i)?.[1]);
    const transmission = normalizeTransmission(block.match(/<span>\s*(Autom[aá]tica|Manual|CVT|DSG|Tiptronic)\s*<\/span>/i)?.[1]);
    seen.add(id);
    out.push({
      id,
      url,
      title: [marca, modelo, year].filter(Boolean).join(' '),
      marca,
      modelo,
      anio: year,
      precio: price,
      km: mileage,
      transmission,
      city: normalizeCity(cardCity || cityFromVehicleUrl(url, marca, modelo)),
      image_url: image && isListingImage(url, image) ? image : null,
      thumbnail_url: image && isListingImage(url, image) ? image : null,
      image_verified: Boolean(image && isListingImage(url, image)),
      image_source: image && isListingImage(url, image) ? 'listing_card' : null,
      portal: 'Seminuevos'
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function discover(marca, modelo, ciudad = '', opts = {}) {
  if (!marca || !modelo) return [];
  const location = ciudad ? slugify(ciudad) : '-';
  const searchUrl = `${BASE_URL}/usados/${location}/autos/-/${slugify(marca)}/${slugify(modelo)}`;
  const { html } = await fetchPublicHtml(searchUrl, { timeoutMs: opts.timeoutMs || 12000 });
  return candidatesFromSearchHtml(html, marca, modelo, opts.limit || 8);
}

module.exports = {
  candidatesFromSearchHtml,
  cityFromVehicleUrl,
  discover,
  extractListing,
  fetchDirect,
  fetchPublicHtml,
  fetchViaScraperApi,
  isListingImage,
  isSeminuevosVehicleUrl,
  normText,
  parseListingHtml,
  slugify,
  vehicleIdFromUrl
};
