// ============================================================
// gocar-discover.cjs
// Descubre unidades reales de Seminuevos Gocar desde HTML server-side.
// Sin dependencias; compatible con Netlify Functions CommonJS.
// ============================================================

const BASE_URL = 'https://seminuevosgocar.mx';
const LIST_URL = `${BASE_URL}/seminuevos`;

const BRANDS = [
  'Abarth', 'Acura', 'Alfa Romeo', 'Audi', 'BAIC', 'BMW', 'Buick', 'BYD',
  'Cadillac', 'Changan', 'Chirey', 'Chevrolet', 'Chrysler', 'Cupra', 'Dodge',
  'Fiat', 'Ford', 'GAC', 'GMC', 'Honda', 'Hyundai', 'Infiniti', 'Isuzu',
  'JAC', 'Jaecoo', 'Jaguar', 'Jeep', 'Kia', 'Land Rover', 'Lexus', 'Lincoln', 'Mazda',
  'Mercedes Benz', 'Mercedes-Benz', 'MG', 'Mini', 'Mitsubishi', 'Nissan',
  'Omoda', 'Peugeot', 'Porsche', 'RAM', 'Renault', 'SEAT', 'Stellantis',
  'Subaru', 'Suzuki', 'Toyota', 'Volkswagen', 'Volvo', 'VW'
];

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, done: () => clearTimeout(timer) };
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/\\u002F/g, '/')
    .replace(/\\\//g, '/')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function stripTags(value) {
  return decodeHtml(String(value || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function normText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanUrl(url, base = BASE_URL) {
  try {
    const parsed = new URL(decodeHtml(url), base);
    parsed.hash = '';
    parsed.search = '';
    return parsed.href.replace(/\/$/, '');
  } catch (_) {
    return '';
  }
}

function gocarIdFromUrl(url) {
  try {
    const parsed = new URL(url, BASE_URL);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'seminuevo') return null;
    return parts[2] || null;
  } catch (_) {
    return null;
  }
}

function isGocarVehicleUrl(url) {
  try {
    const parsed = new URL(url, BASE_URL);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const parts = parsed.pathname.split('/').filter(Boolean);
    return host === 'seminuevosgocar.mx'
      && parts[0] === 'seminuevo'
      && Boolean(parts[1])
      && Boolean(parts[2]);
  } catch (_) {
    return false;
  }
}

function numberFromMoney(text) {
  const match = String(text || '').match(/\$\s?([\d,.]{4,})|\b([\d,.]{5,})\s?(?:mxn|pesos)\b/i);
  const raw = match?.[1] || match?.[2] || '';
  const value = Number(raw.replace(/[^\d]/g, ''));
  return value > 10000 ? value : null;
}

function yearFromText(text) {
  const match = String(text || '').match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function kmFromText(text) {
  const match = String(text || '').match(/\b([\d,.]{1,8})\s?(?:km|kilometros|kilómetros)\b/i);
  if (!match) return null;
  const value = Number(match[1].replace(/[^\d]/g, ''));
  return Number.isFinite(value) ? value : null;
}

function normalizeImageUrl(raw, pageUrl = LIST_URL) {
  const url = cleanUrl(raw, pageUrl);
  if (!/^https?:\/\//i.test(url)) return null;
  if (!/carplanet\.mx\/\//i.test(url) && !/carplanet\.mx\//i.test(url)) return null;
  if (/logo|placeholder|default|sprite|garantigocar|dummyimage|no-image|not-available/i.test(url)) return null;
  return url.replace(/([^:])\/{2,}/g, '$1/');
}

function attr(value, name) {
  const re = new RegExp(`${name}=["']([^"']+)["']`, 'i');
  return decodeHtml(String(value || '').match(re)?.[1] || '');
}

function extractMakeModel(title, fallback = {}) {
  const full = stripTags(title);
  const withoutYear = full.replace(/\b(19|20)\d{2}\b/g, '').replace(/\s+/g, ' ').trim();
  const normalized = normText(withoutYear);
  const brand = BRANDS.find(candidate => {
    const brandNorm = normText(candidate);
    return normalized === brandNorm || normalized.startsWith(`${brandNorm} `);
  });
  if (!brand) {
    return {
      marca: '',
      modelo: fallback.modelo || withoutYear.split(/\s+/).slice(0, 3).join(' ')
    };
  }
  const brandNorm = normText(brand);
  const brandWords = brandNorm.split(/\s+/).length;
  const model = withoutYear.split(/\s+/).slice(brandWords).join(' ').trim();
  return {
    marca: brand === 'VW' ? 'Volkswagen' : brand,
    modelo: model || fallback.modelo || ''
  };
}

function splitCards(html) {
  return html
    .split(/<div class=["']product-card-one["'][^>]*data-href=/i)
    .slice(1)
    .map(part => `data-href=${part}`)
    .filter(part => /\/seminuevo\//i.test(part) && /class=["'][^"']*product-info/i.test(part));
}

function parseCard(card, pageUrl, fallback = {}) {
  const href = attr(card.match(/data-href=["'][^"']+["']/i)?.[0] || '', 'data-href')
    || attr(card.match(/<a[^>]+href=["'][^"']*\/seminuevo\/[^"']+["'][^>]*>/i)?.[0] || '', 'href');
  const url = cleanUrl(href, pageUrl);
  if (!isGocarVehicleUrl(url)) return null;

  const imgTag = card.match(/<img[^>]+src=["'][^"']+["'][^>]*alt=["'][^"']+["'][^>]*>/i)?.[0]
    || card.match(/<img[^>]+alt=["'][^"']+["'][^>]*src=["'][^"']+["'][^>]*>/i)?.[0]
    || '';
  const image = normalizeImageUrl(attr(imgTag, 'src'), pageUrl);
  const title = stripTags(card.match(/<h3\b[^>]*>[\s\S]*?<\/h3>/i)?.[0] || attr(imgTag, 'alt') || '');
  const parsed = extractMakeModel(title, fallback);
  const info = stripTags(card.match(/<div[^>]+class=["'][^"']*product-ratings[^"']*["'][^>]*>[\s\S]*?<\/div>/i)?.[0] || '');
  const price = numberFromMoney(card.match(/class=["'][^"']*mensuality[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || card);
  const locationRaw = stripTags(card.match(/<i[^>]+class=["'][^"']*flaticon-placeholder[^"']*["'][^>]*><\/i>\s*([^<]+)/i)?.[1] || '');

  return {
    id: gocarIdFromUrl(url),
    url,
    title,
    marca: parsed.marca || '',
    modelo: parsed.modelo || '',
    version: info.split('|')[0]?.trim() || '',
    anio: yearFromText(title || url),
    precio: price,
    km: kmFromText(info),
    ubicacion: locationRaw || 'Mexico',
    portal: 'Seminuevos Gocar',
    fuente_portal: 'Seminuevos Gocar',
    thumbnail_url: image,
    image_source: image ? 'html' : null
  };
}

async function fetchHtml(url, timeoutMs = 12000) {
  const { controller, done } = withTimeout(timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TixuzBot/1.0; +https://tixuzautos.com/bot; contacto: bot@tixuzautos.com)',
        Accept: 'text/html,application/xhtml+xml'
      }
    });
    if (!res.ok) throw new Error(`fetch_${res.status}`);
    return { html: await res.text(), finalUrl: res.url || url };
  } finally {
    done();
  }
}

function parseListPage(html, pageUrl, fallback = {}) {
  const seen = new Set();
  const out = [];
  for (const card of splitCards(html)) {
    const item = parseCard(card, pageUrl, fallback);
    if (!item?.url || seen.has(item.url)) continue;
    seen.add(item.url);
    out.push(item);
  }
  return out;
}

function matchesIntent(item, marca, modelo) {
  const wantedMake = normText(marca);
  const wantedModel = normText(modelo);
  const foundMake = normText(item.marca);
  const foundModel = normText(`${item.modelo} ${item.title} ${item.version}`);
  const makeOk = !wantedMake || (foundMake && (foundMake === wantedMake || foundMake.includes(wantedMake) || wantedMake.includes(foundMake)));
  const modelOk = !wantedModel || foundModel.includes(wantedModel);
  return makeOk && modelOk;
}

async function discover(marca, modelo, ciudad = '', opts = {}) {
  if (!marca && !modelo) return [];
  const limit = opts.limit || 10;
  const attempts = Math.min(Math.max(opts.attempts || 3, 1), 4);
  const out = [];
  const seen = new Set();
  for (let attempt = 0; attempt < attempts && out.length < limit; attempt++) {
    try {
      const { html, finalUrl } = await fetchHtml(LIST_URL, opts.timeoutMs || 14000);
      const items = parseListPage(html.slice(0, opts.maxChars || 1000000), finalUrl, { marca, modelo })
        .filter(item => matchesIntent(item, marca, modelo))
        .filter(item => item.precio && item.thumbnail_url);
      for (const item of items) {
        const key = item.id || item.url;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(item);
        if (out.length >= limit) break;
      }
    } catch (_) {
      // Un intento fallido no debe tumbar todo el agregador.
    }
  }
  return out;
}

async function extractListing(url, opts = {}) {
  const clean = cleanUrl(url);
  if (!isGocarVehicleUrl(clean)) {
    return { url: clean || url, id: gocarIdFromUrl(url), images: [], error: 'not_gocar_vehicle' };
  }
  try {
    const { html, finalUrl } = await fetchHtml(clean, opts.timeoutMs || 10000);
    const title = decodeHtml(
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1]
      || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      || opts.fallback?.title
      || ''
    ).replace(/\s+/g, ' ').trim();
    const image = normalizeImageUrl(
      html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)/i)?.[1]
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["'][^>]*>/i)?.[1]
      || '',
      finalUrl
    );
    const parsed = extractMakeModel(title, opts.fallback || {});
    const text = stripTags(html.slice(0, opts.maxChars || 500000));
    return {
      id: gocarIdFromUrl(finalUrl),
      url: clean,
      title,
      marca: parsed.marca || opts.fallback?.marca || '',
      modelo: parsed.modelo || opts.fallback?.modelo || '',
      anio: yearFromText(title || text),
      precio: numberFromMoney(text),
      km: kmFromText(text),
      ubicacion: 'Mexico',
      images: image ? [{ url: image, source: 'og_image' }] : []
    };
  } catch (err) {
    return { url: clean, id: gocarIdFromUrl(clean), images: [], error: err.message || String(err) };
  }
}

module.exports = {
  discover,
  extractListing,
  gocarIdFromUrl,
  isGocarVehicleUrl,
  parseListPage,
  normText
};
