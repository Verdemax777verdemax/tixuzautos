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
  stripTags,
  validHttpUrl,
  vehicleJsonLdFromHtml,
  yearOrNull
} = require('./lib/listing-normalize.cjs');

const BASE_URL = 'https://www.autocosmos.com.mx';
const IMAGE_HOSTS = ['acroadtrip.blob.core.windows.net'];
const PROVINCE_IDS = new Map(Object.entries({
  aguascalientes: '241',
  hidalgo: '248',
  michoacan: '255',
  oaxaca: '257',
  puebla: '252',
  sinaloa: '234',
  sonora: '232',
  tamaulipas: '243'
}));

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, done: () => clearTimeout(timer) };
}

function normText(value) {
  return String(value || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function slugify(value) {
  return normText(value).replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function provinceIdForState(value) {
  return PROVINCE_IDS.get(normText(value).replace(/\s+/g, '')) || null;
}

function buildSearchUrl(marca, modelo, options = {}) {
  const url = new URL(`${BASE_URL}/auto/usado/${slugify(marca)}/${slugify(modelo)}`);
  const state = normalizeState(options.estado || options.state);
  if (state) {
    const provinceId = provinceIdForState(state);
    if (!provinceId) throw new Error(`autocosmos_state_filter_unsupported:${state}`);
    url.searchParams.set('pr', provinceId);
  }
  if (Number(options.page) > 1) url.searchParams.set('pidx', String(options.page));
  return url.href;
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

function autocosmosIdFromUrl(value) {
  try {
    return decodeURIComponent(new URL(value, BASE_URL).pathname)
      .match(/\/auto\/usado\/[^/]+\/[^/]+\/[^/]+\/([a-f0-9]{32})(?:\/)?$/i)?.[1] || null;
  } catch (_) {
    return null;
  }
}

function isAutocosmosVehicleUrl(value) {
  try {
    const url = new URL(value, BASE_URL);
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    return /(^|\.)autocosmos\.com\.mx$/.test(host)
      && /\/auto\/usado\/[^/]+\/[^/]+\/[^/]+\/[a-f0-9]{32}(?:\/)?$/i.test(url.pathname);
  } catch (_) {
    return false;
  }
}

function matchAttr(html, attr) {
  const escaped = String(attr).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return cleanText(String(html || '').match(new RegExp(`${escaped}=["']([^"']+)["']`, 'i'))?.[1] || '');
}

function textByClass(html, className) {
  const escaped = String(className).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(html || '').match(new RegExp(`<[^>]+class=["'][^"']*${escaped}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i'));
  return cleanText(match?.[1] || '');
}

function normalizeImageUrl(raw) {
  const image = validHttpUrl(raw, IMAGE_HOSTS);
  return image ? image.replace('/Small/', '/Large/').replace('/Medium/', '/Large/') : null;
}

function imageFromCard(card) {
  const raw = String(card || '').match(/<img[^>]+itemprop=["']image["'][^>]*(?:content|src)=["']([^"']+)["'][^>]*>/i)?.[1]
    || String(card || '').match(/<img[^>]+(?:content|src)=["']([^"']+)["'][^>]*itemprop=["']image["'][^>]*>/i)?.[1];
  return normalizeImageUrl(raw);
}

function transmissionFromText(value) {
  const text = cleanText(value);
  if (!text || !/\b(cvt|continuamente variable|autom[a\u00e1]tic[oa]?|auto|aut|at|dsg|tiptronic|manual|mt|est[a\u00e1]ndar|standard)\b/i.test(text)) return null;
  return normalizeTransmission(text);
}

function cityStateFromCard(card) {
  return {
    city: normalizeCity((textByClass(card, 'listing-card__city') || '').replace(/\|\s*$/, '')),
    state: normalizeState(textByClass(card, 'listing-card__province'))
  };
}

function parseCard(card, pageUrl, fallback = {}) {
  const anchor = String(card || '').match(/<a[^>]+itemprop=["']url["'][^>]*>/i)?.[0] || '';
  const url = cleanUrl(matchAttr(anchor, 'href') || pageUrl);
  if (!isAutocosmosVehicleUrl(url)) return null;
  const title = matchAttr(anchor, 'title')
    || matchAttr(String(card || '').match(/<meta[^>]+itemprop=["']description["'][^>]*>/i)?.[0] || '', 'content');
  if (/financiado|mensualidades|enganche/i.test(title || '')) return null;
  const marca = textByClass(card, 'listing-card__brand') || fallback.marca || null;
  const modelo = textByClass(card, 'listing-card__model') || fallback.modelo || null;
  const version = textByClass(card, 'listing-card__version');
  const transmission = transmissionFromText(version);
  const location = cityStateFromCard(card);
  const image = imageFromCard(card);
  const priceRaw = matchAttr(String(card || '').match(/<span[^>]+itemprop=["']price["'][^>]*>/i)?.[0] || '', 'content')
    || textByClass(card, 'listing-card__price-value')
    || title;

  return {
    id: autocosmosIdFromUrl(url),
    url,
    title,
    marca,
    modelo,
    version,
    transmission,
    anio: yearOrNull(textByClass(card, 'listing-card__year') || title),
    precio: integerOrNull(priceRaw),
    km: integerOrNull(textByClass(card, 'listing-card__km') || matchAttr(String(card || '').match(/<span[^>]+class=["'][^"']*listing-card__km[^"']*["'][^>]*>/i)?.[0] || '', 'content')),
    city: location.city,
    state: location.state,
    ubicacion: [location.city, location.state].filter(Boolean).join(', ') || null,
    seller_name: null,
    seller_type: null,
    published_at: null,
    image_url: image,
    thumbnail_url: image,
    image_verified: Boolean(image),
    image_source: image ? 'listing_card' : null,
    portal: 'AutoCosmos',
    fuente_portal: 'AutoCosmos'
  };
}

function extractCards(html, pageUrl, fallback = {}) {
  const out = [];
  const seen = new Set();
  const re = /<article\b[^>]*class=["'][^"']*listing-card[^"']*["'][\s\S]*?<\/article>/gi;
  for (const match of String(html || '').matchAll(re)) {
    const item = parseCard(match[0], pageUrl, fallback);
    const key = item?.id || item?.url;
    if (!item || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function fetchHtml(url, timeoutMs = 12000) {
  const { controller, done } = withTimeout(timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'TixuzBot/1.0 (+https://tixuzautos.com/bot; contacto: bot@tixuzautos.com)',
        Accept: 'text/html,application/xhtml+xml'
      }
    });
    if (!response.ok) throw new Error(`fetch_${response.status}`);
    return { html: await response.text(), finalUrl: response.url || url };
  } finally {
    done();
  }
}

function itemPropText(html, prop) {
  const escaped = String(prop).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<[^>]+itemprop=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<[^>]+itemprop=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i')
  ];
  for (const pattern of patterns) {
    const value = cleanText(String(html || '').match(pattern)?.[1] || '');
    if (value) return value;
  }
  return null;
}

function sellerFromDetail(html, description) {
  const section = String(html || '').match(/<div[^>]+class=["'][^"']*seller-name-container[^"']*["'][^>]*>[\s\S]{0,1500}?<strong>([\s\S]*?)<\/strong>/i)?.[1];
  const fromDescription = String(description || '').match(/En venta por\s+(.+?)\s*$/i)?.[1];
  const name = cleanText(section || fromDescription || '');
  const kind = metaContent(html, 'dfp_privado');
  return { seller_name: name, seller_type: normalizeSellerType(kind) };
}

function totalPriceFromDetail(html, vehicle, title) {
  const offer = schemaOffer(vehicle);
  const schemaPrice = integerOrNull(offer.price || vehicle?.price);
  if (schemaPrice !== null) return schemaPrice;
  const itemPrice = integerOrNull(itemPropText(html, 'price'));
  if (itemPrice !== null) return itemPrice;
  const titlePrice = String(title || '').match(/\bprecio\s*(?:total|de contado|contado)?\s*\$\s*([\d,.]+)/i)?.[1];
  return integerOrNull(titlePrice);
}

function parseDetail(html, url, fallback = {}) {
  const listingUrl = cleanUrl(url);
  const path = new URL(listingUrl, BASE_URL).pathname.split('/').filter(Boolean);
  const vehicle = vehicleJsonLdFromHtml(html);
  const offer = schemaOffer(vehicle);
  const address = schemaAddress(vehicle);
  const schemaSeller = offer.seller || vehicle?.seller || {};
  const title = cleanText(vehicle?.name)
    || metaContent(html, 'og:title')
    || cleanText(String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1])
    || fallback.title
    || null;
  const description = metaContent(html, 'og:description') || metaContent(html, 'description');
  const city = normalizeCity(address.addressLocality || itemPropText(html, 'addressLocality') || metaContent(html, 'dfp_city') || fallback.city);
  const state = normalizeState(address.addressRegion || itemPropText(html, 'addressRegion') || metaContent(html, 'dfp_region') || fallback.state);
  const htmlSeller = sellerFromDetail(html, description);
  const seller = {
    seller_name: schemaName(schemaSeller) || htmlSeller.seller_name,
    seller_type: normalizeSellerType(schemaSeller['@type']) || htmlSeller.seller_type
  };
  const schemaImage = schemaImageUrls(vehicle).map(normalizeImageUrl).find(Boolean) || null;
  const image = schemaImage || normalizeImageUrl(metaContent(html, 'og:image'));
  const version = cleanText(vehicle?.vehicleConfiguration || metaContent(html, 'dfp_version') || fallback.version || path[4]);
  const transmission = transmissionFromText(
    vehicle?.vehicleTransmission
    || itemPropText(html, 'vehicleTransmission')
    || labelValue(html, 'Transmisi\u00f3n')
    || labelValue(html, 'Transmision')
    || fallback.transmission
    || version
  );

  return {
    id: autocosmosIdFromUrl(listingUrl),
    url: listingUrl,
    title,
    description,
    marca: cleanText(schemaName(vehicle?.brand) || fallback.marca || metaContent(html, 'dfp_marca') || path[2]),
    modelo: cleanText(schemaName(vehicle?.model) || fallback.modelo || metaContent(html, 'dfp_modelo') || path[3]),
    version,
    transmission,
    anio: yearOrNull(vehicle?.vehicleModelDate || vehicle?.productionDate || metaContent(html, 'dfp_anio') || title || fallback.anio),
    precio: totalPriceFromDetail(html, vehicle, title),
    km: integerOrNull(vehicle?.mileageFromOdometer?.value || vehicle?.mileageFromOdometer || itemPropText(html, 'mileageFromOdometer') || fallback.km),
    city,
    state,
    ubicacion: [city, state].filter(Boolean).join(', ') || null,
    seller_name: seller.seller_name,
    seller_type: seller.seller_type,
    published_at: isoDateOrNull(vehicle?.datePosted || vehicle?.datePublished || vehicle?.dateCreated) || absoluteDateFromHtml(html),
    image_url: image,
    thumbnail_url: image,
    image_verified: Boolean(image),
    image_source: image ? (schemaImage ? 'listing_jsonld' : 'og_image') : null,
    images: image ? [{ url: image, source: schemaImage ? 'listing_jsonld' : 'og_image' }] : [],
    portal: 'AutoCosmos',
    fuente_portal: 'AutoCosmos'
  };
}

async function extractListing(url, opts = {}) {
  const clean = cleanUrl(url);
  if (!isAutocosmosVehicleUrl(clean)) {
    return { url: clean || url, id: autocosmosIdFromUrl(url), image_url: null, thumbnail_url: null, images: [], error: 'not_autocosmos_vehicle' };
  }
  try {
    const { html, finalUrl } = await fetchHtml(clean, opts.timeoutMs || 12000);
    return parseDetail(html.slice(0, opts.maxChars || 900000), finalUrl, opts.fallback || {});
  } catch (error) {
    return { url: clean, id: autocosmosIdFromUrl(clean), image_url: null, thumbnail_url: null, images: [], error: error.message || String(error) };
  }
}

async function discover(marca, modelo, ciudad = '', opts = {}) {
  if (!marca || !modelo) return [];
  const state = normalizeState(opts.estado || opts.state);
  const provinceId = state ? provinceIdForState(state) : null;
  if (state && !provinceId) throw new Error(`autocosmos_state_filter_unsupported:${state}`);
  const pages = Math.min(Math.max(opts.pages || 1, 1), 2);
  const limit = Math.min(Math.max(opts.limit || 8, 1), 20);
  const out = [];
  const seen = new Set();
  for (let page = 1; page <= pages && out.length < limit; page++) {
    const url = buildSearchUrl(marca, modelo, { estado: state, page });
    try {
      const { html, finalUrl } = await fetchHtml(url, opts.timeoutMs || 12000);
      for (const item of extractCards(html, finalUrl, { marca, modelo })) {
        if (seen.has(item.id)) continue;
        if (state && item.state && provinceIdForState(item.state) !== provinceId) continue;
        if (ciudad && !normText(item.ubicacion).includes(normText(ciudad))) continue;
        if (state && !item.state) {
          item.state = state;
          item.ubicacion = [item.city, state].filter(Boolean).join(', ') || null;
        }
        seen.add(item.id);
        out.push(item);
        if (out.length >= limit) break;
      }
    } catch (_) {
      // Source errors are reported by the caller; partial portal failures do not crash search.
    }
  }
  return out;
}

module.exports = {
  autocosmosIdFromUrl,
  buildSearchUrl,
  discover,
  extractCards,
  extractListing,
  isAutocosmosVehicleUrl,
  parseCard,
  parseDetail,
  provinceIdForState,
  slugify,
  totalPriceFromDetail
};
