// ============================================================
// nissan-discover.cjs
// Descubre unidades de Nissan Seminuevos desde __NEXT_DATA__.
// No usa navegador headless; solo HTML inicial renderizado por servidor.
// ============================================================

const BASE_URL = 'https://seminuevos.nissan.com.mx';
const INVENTORY_PATH = '/all-vehicles/inventory';
const HOME_URL = `${BASE_URL}/landing/home`;

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, done: () => clearTimeout(timer) };
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/\\u002F/g, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value) {
  return normText(value).replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function numberFromValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function cleanUrl(url) {
  try {
    const parsed = new URL(decodeHtml(url), BASE_URL);
    parsed.hash = '';
    return parsed.href;
  } catch (_) {
    return '';
  }
}

function nissanIdFromUrl(url) {
  try {
    const parsed = new URL(url, BASE_URL);
    return parsed.searchParams.get('vehicleSku')
      || parsed.searchParams.get('vehiclesku')
      || parsed.searchParams.get('sku')
      || parsed.searchParams.get('vin')
      || null;
  } catch (_) {
    return null;
  }
}

function isNissanVehicleUrl(url) {
  try {
    const parsed = new URL(url, BASE_URL);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    return /(^|\.)seminuevos\.nissan\.com\.mx$/.test(host)
      && parsed.pathname === INVENTORY_PATH
      && Boolean(nissanIdFromUrl(parsed.href));
  } catch (_) {
    return false;
  }
}

function inventoryUrl(modelo = '', vehicle = {}) {
  const params = new URLSearchParams({
    make: 'nissan',
    models: slugify(modelo || vehicle.modelName || ''),
    parentfilter: 'queryfilters'
  });
  const sku = vehicle.vehiclesku || vehicle.vehicleSku || vehicle.vin || '';
  if (sku) params.set('vehicleSku', sku);
  if (vehicle.vin) params.set('vin', vehicle.vin);
  return `${BASE_URL}${INVENTORY_PATH}?${params.toString()}`;
}

function inventorySearchUrl(modelo = '') {
  const params = new URLSearchParams({
    make: 'nissan',
    models: slugify(modelo || ''),
    parentfilter: 'queryfilters'
  });
  return `${BASE_URL}${INVENTORY_PATH}?${params.toString()}`;
}

function normalizeImageUrl(raw) {
  const url = cleanUrl(raw);
  if (!/^https?:\/\//i.test(url)) return null;
  if (!/media-assets\.nissanpace\.com/i.test(url)) return null;
  if (/logo|placeholder|default|sprite|no-image|not-available/i.test(url)) return null;
  return url;
}

async function fetchHtml(url, timeoutMs = 12000) {
  const { controller, done } = withTimeout(timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml'
      }
    });
    if (!res.ok) throw new Error(`fetch_${res.status}`);
    return { html: await res.text(), finalUrl: res.url || url };
  } finally {
    done();
  }
}

function extractNextData(html) {
  const raw = html.match(/<script id=["']__NEXT_DATA__["'] type=["']application\/json["']>([\s\S]*?)<\/script>/i)?.[1];
  if (!raw) return null;
  try {
    return JSON.parse(decodeHtml(raw));
  } catch (_) {
    try { return JSON.parse(raw); } catch (err) { return null; }
  }
}

function collectVehicles(root) {
  const out = [];
  const seen = new Set();
  function walk(value) {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && value.__typename === 'Vehicle') {
      const id = value.vehiclesku || value.vehicleSku || value.vin;
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(value);
      }
    }
    if (Array.isArray(value)) value.forEach(walk);
    else Object.values(value).forEach(walk);
  }
  walk(root);
  return out;
}

function parseNissanPage(html) {
  const data = extractNextData(html);
  return data ? collectVehicles(data) : [];
}

function vehicleToListing(vehicle, fallback = {}) {
  const image = normalizeImageUrl(vehicle.thumbnailUrl);
  const modelo = vehicle.modelName || fallback.modelo || '';
  const marca = vehicle.make || fallback.marca || 'Nissan';
  const year = numberFromValue(vehicle.modelYear || vehicle.registrationYear);
  const price = numberFromValue(vehicle.discountedPrice || vehicle.rrpPrice);
  const km = numberFromValue(vehicle.mileage);
  const dealer = vehicle.dealer?.dealerName || '';
  const color = vehicle.color?.exteriorBaseColor || '';
  const version = vehicle.version || vehicle.grade || vehicle.shortVersion || '';
  const sku = vehicle.vehiclesku || vehicle.vehicleSku || vehicle.vin || '';

  return {
    id: sku,
    url: inventoryUrl(modelo, vehicle),
    title: [marca, modelo, year, version].filter(Boolean).join(' '),
    marca,
    modelo,
    version,
    anio: year,
    precio: price,
    km,
    ubicacion: dealer,
    portal: 'Nissan Seminuevos',
    fuente_portal: 'Nissan Seminuevos',
    thumbnail_url: image,
    image_source: image ? 'api' : null,
    color,
    vin: vehicle.vin || ''
  };
}

function modelMatches(vehicle, modelo) {
  const wanted = normText(modelo);
  if (!wanted) return true;
  const found = normText(vehicle.modelName || '');
  return found === wanted || found.includes(wanted) || wanted.includes(found);
}

async function discover(marca, modelo, ciudad = '', opts = {}) {
  if (!modelo) return [];
  if (marca && !/nissan/i.test(normText(marca))) return [];
  const limit = opts.limit || 10;
  const url = inventorySearchUrl(modelo);
  try {
    const { html } = await fetchHtml(url, opts.timeoutMs || 14000);
    const vehicles = parseNissanPage(html)
      .filter(vehicle => modelMatches(vehicle, modelo))
      .map(vehicle => vehicleToListing(vehicle, { marca: 'Nissan', modelo }))
      .filter(item => item.id && item.url && item.thumbnail_url);
    const seen = new Set();
    return vehicles.filter(item => {
      const key = item.id || item.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, limit);
  } catch (_) {
    return [];
  }
}

async function extractListing(url, opts = {}) {
  const clean = cleanUrl(url);
  if (!isNissanVehicleUrl(clean)) {
    return { url: clean || url, id: nissanIdFromUrl(url), images: [], error: 'not_nissan_vehicle' };
  }

  const id = nissanIdFromUrl(clean);
  let model = '';
  try { model = new URL(clean).searchParams.get('models') || ''; } catch (_) {}
  const searchUrl = model ? inventorySearchUrl(model) : HOME_URL;

  try {
    const { html } = await fetchHtml(searchUrl, opts.timeoutMs || 12000);
    const vehicle = parseNissanPage(html).find(item =>
      item.vehiclesku === id || item.vehicleSku === id || item.vin === id
    );
    if (!vehicle) return { url: clean, id, images: [], error: 'nissan_vehicle_not_found' };

    const listing = vehicleToListing(vehicle, { marca: 'Nissan', modelo: model });
    return {
      ...listing,
      url: clean,
      images: listing.thumbnail_url ? [{ url: listing.thumbnail_url, source: 'api' }] : []
    };
  } catch (err) {
    return { url: clean, id, images: [], error: err.message || String(err) };
  }
}

module.exports = {
  discover,
  extractListing,
  nissanIdFromUrl,
  isNissanVehicleUrl,
  slugify,
  normText
};
