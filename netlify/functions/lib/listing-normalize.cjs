function decodeHtml(value) {
  return String(value || '')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ');
}

function stripTags(value) {
  return decodeHtml(String(value || '').replace(/<[^>]*>/g, ' '))
    .replace(/<!--.*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(value) {
  const text = stripTags(value);
  return text || null;
}

function integerOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null;
  const digits = String(value).replace(/[^\d-]/g, '');
  if (!digits || digits === '-') return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function yearOrNull(value) {
  const match = String(value || '').match(/\b(19|20)\d{2}\b/);
  if (!match) return null;
  const year = Number(match[0]);
  return year >= 1980 && year <= new Date().getFullYear() + 1 ? year : null;
}

function yearCandidate(value) {
  const match = String(value || '').match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function normalizeListingQuality(input = {}, options = {}) {
  const currentYear = Number(options.currentYear) || new Date().getFullYear();
  const source = cleanText(options.source || input.source || '') || 'unknown';
  const context = cleanText(options.priceContext || input.priceContext || '') || '';
  const rawYear = yearCandidate(input.year);
  const rawPrice = integerOrNull(input.price);
  const rawMileage = integerOrNull(input.mileage);
  const year = rawYear !== null && rawYear >= 1980 && rawYear <= currentYear + 1 ? rawYear : null;
  let price = rawPrice;
  let mileage = rawMileage;
  const rejections = [];

  if (rawYear !== null && year === null) {
    rejections.push({ field: 'year', reason: rawYear < 1980 ? 'year_before_1980' : 'year_above_current_plus_one', raw_value: rawYear, source });
  }

  const recentVehicle = year !== null && year > currentYear - 10;
  const financingContext = /\b(al\s+mes|mensual(?:idad|idades)?|enganche|inversi[oó]n\s+inicial|pago\s+inicial|apartado)\b/i.test(context);
  const explicitTotalPrice = /\b(precio\s+(?:total|de\s+contado)|de\s+contado|precio\s+contado)\b/i.test(context);
  const weakFinancingContext = /desde\s+\$\s*[\d.,]+/i.test(context);
  if (price !== null && recentVehicle && price < 40000) {
    rejections.push({ field: 'price_mxn', reason: 'recent_vehicle_price_below_40000', raw_value: rawPrice, source });
    price = null;
  } else if (price !== null && financingContext && !explicitTotalPrice) {
    rejections.push({ field: 'price_mxn', reason: 'financing_amount_not_total_price', raw_value: rawPrice, source });
    price = null;
  } else if (price !== null && weakFinancingContext && price < 100000) {
    rejections.push({ field: 'price_mxn', reason: 'financing_amount_not_total_price', raw_value: rawPrice, source });
    price = null;
  }

  if (mileage !== null && mileage > 500000) {
    rejections.push({ field: 'mileage_km', reason: 'mileage_above_500000', raw_value: rawMileage, source });
    mileage = null;
  } else if (mileage === 0 && year !== null && year < currentYear - 2) {
    rejections.push({ field: 'mileage_km', reason: 'zero_mileage_vehicle_older_than_two_years', raw_value: rawMileage, source });
    mileage = null;
  }

  return { price, year, mileage, rejections };
}

function normalizeCity(value) {
  const city = cleanText(value)?.replace(/[|,]+$/, '').trim() || null;
  if (!city) return null;
  const key = city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/^(mexico|méxico|mx|republica mexicana|todo mexico|nacional)$/.test(key)) return null;
  return city;
}

function normalizeState(value) {
  const state = cleanText(value)?.replace(/^[,|\s]+|[,|\s]+$/g, '') || null;
  if (!state) return null;
  const key = state.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/^(mexico|méxico|mx|republica mexicana|nacional)$/.test(key)) return null;
  return state;
}

function splitLocation(value) {
  const text = cleanText(value);
  if (!text) return { city: null, state: null };
  const parts = text.split(/\s*[,|]\s*/).filter(Boolean);
  if (parts.length >= 2) {
    return { city: normalizeCity(parts[0]), state: normalizeState(parts.slice(1).join(', ')) };
  }
  return { city: normalizeCity(text), state: null };
}

function normalizeTransmission(value) {
  const text = cleanText(value);
  if (!text) return null;
  const key = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\b(cvt|continuamente variable)\b/.test(key)) return 'CVT';
  if (/\b(automatico|automatic|automatica|auto|aut|at|dsg|tiptronic)\b/.test(key)) return 'Automatica';
  if (/\b(manual|mt|estandar|standard)\b/.test(key)) return 'Manual';
  return text;
}

function normalizeSellerType(value) {
  const text = cleanText(value);
  if (!text) return null;
  const key = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/particular|privado|persona/.test(key)) return 'particular';
  if (/agencia|dealer|empresa|concesionario|kavak/.test(key)) return 'dealer';
  return null;
}

function isoDateOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const raw = cleanText(value);
  if (!raw || /^(hoy|ayer|anteayer)|hace\s+\d+/i.test(raw)) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = Date.now();
  if (parsed.getTime() < Date.UTC(2000, 0, 1) || parsed.getTime() > now + 24 * 60 * 60 * 1000) return null;
  return parsed.toISOString();
}

function absoluteDateFromHtml(html) {
  const patterns = [
    /["'](?:datePosted|datePublished|publishedAt|publicationDate)["']\s*:\s*["']([^"']+)["']/i,
    /(?:itemprop|property)=["'](?:datePosted|datePublished|article:published_time)["'][^>]+(?:content|datetime)=["']([^"']+)["']/i,
    /(?:content|datetime)=["']([^"']+)["'][^>]+(?:itemprop|property)=["'](?:datePosted|datePublished|article:published_time)["']/i
  ];
  for (const pattern of patterns) {
    const date = isoDateOrNull(decodeHtml(String(html || '').match(pattern)?.[1] || ''));
    if (date) return date;
  }
  return null;
}

function labelValue(html, label) {
  const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`>\\s*${escaped}\\s*<\\/[^>]+>[\\s\\S]{0,360}?<p\\b[^>]*>([\\s\\S]*?)<\\/p>`, 'i');
  return cleanText(String(html || '').match(pattern)?.[1] || '');
}

function metaContent(html, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["']`, 'i')
  ];
  for (const pattern of patterns) {
    const value = cleanText(String(html || '').match(pattern)?.[1] || '');
    if (value) return value;
  }
  return null;
}

function validHttpUrl(value, allowedHosts = []) {
  try {
    const url = new URL(decodeHtml(value));
    if (!/^https?:$/.test(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    if (allowedHosts.length && !allowedHosts.some(allowed => host === allowed || host.endsWith(`.${allowed}`))) return null;
    if (/logo|placeholder|default|sprite|no[-_]?image|not[-_]?available/i.test(url.pathname)) return null;
    return url.href;
  } catch (_) {
    return null;
  }
}

function jsonLdObjects(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of String(html || '').matchAll(re)) {
    try {
      const parsed = JSON.parse(decodeHtml(match[1]).trim());
      out.push(parsed);
    } catch (_) {
      // Invalid JSON-LD blocks are ignored; another block may contain the vehicle.
    }
  }
  return out;
}

function typeIncludes(value, wanted) {
  const values = Array.isArray(value) ? value : [value];
  return values.some(item => String(item || '').toLowerCase() === String(wanted).toLowerCase());
}

function findTypedObject(value, types) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTypedObject(item, types);
      if (found) return found;
    }
    return null;
  }
  if (types.some(type => typeIncludes(value['@type'], type))) return value;
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') {
      const found = findTypedObject(child, types);
      if (found) return found;
    }
  }
  return null;
}

function vehicleJsonLdFromHtml(html) {
  for (const object of jsonLdObjects(html)) {
    const vehicle = findTypedObject(object, ['Car', 'Vehicle']);
    if (vehicle) return vehicle;
  }
  return null;
}

function schemaName(value) {
  if (!value) return null;
  if (typeof value === 'string') return cleanText(value);
  return cleanText(value.name || value.legalName || value.alternateName || '');
}

function schemaOffer(vehicle) {
  const offers = Array.isArray(vehicle?.offers) ? vehicle.offers : [vehicle?.offers];
  return offers.find(Boolean) || {};
}

function schemaAddress(vehicle) {
  const offer = schemaOffer(vehicle);
  const seller = offer.seller || vehicle?.seller || {};
  const place = offer.availableAtOrFrom || vehicle?.availableAtOrFrom || {};
  return seller.address || place.address || vehicle?.address || {};
}

function schemaImageUrls(vehicle) {
  const values = Array.isArray(vehicle?.image) ? vehicle.image : [vehicle?.image];
  return values.map(value => typeof value === 'object' ? value.url || value.contentUrl : value).filter(Boolean);
}

module.exports = {
  absoluteDateFromHtml,
  cleanText,
  decodeHtml,
  integerOrNull,
  isoDateOrNull,
  jsonLdObjects,
  labelValue,
  metaContent,
  normalizeListingQuality,
  normalizeCity,
  normalizeSellerType,
  normalizeState,
  normalizeTransmission,
  schemaAddress,
  schemaImageUrls,
  schemaName,
  schemaOffer,
  splitLocation,
  stripTags,
  validHttpUrl,
  vehicleJsonLdFromHtml,
  yearCandidate,
  yearOrNull
};
