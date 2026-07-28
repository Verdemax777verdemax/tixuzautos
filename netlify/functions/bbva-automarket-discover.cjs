const fs = require('fs');
const path = require('path');
const { createHmac, timingSafeEqual } = require('node:crypto');
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

const BASE_URL = 'https://automarket.bbva.mx';
const MAX_LIMIT = 5;
let puppeteerPromise = null;
let chromiumPromise = null;
const PRODUCT_QUERY = `
  query TixuzAutomarket($search: String!, $pageSize: Int!) {
    products(search: $search, pageSize: $pageSize, currentPage: 1) {
      total_count
      items {
        id uid name sku url_key stock_status vehicle_verified
        small_image { url }
        price_range { maximum_price { final_price { value currency } } }
        showroom_details { name state }
        custom_attributes {
          attribute_metadata { code label }
          entered_attribute_value { value }
          selected_attribute_options {
            attribute_option { label ... on AttributeOption { value } }
          }
        }
      }
    }
  }`;

function normKey(value) {
  return String(value || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function localChromePath() {
  const candidates = [
    process.env.BBVA_CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.platform === 'win32' ? path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
    process.platform === 'win32' ? path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
    process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe') : null
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

async function executablePath(chromium) {
  return localChromePath() || chromium.executablePath();
}

async function getPuppeteer() {
  if (!puppeteerPromise) {
    puppeteerPromise = import('puppeteer-core').then(module => module.default || module);
  }
  return puppeteerPromise;
}

async function getChromium() {
  if (!chromiumPromise) {
    chromiumPromise = import('@sparticuz/chromium').then(module => module.default || module);
  }
  return chromiumPromise;
}

function attributeValue(product, code) {
  const row = (product?.custom_attributes || []).find(item => item?.attribute_metadata?.code === code);
  const option = row?.selected_attribute_options?.attribute_option;
  const first = Array.isArray(option) ? option[0] : option;
  return cleanText(row?.entered_attribute_value?.value || first?.label || '');
}

function cityForShowroom(showroom, state) {
  const key = normKey(showroom);
  if (/patriotismo|gran sur|torre bbva/.test(key)) return 'Ciudad de México';
  if (/satelite/.test(key)) return 'Naucalpan de Juárez';
  if (/metepec/.test(key)) return 'Metepec';
  if (/interlomas/.test(key)) return 'Huixquilucan';
  if (/puebla/.test(key)) return 'Puebla';
  if (/cuernavaca/.test(key)) return 'Cuernavaca';
  const stateKey = normKey(state);
  if (stateKey.includes('ciudad de mexico')) return 'Ciudad de México';
  if (stateKey.includes('puebla')) return 'Puebla';
  if (stateKey.includes('morelos')) return 'Cuernavaca';
  return normalizeCity(showroom);
}

function sourceUrl(product) {
  const key = cleanText(product?.url_key).replace(/^\/+|\/+$/g, '');
  return key ? `${BASE_URL}/${key}.html` : null;
}

function automarketIdFromUrl(value) {
  try {
    const url = new URL(value, BASE_URL);
    if (url.hostname !== 'automarket.bbva.mx') return null;
    return url.pathname.split('/').filter(Boolean).pop()?.replace(/\.html$/i, '') || null;
  } catch (_) {
    return null;
  }
}

function isAutomarketVehicleUrl(value) {
  try {
    const url = new URL(value, BASE_URL);
    return url.hostname === 'automarket.bbva.mx'
      && /-[a-z0-9]+-[a-z0-9]+\.html$/i.test(url.pathname)
      && !url.pathname.startsWith('/seminuevos/');
  } catch (_) {
    return false;
  }
}

function mapProduct(product, detail = {}) {
  const make = attributeValue(product, 'brand') || cleanText(product?.name).split(/\s+/)[0];
  const model = attributeValue(product, 'model');
  const version = attributeValue(product, 'version');
  const year = yearOrNull(attributeValue(product, 'year') || attributeValue(product, 'year_filter') || product?.name);
  const mileage = integerOrNull(attributeValue(product, 'km'));
  const price = integerOrNull(product?.price_range?.maximum_price?.final_price?.value);
  const showroom = cleanText(product?.showroom_details?.name || attributeValue(product, 'showroom_effective') || attributeValue(product, 'showroom'));
  let state = normalizeState(product?.showroom_details?.state);
  if (normKey(state) === 'edo de mexico') state = 'Estado de México';
  const city = normalizeCity(cityForShowroom(showroom, state));
  const image = validHttpUrl(product?.small_image?.url, ['automarket.bbva.mx']);
  const url = sourceUrl(product);
  const publishedRaw = attributeValue(product, 'published_at');
  const publishedAt = isoDateOrNull(publishedRaw ? publishedRaw.replace(' ', 'T') + 'Z' : null);
  return {
    id: cleanText(product?.sku || product?.id || automarketIdFromUrl(url)),
    external_id: cleanText(product?.sku || product?.id),
    url,
    source_url: url,
    title: cleanText(product?.name),
    marca: make,
    make,
    modelo: model,
    model,
    version,
    transmission: normalizeTransmission(attributeValue(product, 'transmission')),
    anio: year,
    year,
    precio: price,
    price_mxn: price,
    km: mileage,
    mileage_km: mileage,
    city,
    state,
    ubicacion: [city, state].filter(Boolean).join(', ') || null,
    location: [city, state].filter(Boolean).join(', ') || null,
    seller_name: showroom || 'BBVA AutoMarket',
    seller_type: normalizeSellerType('agencia'),
    published_at: publishedAt,
    image_url: image,
    thumbnail_url: image,
    image_verified: Boolean(image),
    image_source: image ? 'automarket_graphql' : null,
    images: image ? [{ url: image, source: 'automarket_graphql' }] : [],
    vehicle_verified: Boolean(product?.vehicle_verified),
    stock_status: product?.stock_status || null,
    detail_verified: Boolean(detail.verified),
    detail_title: detail.title || null,
    discovery_method: 'puppeteer_venia_graphql_detail',
    portal: 'BBVA AutoMarket',
    fuente_portal: 'BBVA AutoMarket'
  };
}

async function discover(marca, modelo, ciudad = '', options = {}) {
  const search = [marca, modelo].filter(Boolean).join(' ').trim();
  if (!search) return [];
  const limit = Math.min(Math.max(Number(options.limit) || 2, 1), MAX_LIMIT);
  const [puppeteer, chromium] = await Promise.all([getPuppeteer(), getChromium()]);
  const browser = await puppeteer.launch({
    args: [...chromium.args, '--disable-dev-shm-usage'],
    defaultViewport: { width: 1365, height: 900 },
    executablePath: await executablePath(chromium),
    headless: true,
    timeout: options.launchTimeoutMs || 30000
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36 TixuzBot/1.0');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs || 30000 });
    const payload = await page.evaluate(async ({ query, variables }) => {
      const response = await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Store: 'default' },
        body: JSON.stringify({ query, variables })
      });
      if (!response.ok) throw new Error(`graphql_${response.status}`);
      return response.json();
    }, { query: PRODUCT_QUERY, variables: { search, pageSize: Math.min(limit * 4, 20) } });
    if (payload.errors?.length) throw new Error(`automarket_graphql:${payload.errors[0].message}`);
    const products = payload.data?.products?.items || [];
    const intent = [marca, modelo].map(normKey).filter(Boolean);
    const candidates = products.filter(product => {
      const haystack = normKey(`${product.name} ${attributeValue(product, 'brand')} ${attributeValue(product, 'model')}`);
      return intent.every(term => haystack.includes(term));
    }).slice(0, limit);
    const out = [];
    for (const product of candidates) {
      const url = sourceUrl(product);
      let detail = { verified: false, title: null };
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs || 30000 });
        await page.waitForFunction(name => document.body?.innerText?.toUpperCase().includes(String(name).toUpperCase()), {
          timeout: options.detailTimeoutMs || 12000
        }, product.name);
        detail = await page.evaluate(name => ({
          verified: document.body?.innerText?.toUpperCase().includes(String(name).toUpperCase()) || false,
          title: document.title || null
        }), product.name);
      } catch (_) {
        // A catalog item is only accepted when the corresponding SPA detail renders.
      }
      const listing = mapProduct(product, detail);
      if (!detail.verified || !isAutomarketVehicleUrl(listing.url)) continue;
      if (!listing.image_verified || !listing.price_mxn || !listing.mileage_km || !listing.city || !listing.state) continue;
      if (ciudad && !normKey(listing.ubicacion).includes(normKey(ciudad))) continue;
      out.push(listing);
    }
    return out;
  } finally {
    await browser.close();
  }
}

function env(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || '';
}

function authorized(headers = {}) {
  const secret = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SERVICE_KEY');
  if (!secret) return false;
  const expected = createHmac('sha256', secret).update('tixuz-bbva-automarket-v1').digest('hex');
  const actual = headers['x-tixuz-automarket-token'] || headers['X-Tixuz-Automarket-Token'] || '';
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

async function handler(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  if (!authorized(event.headers || {})) return { statusCode: 401, body: 'Unauthorized' };
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return { statusCode: 400, body: 'Invalid JSON' }; }
  try {
    const cars = await discover(body.marca, body.modelo, body.ciudad || '', {
      limit: body.limit,
      timeoutMs: 30000,
      detailTimeoutMs: 12000,
      launchTimeoutMs: 30000
    });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, count: cars.length, cars })
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(error.message || error).slice(0, 300) })
    };
  }
}

module.exports = {
  PRODUCT_QUERY,
  attributeValue,
  automarketIdFromUrl,
  cityForShowroom,
  discover,
  isAutomarketVehicleUrl,
  mapProduct,
  sourceUrl,
  handler
};
