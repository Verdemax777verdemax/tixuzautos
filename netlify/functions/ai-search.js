// Tixuz AI - busqueda conversacional de autos.
// Usa OpenAI con busqueda web real cuando hay OPENAI_API_KEY.
// Si un proveedor falla, cae a otros proveedores o a busqueda gratis.

const { SITE_URL, fetchPublicListings } = require('./seo-utils.cjs');

const OPENAI_API = 'https://api.openai.com/v1/chat/completions';
const OPENAI_RESPONSES_API = 'https://api.openai.com/v1/responses';
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const SERPAPI_API = 'https://serpapi.com/search.json';

const OPENAI_MODEL = 'gpt-4o-mini';
const OPENAI_PLANNER_MODEL = 'gpt-4.1-mini';
const OPENAI_SEARCH_MODEL = 'gpt-4o-search-preview';
const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';

const TRUSTED_AUTO_HOSTS = [
  'tixuzautos.com',
  'cool-kataifi-78a65b.netlify.app',
  'auto.mercadolibre.com.mx',
  'autos.mercadolibre.com.mx',
  'listado.mercadolibre.com.mx',
  'seminuevos.com',
  'kavak.com',
  'autocosmos.com.mx',
  'automexico.com',
  'carplanet.mx',
  'automarket.bbva.mx',
  'bbva.mx',
  'autoplaza.com.mx',
  'soloautos.mx',
  'trovit.com.mx',
  'mitula.mx',
  'autotrader.com.mx',
];

const SEARCH_SOURCES = [
  { portal: 'MercadoLibre', query: 'site:autos.mercadolibre.com.mx OR site:listado.mercadolibre.com.mx autos', fallback: 'https://listado.mercadolibre.com.mx/autos' },
  { portal: 'Kavak', query: 'site:kavak.com/mx seminuevos', fallback: 'https://www.kavak.com/mx/seminuevos' },
  { portal: 'Seminuevos', query: 'site:seminuevos.com autos en venta', fallback: 'https://www.seminuevos.com/autos-en-venta' },
  { portal: 'AutoCosmos', query: 'site:autocosmos.com.mx auto usado nuevo', fallback: 'https://www.autocosmos.com.mx/auto/usado' },
  { portal: 'AutoMexico', query: 'site:automexico.com autos usados mexico', fallback: 'https://automexico.com/' },
  { portal: 'Carplanet', query: 'site:carplanet.mx autos seminuevos mexico', fallback: 'https://carplanet.mx/' },
  { portal: 'Agencias y nuevos', query: 'site:.com.mx autos nuevos agencia mexico catalogo precio', fallback: 'https://www.autocosmos.com.mx/catalogo' },
];

const VOICE_RULES = `Eres "Tixuz IA", especialista en autos en Mexico. Responde en espanol mexicano, breve y natural, pensando en voz:
- Maximo 35 palabras antes de mostrar resultados.
- No uses markdown, emojis, listas, asteriscos ni URLs en el texto hablado.
- Si hay resultados, solo di que encontraste opciones y que las muestres en pantalla.
- Si hay autos de Tixuz Autos, menciona que van primero; si solo hay externos, aclara que Tixuz todavia esta creciendo inventario.
- Nunca inventes listings, precios, kilometraje, ubicaciones ni links.
- Si falta informacion, pregunta solo por ciudad o estado, ano, marca y modelo.
- No pidas presupuesto, kilometraje, transmision, version ni usado/nuevo en la primera pregunta.`;

const ANTHROPIC_SYSTEM_PROMPT = `${VOICE_RULES}

Cuando tengas marca/modelo, ciudad, ano o intencion clara, usa web_search en fuentes de autos usados y nuevos:
MercadoLibre Mexico, Kavak, Seminuevos, AutoCosmos, AutoMexico, Carplanet, agencias oficiales y comparadores de autos nuevos.

Devuelve JSON estricto al final dentro de <resultados>...</resultados>:
[{"titulo":"...","precio":"...","ubicacion":"...","kilometraje":"...","portal":"...","url":"...","imagen":null}]

Solo uses URLs vistas literalmente en busqueda o paginas de busqueda validas del portal.`;

function env(name) {
  try {
    if (globalThis.Netlify && Netlify.env && typeof Netlify.env.get === 'function') {
      return Netlify.env.get(name);
    }
  } catch (e) {}
  return process.env[name];
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

function normalizeMessages(messages) {
  const out = [];
  for (const m of messages || []) {
    const role = m && (m.role === 'user' || m.role === 'assistant') ? m.role : null;
    const content = String((m && m.content) || '').trim();
    if (!role || !content) continue;
    if (out.length === 0 && role !== 'user') continue;

    const prev = out[out.length - 1];
    if (prev && prev.role === role) {
      prev.content += '\n\n' + content;
    } else {
      out.push({ role, content: content.slice(0, 4000) });
    }
  }

  let trimmed = out.slice(-12);
  while (trimmed.length && trimmed[0].role !== 'user') trimmed.shift();
  return trimmed;
}

function latestUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content;
  }
  return '';
}

function buildSearchText(messages) {
  return messages
    .filter(m => m.role === 'user')
    .slice(-3)
    .map(m => m.content)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

const MODEL_ALIASES = {
  aveo: { make: 'Chevrolet', model: 'Aveo', aliases: ['aveo', 'chevrolet aveo', 'chevy aveo'] },
  beat: { make: 'Chevrolet', model: 'Beat', aliases: ['beat', 'chevrolet beat'] },
  jetta: { make: 'Volkswagen', model: 'Jetta', aliases: ['jetta', 'volkswagen jetta', 'vw jetta'] },
  bora: { make: 'Volkswagen', model: 'Bora', aliases: ['bora', 'volkswagen bora', 'vw bora'] },
  vento: { make: 'Volkswagen', model: 'Vento', aliases: ['vento', 'volkswagen vento', 'vw vento'] },
  gol: { make: 'Volkswagen', model: 'Gol', aliases: ['gol', 'volkswagen gol', 'vw gol'] },
  polo: { make: 'Volkswagen', model: 'Polo', aliases: ['polo', 'volkswagen polo', 'vw polo'] },
  virtus: { make: 'Volkswagen', model: 'Virtus', aliases: ['virtus', 'volkswagen virtus', 'vw virtus'] },
  march: { make: 'Nissan', model: 'March', aliases: ['march', 'nissan march'] },
  versa: { make: 'Nissan', model: 'Versa', aliases: ['versa', 'nissan versa'] },
  sentra: { make: 'Nissan', model: 'Sentra', aliases: ['sentra', 'nissan sentra'] },
  altima: { make: 'Nissan', model: 'Altima', aliases: ['altima', 'nissan altima'] },
  kicks: { make: 'Nissan', model: 'Kicks', aliases: ['kicks', 'nissan kicks'] },
  xtrail: { make: 'Nissan', model: 'X-Trail', aliases: ['x trail', 'x-trail', 'nissan x trail', 'nissan x-trail'] },
  mazda2: { make: 'Mazda', model: '2', aliases: ['mazda 2', 'mazda2'] },
  mazda3: { make: 'Mazda', model: '3', aliases: ['mazda 3', 'mazda3'] },
  cx3: { make: 'Mazda', model: 'CX-3', aliases: ['cx 3', 'cx-3', 'mazda cx 3', 'mazda cx-3'] },
  cx5: { make: 'Mazda', model: 'CX-5', aliases: ['cx 5', 'cx-5', 'mazda cx 5', 'mazda cx-5'] },
  civic: { make: 'Honda', model: 'Civic', aliases: ['civic', 'honda civic'] },
  city: { make: 'Honda', model: 'City', aliases: ['honda city'] },
  fit: { make: 'Honda', model: 'Fit', aliases: ['fit', 'honda fit'] },
  crv: { make: 'Honda', model: 'CR-V', aliases: ['cr v', 'cr-v', 'honda cr v', 'honda cr-v'] },
  corolla: { make: 'Toyota', model: 'Corolla', aliases: ['corolla', 'toyota corolla'] },
  yaris: { make: 'Toyota', model: 'Yaris', aliases: ['yaris', 'toyota yaris'] },
  prius: { make: 'Toyota', model: 'Prius', aliases: ['prius', 'toyota prius'] },
  hilux: { make: 'Toyota', model: 'Hilux', aliases: ['hilux', 'toyota hilux'] },
  mustang: { make: 'Ford', model: 'Mustang', aliases: ['mustang', 'ford mustang'] },
  fiesta: { make: 'Ford', model: 'Fiesta', aliases: ['fiesta', 'ford fiesta'] },
  focus: { make: 'Ford', model: 'Focus', aliases: ['focus', 'ford focus'] },
  figo: { make: 'Ford', model: 'Figo', aliases: ['figo', 'ford figo'] },
  escape: { make: 'Ford', model: 'Escape', aliases: ['escape', 'ford escape'] },
  rio: { make: 'Kia', model: 'Rio', aliases: ['kia rio'] },
  forte: { make: 'Kia', model: 'Forte', aliases: ['forte', 'kia forte'] },
  ibiza: { make: 'SEAT', model: 'Ibiza', aliases: ['ibiza', 'seat ibiza'] },
  leonSeat: { make: 'SEAT', model: 'Leon', aliases: ['seat leon'] },
  trax: { make: 'Chevrolet', model: 'Trax', aliases: ['trax', 'chevrolet trax'] },
  onix: { make: 'Chevrolet', model: 'Onix', aliases: ['onix', 'chevrolet onix'] },
  spark: { make: 'Chevrolet', model: 'Spark', aliases: ['spark', 'chevrolet spark'] },
  cruze: { make: 'Chevrolet', model: 'Cruze', aliases: ['cruze', 'chevrolet cruze'] },
  sonic: { make: 'Chevrolet', model: 'Sonic', aliases: ['sonic', 'chevrolet sonic'] },
  cavalier: { make: 'Chevrolet', model: 'Cavalier', aliases: ['cavalier', 'chevrolet cavalier'] },
  captiva: { make: 'Chevrolet', model: 'Captiva', aliases: ['captiva', 'chevrolet captiva'] },
  silverado: { make: 'Chevrolet', model: 'Silverado', aliases: ['silverado', 'chevrolet silverado'] },
  ranger: { make: 'Ford', model: 'Ranger', aliases: ['ranger', 'ford ranger'] },
  ecosport: { make: 'Ford', model: 'EcoSport', aliases: ['ecosport', 'eco sport', 'ford ecosport', 'ford eco sport'] },
  sportage: { make: 'Kia', model: 'Sportage', aliases: ['sportage', 'kia sportage'] },
  seltos: { make: 'Kia', model: 'Seltos', aliases: ['seltos', 'kia seltos'] },
  sorento: { make: 'Kia', model: 'Sorento', aliases: ['sorento', 'kia sorento'] },
  tucson: { make: 'Hyundai', model: 'Tucson', aliases: ['tucson', 'hyundai tucson'] },
  creta: { make: 'Hyundai', model: 'Creta', aliases: ['creta', 'hyundai creta'] },
  elantra: { make: 'Hyundai', model: 'Elantra', aliases: ['elantra', 'hyundai elantra'] },
  grandi10: { make: 'Hyundai', model: 'Grand i10', aliases: ['grand i10', 'grand i 10', 'hyundai grand i10'] },
  duster: { make: 'Renault', model: 'Duster', aliases: ['duster', 'renault duster'] },
  kwid: { make: 'Renault', model: 'Kwid', aliases: ['kwid', 'renault kwid'] },
  sandero: { make: 'Renault', model: 'Sandero', aliases: ['sandero', 'renault sandero'] },
  swift: { make: 'Suzuki', model: 'Swift', aliases: ['swift', 'suzuki swift'] },
  ignis: { make: 'Suzuki', model: 'Ignis', aliases: ['ignis', 'suzuki ignis'] },
  vitara: { make: 'Suzuki', model: 'Vitara', aliases: ['vitara', 'suzuki vitara'] },
  mirage: { make: 'Mitsubishi', model: 'Mirage', aliases: ['mirage', 'mitsubishi mirage'] },
  outlander: { make: 'Mitsubishi', model: 'Outlander', aliases: ['outlander', 'mitsubishi outlander'] },
  l200: { make: 'Mitsubishi', model: 'L200', aliases: ['l200', 'mitsubishi l200'] },
  mg5: { make: 'MG', model: 'MG5', aliases: ['mg5', 'mg 5'] },
  mgzs: { make: 'MG', model: 'ZS', aliases: ['mg zs', 'zs mg'] },
  tiggo: { make: 'Chirey', model: 'Tiggo', aliases: ['tiggo', 'chirey tiggo'] },
  dolphin: { make: 'BYD', model: 'Dolphin', aliases: ['dolphin', 'byd dolphin'] },
  seal: { make: 'BYD', model: 'Seal', aliases: ['seal', 'byd seal'] },
  yuan: { make: 'BYD', model: 'Yuan Plus', aliases: ['yuan plus', 'byd yuan', 'byd yuan plus'] },
};

const BRAND_ALIASES = [
  { make: 'Volkswagen', aliases: ['volkswagen', 'vw'] },
  { make: 'Chevrolet', aliases: ['chevrolet', 'chevy'] },
  { make: 'Nissan', aliases: ['nissan'] },
  { make: 'Toyota', aliases: ['toyota'] },
  { make: 'Honda', aliases: ['honda'] },
  { make: 'Mazda', aliases: ['mazda'] },
  { make: 'Ford', aliases: ['ford'] },
  { make: 'Kia', aliases: ['kia'] },
  { make: 'Hyundai', aliases: ['hyundai'] },
  { make: 'Renault', aliases: ['renault'] },
  { make: 'Suzuki', aliases: ['suzuki'] },
  { make: 'Mitsubishi', aliases: ['mitsubishi'] },
  { make: 'MG', aliases: ['mg'] },
  { make: 'BYD', aliases: ['byd'] },
  { make: 'Chirey', aliases: ['chirey'] },
  { make: 'SEAT', aliases: ['seat'] },
  { make: 'Jeep', aliases: ['jeep'] },
  { make: 'Dodge', aliases: ['dodge'] },
  { make: 'RAM', aliases: ['ram'] },
  { make: 'BMW', aliases: ['bmw'] },
  { make: 'Mercedes-Benz', aliases: ['mercedes', 'mercedes benz'] },
  { make: 'Audi', aliases: ['audi'] },
  { make: 'Peugeot', aliases: ['peugeot'] },
  { make: 'Subaru', aliases: ['subaru'] },
  { make: 'Fiat', aliases: ['fiat'] },
  { make: 'Tesla', aliases: ['tesla'] },
  { make: 'Volvo', aliases: ['volvo'] },
  { make: 'JAC', aliases: ['jac'] },
];

const MODEL_STOP_WORDS = new Set([
  'busca', 'buscame', 'buscar', 'quiero', 'necesito', 'encuentra', 'muestrame',
  'un', 'una', 'unos', 'unas', 'auto', 'autos', 'carro', 'carros', 'coche',
  'usado', 'usados', 'seminuevo', 'seminuevos', 'nuevo', 'nuevos', 'de', 'del',
  'por', 'menos', 'mas', 'hasta', 'desde', 'entre', 'en', 'con', 'sin', 'para',
  'ano', 'año', 'modelo', 'precio', 'pesos', 'mxn', 'mil', 'leon', 'guadalajara',
  'zapopan', 'monterrey', 'cdmx', 'puebla', 'queretaro', 'tijuana', 'toluca',
]);

function titleCaseModel(value) {
  const special = { cx: 'CX', cr: 'CR', hr: 'HR', mg: 'MG', zs: 'ZS', byd: 'BYD', ram: 'RAM' };
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(part => special[part] || part.replace(/^./, c => c.toUpperCase()))
    .join(' ');
}

function inferBrandModelFromText(normalized) {
  const tokens = normalizeText(normalized).split(/\s+/).filter(Boolean);
  for (const brand of BRAND_ALIASES) {
    for (const alias of brand.aliases) {
      const aliasTokens = normalizeText(alias).split(/\s+/).filter(Boolean);
      for (let i = 0; i <= tokens.length - aliasTokens.length; i++) {
        const found = aliasTokens.every((part, offset) => tokens[i + offset] === part);
        if (!found) continue;

        const modelTokens = [];
        for (let j = i + aliasTokens.length; j < tokens.length && modelTokens.length < 3; j++) {
          const token = tokens[j];
          if (!token || MODEL_STOP_WORDS.has(token) || /^(19[8-9]\d|20[0-2]\d|\d{3,7})$/.test(token)) break;
          if (/^\d{1,2}$/.test(token) && !modelTokens.length) break;
          modelTokens.push(token);
        }

        const model = modelTokens.length ? titleCaseModel(modelTokens.join(' ')) : null;
        return {
          make: brand.make,
          model,
          aliases: model ? [modelTokens.join(' '), `${brand.aliases[0]} ${modelTokens.join(' ')}`] : [],
        };
      }
    }
  }
  return null;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+^${}()|[\]\\]/g, '\\$&');
}

function containsAlias(normalizedText, alias) {
  const normalizedAlias = normalizeText(alias);
  if (!normalizedAlias) return false;
  return new RegExp(`(^| )${escapeRegExp(normalizedAlias)}( |$)`).test(normalizedText);
}

function locationAliasTerms(value) {
  const base = normalizeText(value);
  if (!base) return [];
  const aliases = {
    'ciudad de mexico': ['ciudad de mexico', 'cdmx', 'df', 'distrito federal', 'mexico city'],
    'estado de mexico': ['estado de mexico', 'edomex'],
    'leon': ['leon'],
    'guadalajara': ['guadalajara', 'gdl'],
    'monterrey': ['monterrey', 'mty'],
    'queretaro': ['queretaro'],
    'merida': ['merida'],
  };
  return [...new Set([base, ...(aliases[base] || [])])];
}

function listingLocationMatchesIntent(listing, intent) {
  if (!intent.city && !intent.state) return true;
  const rawLocation = String(listing.ubicacion || listing.location || '');
  const location = normalizeText(rawLocation);
  if (!location || location === 'mexico') return true;

  const cityTerms = locationAliasTerms(intent.city);
  const stateTerms = locationAliasTerms(intent.state);
  const cityOk = cityTerms.some(term => containsAlias(location, term) || location.includes(term));
  const stateOk = stateTerms.some(term => containsAlias(location, term) || location.includes(term));
  if (stateOk) return true;
  if (cityOk) {
    if (normalizeText(intent.city) === 'leon' && /\bnuevo leon\b/.test(location)) return false;
    return true;
  }
  if (!cityTerms.length && !stateTerms.length) return true;

  const knownLocation = /\b(cdmx|ciudad de mexico|distrito federal|estado de mexico|edomex|aguascalientes|baja california|baja california sur|campeche|chiapas|chihuahua|coahuila|colima|durango|guanajuato|guerrero|hidalgo|jalisco|michoacan|morelos|nayarit|nuevo leon|oaxaca|puebla|queretaro|quintana roo|san luis potosi|sinaloa|sonora|tabasco|tamaulipas|tlaxcala|veracruz|yucatan|zacatecas|guadalajara|zapopan|monterrey|leon|tijuana|merida|cancun|toluca|cuernavaca)\b/.test(location);
  const looksSpecific = rawLocation.includes(',') || /\bmunicipio de\b/i.test(rawLocation);
  return !(knownLocation || looksSpecific);
}

function knownModelFromText(text) {
  const normalized = normalizeText(text);
  return Object.values(MODEL_ALIASES).find(info =>
    info.aliases.some(alias => containsAlias(normalized, alias))
  ) || null;
}

function hasVehicleIntent(text) {
  const t = text.toLowerCase();
  const model = knownModelFromText(text);
  const brands = [
    'acura', 'audi', 'bmw', 'byd', 'cadillac', 'chevrolet', 'chevy', 'chirey',
    'chrysler', 'cupra', 'dodge', 'fiat', 'ford', 'gmc', 'honda', 'hyundai',
    'infiniti', 'jac', 'jeep', 'kia', 'lexus', 'mazda', 'mercedes', 'mg',
    'mini', 'mitsubishi', 'nissan', 'peugeot', 'porsche', 'ram', 'renault',
    'seat', 'subaru', 'suzuki', 'tesla', 'toyota', 'volkswagen', 'vw', 'volvo',
  ];
  return Boolean(model)
    || brands.some(b => t.includes(b))
    || /\b(20[0-2]\d|19[8-9]\d)\b/.test(t)
    || /\b(auto|carro|camioneta|suv|pickup|sedan|hatchback|seminuevo|usado|nuevo|agencia)\b/.test(t)
    || /\b(\d{2,3})\s*(mil|k)\b/.test(t)
    || /\$ \d{2,3}[,.]\d{3}/.test(t);
}

function decodeHtml(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(title) {
  return decodeHtml(title)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+-\s+(MercadoLibre|Kavak|Seminuevos|AutoCosmos|SoloAutos).*$/i, '')
    .slice(0, 110);
}

function buildSlug(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function unwrapDuckUrl(url) {
  const decoded = decodeHtml(url);
  if (!decoded) return '';
  if (decoded.startsWith('//duckduckgo.com/l/')) {
    try {
      const u = new URL('https:' + decoded);
      return u.searchParams.get('uddg') || decoded;
    } catch (e) {
      return decoded;
    }
  }
  if (decoded.startsWith('/l/')) {
    try {
      const u = new URL('https://duckduckgo.com' + decoded);
      return u.searchParams.get('uddg') || decoded;
    } catch (e) {
      return decoded;
    }
  }
  return decoded;
}

function portalFromUrl(url, fallbackPortal) {
  const host = (() => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  })();
  if (host.includes('mercadolibre')) return 'MercadoLibre';
  if (host.includes('kavak')) return 'Kavak';
  if (host.includes('seminuevos')) return 'Seminuevos';
  if (host.includes('autocosmos')) return 'AutoCosmos';
  if (host.includes('automexico')) return 'AutoMexico';
  if (host.includes('carplanet')) return 'Carplanet';
  if (host.includes('bbva') || host.includes('automarket')) return 'BBVA AutoMarket';
  if (host.includes('autoplaza')) return 'AutoPlaza';
  if (host.includes('trovit')) return 'Trovit';
  if (host.includes('mitula')) return 'Mitula';
  if (host.includes('autotrader')) return 'AutoTrader';
  if (host.includes('toyota') || host.includes('nissan') || host.includes('chevrolet') || host.includes('ford') || host.includes('mazda')) return 'Agencia oficial';
  return fallbackPortal || 'Fuente autos';
}

function hostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; }
}

function isTrustedAutoUrl(url) {
  const host = hostFromUrl(url);
  return TRUSTED_AUTO_HOSTS.some(domain => host === domain || host.endsWith(`.${domain}`) || host.includes(domain));
}

function inferPrice(text) {
  const s = decodeHtml(text);
  const mxn = s.match(/\$ [\d,.]{4,}\s*(:MXN|M\.N\.)/i);
  if (mxn) return mxn[0].replace(/\s+/g, ' ').trim();
  const pesos = s.match(/\b\d{2,3}[,.]\d{3}\s*(:pesos|mxn)\b/i);
  return pesos ? pesos[0].trim() : null;
}

function priceToNumber(value) {
  const text = String(value || '').toLowerCase();
  if (!text || /consultar|preguntar|n\/a|no disponible/.test(text)) return null;

  const thousandsText = text.match(/\b(\d{2,4})\s*(mil|k)\b/i);
  if (thousandsText) {
    const amount = Number(thousandsText[1]) * 1000;
    return Number.isFinite(amount) ? amount : null;
  }

  const amountText = text.match(/\d[\d,.]{3,}/);
  if (!amountText) return null;
  const amount = Number(amountText[0].replace(/[,.]/g, ''));
  return Number.isFinite(amount) ? amount : null;
}

function kmToNumber(value) {
  const text = String(value || '').toLowerCase();
  if (!text) return null;

  const compact = text.match(/\b(\d{1,3})[,.](\d{3})\b/);
  if (compact) {
    const amount = Number(`${compact[1]}${compact[2]}`);
    return Number.isFinite(amount) ? amount : null;
  }

  const amountText = text.match(/\b\d{1,7}\b/);
  if (!amountText) return null;
  let amount = Number(amountText[0]);
  if (!Number.isFinite(amount)) return null;
  if (amount <= 500 && /\b(mil|k)\b/.test(text)) amount *= 1000;
  return amount;
}

function inferKm(text) {
  const s = decodeHtml(text);
  const km = s.match(/\b[\d,.]{1,7}\s*(:km|kilometros|kilómetros)\b/i);
  return km ? km[0].replace(/kil[oó]metros/i, 'km').trim() : null;
}

function inferLocation(text) {
  const s = decodeHtml(text);
  const loc = s.match(/\b(CDMX|Ciudad de Mexico|Ciudad de México|Guadalajara|Zapopan|Monterrey|Puebla|Queretaro|Querétaro|Toluca|Tijuana|Merida|Mérida|Leon|León|Cancun|Cancún|Mexico|México)\b/i);
  return loc ? loc[0] : null;
}

function isGenericAutoResult(listing) {
  const title = String(listing.titulo || '').toLowerCase();
  const normalizedTitle = normalizeText(listing.titulo);
  const url = String(listing.url || '').toLowerCase();
  if (/\b(alternador|refaccion|refacciones|repuesto|repuestos|accesorio|accesorios|faro|faros|calavera|calaveras|rin|rines|llanta|llantas|defensa|parrilla|sensor|bomba|inyector|inyectores|amortiguador|amortiguadores|balata|balatas|pastilla|pastillas|radiador|retrovisor|espejo|manija|tapete|tapetes|cubierta|soporte|modulo|computadora|carcasa|facia|fascia|caliper|resonador|ducto|filtro|compresor|clima|bateria|bujia|bujias|manguera|valvula)\b/.test(normalizedTitle)) return true;
  return /^buscar\s+"/.test(title)
    || /^autos y camionetas\b/.test(title)
    || /^autos volkswagen\b/.test(title)
    || /^autos\s+.+\s+seminuevos en venta\b/.test(title)
    || /^compra de autos seminuevos\b/.test(title)
    || /^autos usados y nuevos\b/.test(title)
    || /^precios\b/.test(title)
    || /\busados en méxico\b/.test(title)
    || /\ba partir de\b/.test(title)
    || /^automexico$/.test(title)
    || /\/mx\/seminuevos\/$/.test(url)
    || /kavak\.com\/mx\/seminuevos\/[^#]+\/$/.test(url)
    || /autos\.mercadolibre\.com\.mx\/$/.test(url);
}

function isUsableImage(url) {
  const value = String(url || '').trim();
  if (!/^https:\/\//i.test(value)) return false;
  const lower = value.toLowerCase();
  return !lower.includes('main-hero')
    && !lower.includes('/home/jpg/')
    && !lower.includes('logo')
    && !lower.includes('placeholder')
    && !lower.includes('favicon')
    && !lower.includes('default');
}

function isDirectListing(listing) {
  const url = String(listing.url || '');
  return /tixuzautos\.com\/autos\//i.test(url)
    || /cool-kataifi-78a65b\.netlify\.app\/autos\//i.test(url)
    || /auto\.mercadolibre\.com\.mx\/MLM-\d+.+-_JM/i.test(url)
    || /seminuevos\.com\/vehicle\//i.test(url)
    || /facebook\.com\/marketplace\/item\//i.test(url)
    || /\/vehiculo\/|\/vehicle\/|\/detalle\/|\/auto-usado\/|\/seminuevos\/.+\/\d+/i.test(url);
}

function isDisplayQualityListing(listing, intent = null) {
  if (!listing || !isUsableImage(listing.imagen)) return false;
  if (isGenericAutoResult(listing)) return false;
  if (intent && !listingMatchesIntent(listing, intent)) return false;
  if (isDirectListing(listing)) return true;
  if (isTrustedAutoUrl(listing.url)) return true;
  const title = normalizeText(listing.titulo);
  const hasVehicleWords = /\b(auto|autos|carro|camioneta|suv|sedan|hatchback|pickup|usado|seminuevo|venta)\b/.test(title);
  const hasYearOrPrice = /\b(19[8-9]\d|20[0-2]\d)\b/.test(title)
    || /\$|consultar|\d{2,3}[,.]\d{3}/i.test(String(listing.precio || ''));
  return hasVehicleWords || hasYearOrPrice || Boolean(intent.model);
}

function listingScore(listing) {
  let score = 0;
  const url = String(listing.url || '');
  if (/tixuzautos\.com\/autos\//i.test(url) || /cool-kataifi-78a65b\.netlify\.app\/autos\//i.test(url) || /tixuz autos/i.test(String(listing.portal || ''))) score += 95;
  if (/auto\.mercadolibre\.com\.mx\/MLM-\d+.+-_JM/i.test(url)) score += 60;
  if (/seminuevos\.com\/vehicle\//i.test(url)) score += 55;
  if (/kavak\.com\/mx\/seminuevos\/.+\/\d+/i.test(url)) score += 45;
  if (listing.imagen) score += 15;
  if (listing.precio && listing.precio !== 'Consultar') score += 12;
  if (listing.kilometraje) score += 10;
  if (listing.ubicacion && !/^mexico|méxico$/i.test(listing.ubicacion)) score += 8;
  if (isGenericAutoResult(listing)) score -= 35;
  return score;
}

function rankListings(listings, intent = null) {
  const deduped = dedupeListings(filterListingsForIntent(listings, intent));
  const displayReady = deduped.filter(l => isDisplayQualityListing(l, intent));
  const pool = displayReady.length ? displayReady : deduped.filter(l => isUsableImage(l.imagen) && !isGenericAutoResult(l));
  const sorted = pool
    .sort((a, b) => listingScore(b) - listingScore(a))
    .slice(0, 20);
  return diversifyListings(sorted).slice(0, 10);
}

function displayableListings(listings, intent = null) {
  return rankListings(listings, intent).filter(l => isDisplayQualityListing(l, intent));
}

function rankCandidateListings(listings, intent = null, limit = 24) {
  return dedupeListings(filterListingsForIntent(listings, intent))
    .filter(l => l && !isGenericAutoResult(l) && listingMatchesIntent(l, intent))
    .sort((a, b) => listingScore(b) - listingScore(a))
    .slice(0, limit);
}

function diversifyListings(listings) {
  const groups = new Map();
  for (const item of listings || []) {
    const portal = String(item.portal || portalFromUrl(item.url, 'Fuente autos')).toLowerCase();
    if (!groups.has(portal)) groups.set(portal, []);
    groups.get(portal).push(item);
  }
  if (groups.size <= 1) return listings || [];

  const out = [];
  const buckets = [...groups.values()];
  let moved = true;
  while (moved && out.length < 20) {
    moved = false;
    for (const bucket of buckets) {
      const next = bucket.shift();
      if (next) {
        out.push(next);
        moved = true;
      }
    }
  }
  return out;
}

function foundMessage(count, meta = {}) {
  const ownCount = Number(meta.ownCount || 0);
  const externalCount = Math.max(0, Number(meta.externalCount || 0));
  if (ownCount && externalCount) {
    return `Encontré ${ownCount} en Tixuz Autos y completé con ${externalCount} de portales externos. Abre el veredicto Tixuz para revisar pros, riesgos y preguntas al vendedor.`;
  }
  if (ownCount) {
    return `Encontré ${ownCount} ${ownCount === 1 ? 'opción' : 'opciones'} en Tixuz Autos. Abre el veredicto para ver si conviene y que revisar.`;
  }
  return count
    ? `Aún no tenemos ese inventario en Tixuz, pero encontré ${count} ${count === 1 ? 'opción externa' : 'opciones externas'} con foto. Abre el veredicto Tixuz antes de ir a la fuente original.`
    : 'No encontré opciones con foto confiable para esos filtros. Puedo ampliar la ciudad o abrir el año.';
}

function firstSearchQuestion() {
  return 'Dime en una sola frase: ciudad o estado, año, marca y modelo. Por ejemplo: Guadalajara, 2018, Volkswagen Jetta.';
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseBudget(text) {
  const t = normalizeText(text);
  const values = [];
  const moneyRe = /\$\s*(\d{2,4})(:[,.](\d{3}))\s*(mil|k|mxn|pesos)/gi;
  let match;
  while ((match = moneyRe.exec(text))) {
    const unit = (match[3] || '').toLowerCase();
    let n = Number(match[1]);
    if (!Number.isFinite(n)) continue;
    if (!match[2] && !unit && n >= 1980 && n <= 2029) continue;
    if (match[2]) n = Number(`${match[1]}${match[2]}`);
    else if (unit.match(/mil|k/) || n < 5000) n *= 1000;
    if (n >= 10000 && n <= 5000000) values.push(n);
  }
  if (!values.length) return {};
  if (/\b(entre|de)\b/.test(t) && values.length >= 2) return { min_price: Math.min(...values), max_price: Math.max(...values) };
  if (/\b(maximo|max|hasta|menos de|por debajo)\b/.test(t)) return { max_price: Math.max(...values) };
  if (/\b(desde|minimo|min|arriba de|mas de)\b/.test(t)) return { min_price: Math.min(...values) };
  return { max_price: Math.max(...values) };
}

function parseYearIntent(text) {
  const normalized = normalizeText(text);
  const years = [...normalized.matchAll(/\b(19[8-9]\d|20[0-2]\d)\b/g)].map(m => Number(m[1]));
  if (!years.length) return { year_min: null, year_max: null };
  if (years.length >= 2) return { year_min: Math.min(...years), year_max: Math.max(...years) };

  const year = years[0];
  const aroundYear = new RegExp(`(desde|a partir de|en adelante|para arriba|posterior|mayor a|mas nuevo que)\\s+${year}|${year}\\s+(en adelante|para arriba|o mas nuevo|o reciente)`);
  if (aroundYear.test(normalized)) return { year_min: year, year_max: null };

  const upToYear = new RegExp(`(hasta|antes de|anterior a|menor a)\\s+${year}|${year}\\s+(o anterior|o mas viejo)`);
  if (upToYear.test(normalized)) return { year_min: null, year_max: year };

  return { year_min: year, year_max: year };
}

function parseMileageLimit(text) {
  const normalized = normalizeText(text);
  const match = normalized.match(/\b(:menos de|maximo|max|hasta|por debajo de|no mas de)\s*(\d{1,7})(:\s*(mil|k))\s*(:km|kms|kilometros)\b/)
    || normalized.match(/\b(:kilometraje|km|kms|kilometros)\s*(:maximo|max|hasta|de|con)\s*(\d{1,7})(:\s*(mil|k))\b/);
  if (!match) return null;
  let amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  if ((match[2] || '').match(/mil|k/) || amount <= 500) amount *= 1000;
  return amount >= 1000 && amount <= 1000000 ? amount : null;
}

function inferIntentHeuristic(searchText) {
  const normalized = normalizeText(searchText);
  const years = parseYearIntent(searchText);
  const budget = parseBudget(searchText);
  const intent = {
    original_query: searchText,
    make: null,
    model: null,
    aliases: [],
    year_min: years.year_min,
    year_max: years.year_max,
    city: null,
    state: null,
    body_type: null,
    condition: /\b(nuevo|nueva|nuevos|agencia|0\s*km|cero\s*km)\b/i.test(searchText)
      ? 'nuevo'
      : (/\b(usado|usada|usados|seminuevo|seminueva|seminuevos|segunda mano)\b/i.test(searchText) ? 'usado' : null),
    transmission: /\b(automatico|automatica|autom.tico|autom.tica|cvt|tiptronic)\b/i.test(searchText)
      ? 'automatico'
      : (/\b(manual|estandar|est.ndar|std)\b/i.test(searchText) ? 'manual' : null),
    drivetrain: /\b(4x4|awd|4wd)\b/i.test(searchText) ? '4x4' : null,
    min_price: budget.min_price || null,
    max_price: budget.max_price || null,
    max_km: parseMileageLimit(searchText),
    must_terms: [],
    exclude_terms: [],
  };

  for (const info of Object.values(MODEL_ALIASES)) {
    if (info.aliases.some(alias => containsAlias(normalized, alias))) {
      intent.make = info.make;
      intent.model = info.model;
      intent.aliases = info.aliases;
      break;
    }
  }

  if (!intent.make) {
    const brandIntent = inferBrandModelFromText(normalized);
    if (brandIntent) {
      intent.make = brandIntent.make;
      intent.model = brandIntent.model;
      intent.aliases = brandIntent.aliases;
    }
  }

  const cityMap = [
    ['leon', 'León', 'Guanajuato'],
    ['guadalajara', 'Guadalajara', 'Jalisco'],
    ['zapopan', 'Zapopan', 'Jalisco'],
    ['monterrey', 'Monterrey', 'Nuevo León'],
    ['cdmx', 'CDMX', 'CDMX'],
    ['ciudad de mexico', 'CDMX', 'CDMX'],
    ['puebla', 'Puebla', 'Puebla'],
    ['queretaro', 'Querétaro', 'Querétaro'],
  ];
  const city = cityMap.find(([needle]) => normalized.includes(needle));
  if (city) {
    intent.city = city[1];
    intent.state = city[2];
  }

  if (/\b(camioneta|suv)\b/i.test(searchText)) intent.body_type = 'camioneta SUV';
  if (/\b(pickup|pick up|doble cabina)\b/i.test(searchText)) intent.body_type = 'pickup';
  if (/\b(sedan|sedan)\b/i.test(normalized)) intent.body_type = 'sedan';

  intent.must_terms = [
    intent.make,
    intent.model,
    intent.drivetrain,
    intent.city,
  ].filter(Boolean);

  return intent;
}

async function planVehicleSearch(messages, searchText) {
  const apiKey = env('OPENAI_API_KEY');
  const fallback = inferIntentHeuristic(searchText);
  if (fallback.model) return fallback;
  if (!apiKey) return fallback;

  const prompt = `Eres un experto comprador de autos en Mexico. Convierte la conversacion en una busqueda estructurada estricta.

Reglas:
- Si el usuario pide "Jetta", interpreta Volkswagen Jetta y excluye cualquier auto que no sea Jetta.
- Extrae marca, modelo, ciudad, estado, ano, presupuesto, kilometraje maximo, carroceria, usado/nuevo, transmision y traccion.
- Si el usuario dice "hasta 80 mil km", "menos de 100000 kilometros" o similar, pon max_km como numero entero.
- Si falta algo, deja null; no inventes.
- Genera 6 queries para Google/SerpAPI. Deben usar comillas para modelo exacto si existe.
- Devuelve SOLO JSON valido:
{"make":null,"model":null,"aliases":[],"year_min":null,"year_max":null,"city":null,"state":null,"body_type":null,"condition":null,"transmission":null,"drivetrain":null,"min_price":null,"max_price":null,"max_km":null,"must_terms":[],"exclude_terms":[],"queries":[]}

Conversacion:
${messages.map(m => `${m.role}: ${m.content}`).join('\n').slice(-6000)}

Busqueda compacta: ${searchText}`;

  const tryChat = async (model) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    let res;
    try {
      res = await fetch(OPENAI_API, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Devuelve solo JSON valido. Eres preciso y estricto.' },
            { role: 'user', content: prompt },
          ],
        }),
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`${model}: ${(await res.text()).slice(0, 220)}`);
    const data = await res.json();
    return JSON.parse(data.choices?.[0].message.content || '{}');
  };

  for (const model of [env('OPENAI_PLANNER_MODEL') || OPENAI_PLANNER_MODEL, 'gpt-4.1-mini']) {
    try {
      const ai = await tryChat(model);
      return {
        ...fallback,
        ...ai,
        aliases: Array.isArray(ai.aliases) && ai.aliases.length ? ai.aliases : fallback.aliases,
        condition: ai.condition || fallback.condition || null,
        transmission: ai.transmission || fallback.transmission || null,
        drivetrain: ai.drivetrain || fallback.drivetrain || null,
        max_km: ai.max_km || fallback.max_km || null,
        must_terms: Array.isArray(ai.must_terms) && ai.must_terms.length ? ai.must_terms : fallback.must_terms,
        exclude_terms: Array.isArray(ai.exclude_terms) ? ai.exclude_terms : [],
        queries: Array.isArray(ai.queries) ? ai.queries : [],
        original_query: searchText,
      };
    } catch (e) {
      console.log('Planner failed:', String(e.message || e).slice(0, 260));
    }
  }
  return fallback;
}

function listingMatchesIntent(listing, intent) {
  if (!intent) return true;
  const haystack = normalizeText(`${listing.titulo} ${listing.portal} ${listing.url}`);

  if (!listingLocationMatchesIntent(listing, intent)) return false;

  if (intent.model) {
    const model = normalizeText(intent.model);
    const ambiguous = new Set(['2', '3', '5', 'city', 'leon', 'fit']);
    const aliases = [
      ...(intent.aliases || []),
      ...(model && !ambiguous.has(model) ? [intent.model] : []),
    ].map(normalizeText).filter(Boolean);
    if (aliases.length && !aliases.some(alias => containsAlias(haystack, alias))) return false;
  }

  if (intent.make) {
    const make = normalizeText(intent.make);
    const makeOk = haystack.includes(make)
      || (make === 'volkswagen' && /\b(vw|volkswagen)\b/.test(haystack));
    if (!intent.model && !makeOk) return false;
  }

  if (intent.drivetrain && !haystack.includes(normalizeText(intent.drivetrain))) {
    if (!/4x4|awd|4wd/.test(haystack)) return false;
  }

  if (intent.transmission) {
    const hasAnyTransmission = /\b(automatico|automatica|auto|at|cvt|tiptronic|manual|mt|std|estandar)\b/.test(haystack);
    const wantsAuto = normalizeText(intent.transmission).startsWith('auto');
    const transmissionOk = wantsAuto
      ? /\b(automatico|automatica|auto|at|cvt|tiptronic)\b/.test(haystack)
      : /\b(manual|mt|std|estandar)\b/.test(haystack);
    if (hasAnyTransmission && !transmissionOk) return false;
  }

  if (intent.year_min || intent.year_max) {
    const years = [...haystack.matchAll(/\b(19[8-9]\d|20[0-2]\d)\b/g)].map(m => Number(m[1]));
    if (years.length) {
      const min = Number(intent.year_min || intent.year_max);
      const max = Number(intent.year_max || intent.year_min);
      if (!years.some(year => year >= min && year <= max)) return false;
    }
  }

  for (const term of intent.exclude_terms || []) {
    if (term && haystack.includes(normalizeText(term))) return false;
  }

  const price = priceToNumber(listing.precio);
  if (price !== null) {
    if (price < 10000) return false;
    if (intent.max_price && price > Number(intent.max_price)) return false;
    if (intent.min_price && price < Number(intent.min_price)) return false;
  }

  const titleHasKm = /\b(km|kms|kilometros|kilómetros)\b/i.test(listing.titulo || '');
  const km = kmToNumber(`${listing.kilometraje || ''} ${titleHasKm ? listing.titulo || '' : ''}`);
  if (intent.max_km && km !== null && km > Number(intent.max_km)) return false;

  return true;
}

function filterListingsForIntent(listings, intent) {
  const incoming = listings || [];
  if (!intent) return incoming;
  const strict = incoming.filter(l => listingMatchesIntent(l, intent));
  if (strict.length) return strict;

  const hasHardIntent = Boolean(intent.make || intent.model || intent.max_price || intent.min_price || intent.year_min || intent.year_max);
  return hasHardIntent ? [] : incoming;
}

async function fetchDuckDuckGo(query) {
  const url = `https://duckduckgo.com/html/q=${encodeURIComponent(query)}`;
  const res = await fetchWithTimeout(url, 3500);
  if (!res.ok) throw new Error(`DuckDuckGo ${res.status}`);
  return res.text();
}

function quoteTerm(value) {
  const s = String(value || '').trim();
  return s ? `"${s.replace(/"/g, '')}"` : '';
}

function focusedSearchPhrase(searchText, intent = null) {
  const core = [intent.make, intent.model].filter(Boolean).join(' ').trim();
  const year = intent.year_min && !intent.year_max
    ? `desde ${intent.year_min}`
    : (intent.year_min && intent.year_max && intent.year_min !== intent.year_max
      ? `${intent.year_min} ${intent.year_max}`
      : (intent.year_min || intent.year_max || ''));
  const place = [intent.city, intent.state].filter(Boolean).join(' ').trim();
  if (core) return [core, year, place, 'usado seminuevo'].filter(Boolean).join(' ');

  return String(searchText || '')
    .replace(/\b(busca|buscame|buscar|quiero|necesito|encuentra|muestrame|un|una|unos|unas|por|menos|mas|de|hasta|en|con)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim() || searchText;
}

function serpApiQueries(searchText, intent = null) {
  if (intent && Array.isArray(intent.queries) && intent.queries.length) {
    return intent.queries.slice(0, 8);
  }

  const exact = [intent.make, intent.model].filter(Boolean).join(' ').trim();
  const targets = exact
    ? [...new Set([exact, ...(intent.aliases || [])].filter(Boolean).map(quoteTerm))].slice(0, 4)
    : [searchText];
  const target = targets[0];
  const altTarget = targets[1] || target;
  const shortTarget = targets[2] || altTarget;
  const place = [intent.city, intent.state].filter(Boolean).join(' ');
  const price = intent.max_price ? `hasta ${intent.max_price} pesos` : '';
  const km = intent.max_km ? `hasta ${intent.max_km} km` : '';
  const year = intent.year_min && intent.year_max && intent.year_min !== intent.year_max
    ? `${intent.year_min} ${intent.year_max}`
    : (intent.year_min || intent.year_max || '');
  const condition = intent.condition === 'nuevo' ? 'nuevo agencia' : 'usado seminuevo';
  const extra = [year, place, price, km, intent.body_type, intent.transmission, intent.drivetrain, condition].filter(Boolean).join(' ');
  const broadExtra = [year, place, km, intent.body_type, intent.transmission, intent.drivetrain, condition].filter(Boolean).join(' ');
  const mexicoExtra = [year, km, intent.body_type, intent.transmission, intent.drivetrain, `autos ${condition} Mexico precio foto`].filter(Boolean).join(' ');
  const socialNoise = '-tiktok -youtube -instagram -pinterest -facebook';

  return [
    `${target} ${extra} site:auto.mercadolibre.com.mx ${socialNoise}`,
    `${target} ${broadExtra} site:auto.mercadolibre.com.mx ${socialNoise}`,
    `${target} ${extra} site:seminuevos.com/vehicle ${socialNoise}`,
    `${altTarget} ${extra} site:kavak.com/mx/seminuevos ${socialNoise}`,
    `${shortTarget} ${extra} site:autocosmos.com.mx/auto ${socialNoise}`,
    `${target} ${broadExtra} site:automexico.com ${socialNoise}`,
    `${altTarget} ${broadExtra} site:automarket.bbva.mx/seminuevos ${socialNoise}`,
    `${shortTarget} ${broadExtra} site:autoplaza.com.mx ${socialNoise}`,
    `${target} ${mexicoExtra} MercadoLibre Kavak Seminuevos AutoCosmos ${socialNoise}`,
  ];
}

function serpApiImageQueries(searchText, intent = null) {
  const exact = [intent.make, intent.model].filter(Boolean).join(' ').trim();
  const target = exact || focusedSearchPhrase(searchText, intent);
  const place = [intent.city, intent.state].filter(Boolean).join(' ');
  const price = intent.max_price ? `hasta ${intent.max_price} pesos` : '';
  const base = [target, place, 'autos usados venta Mexico'].filter(Boolean).join(' ');
  return [
    `${base} MercadoLibre Kavak Seminuevos`,
    `${base} precio foto`,
    [target, price, 'auto usado foto MercadoLibre'].filter(Boolean).join(' '),
  ];
}

async function fetchSerpApi(query) {
  const apiKey = env('SERPAPI_API_KEY');
  if (!apiKey) return null;

  const url = new URL(SERPAPI_API);
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('google_domain', 'google.com.mx');
  url.searchParams.set('gl', 'mx');
  url.searchParams.set('hl', 'es');
  url.searchParams.set('location', 'Mexico');
  url.searchParams.set('num', '10');

  const res = await fetchWithTimeout(url.toString(), 6000, { 'Accept': 'application/json' });
  if (!res.ok) throw new Error(`SerpAPI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function fetchSerpApiShopping(query) {
  const apiKey = env('SERPAPI_API_KEY');
  if (!apiKey) return null;

  const url = new URL(SERPAPI_API);
  url.searchParams.set('engine', 'google_shopping');
  url.searchParams.set('q', query);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('gl', 'mx');
  url.searchParams.set('hl', 'es');
  url.searchParams.set('location', 'Mexico');
  url.searchParams.set('num', '20');

  const res = await fetchWithTimeout(url.toString(), 6500, { 'Accept': 'application/json' });
  if (!res.ok) throw new Error(`SerpAPI shopping ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function fetchSerpApiImages(query) {
  const apiKey = env('SERPAPI_API_KEY');
  if (!apiKey) return null;

  const url = new URL(SERPAPI_API);
  url.searchParams.set('engine', 'google_images');
  url.searchParams.set('q', query);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('gl', 'mx');
  url.searchParams.set('hl', 'es');
  url.searchParams.set('ijn', '0');

  const res = await fetchWithTimeout(url.toString(), 6500, { 'Accept': 'application/json' });
  if (!res.ok) throw new Error(`SerpAPI images ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

function parseSerpApiOrganic(data, intent = null) {
  const organic = Array.isArray(data.organic_results) ? data.organic_results : [];
  return organic.map(result => {
    const link = result.link || result.redirect_link || '';
    const text = `${result.title || ''} ${result.snippet || ''}`;
    const listing = normalizeListing({
      titulo: result.title || 'Resultado de autos',
      precio: inferPrice(text) || result.price || 'Consultar',
      ubicacion: inferLocation(text) || null,
      kilometraje: inferKm(text) || null,
      portal: portalFromUrl(link, result.source || 'Resultado web'),
      url: link,
      imagen: result.thumbnail || result.rich_snippet.top.detected_extensions.thumbnail || null,
    });
    return listing && listingMatchesIntent(listing, intent) ? listing : null;
  }).filter(Boolean);
}

function parseSerpApiShopping(data, intent = null) {
  const items = Array.isArray(data.shopping_results) ? data.shopping_results : [];
  return items.map(result => {
    const link = result.link || result.product_link || '';
    const listing = normalizeListing({
      titulo: result.title || 'Auto disponible',
      precio: result.price || (result.extracted_price ? `${result.extracted_price}` : 'Consultar'),
      ubicacion: result.delivery || result.extensions.join(' ') || 'Mexico',
      kilometraje: inferKm(`${result.title || ''} ${result.extensions.join(' ') || ''}`),
      portal: result.source || portalFromUrl(link, 'Google Shopping'),
      url: link,
      imagen: result.thumbnail || result.image || null,
    });
    return listing && listingMatchesIntent(listing, intent) ? listing : null;
  }).filter(Boolean);
}

function parseSerpApiImages(data, intent = null) {
  const items = Array.isArray(data.images_results) ? data.images_results : [];
  return items.map(result => {
    const link = result.link || result.source || result.original || '';
    const text = `${result.title || ''} ${result.source || ''}`;
    const listing = normalizeListing({
      titulo: result.title || 'Auto disponible',
      precio: inferPrice(text) || 'Consultar',
      ubicacion: inferLocation(text) || 'Mexico',
      kilometraje: inferKm(text),
      portal: portalFromUrl(link, result.source || 'Google Images'),
      url: link,
      imagen: result.thumbnail || result.original || null,
    });
    return listing && listingMatchesIntent(listing, intent) ? listing : null;
  }).filter(Boolean);
}

async function searchSerpApi(searchText, intent = null, allowRelaxedCity = true) {
  if (!env('SERPAPI_API_KEY')) return [];

  const batches = await Promise.allSettled(
    serpApiQueries(searchText, intent).map(async query => parseSerpApiOrganic(await fetchSerpApi(query), intent))
  );
  const organic = batches.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  let candidates = rankCandidateListings(organic, intent, 28);
  let displayCount = displayableListings(candidates, intent).length;

  if (displayCount < 5) {
    const shoppingQueries = serpApiQueries(searchText, intent).slice(0, 3);
    const shopping = await Promise.allSettled(
      shoppingQueries.map(async query => parseSerpApiShopping(await fetchSerpApiShopping(query), intent))
    );
    candidates = rankCandidateListings([
      ...candidates,
      ...shopping.flatMap(r => r.status === 'fulfilled' ? r.value : []),
    ], intent, 28);
    displayCount = displayableListings(candidates, intent).length;
  }

  if (displayCount < 6) {
    const images = await Promise.allSettled(
      serpApiImageQueries(searchText, intent).map(async query => parseSerpApiImages(await fetchSerpApiImages(query), intent))
    );
    candidates = rankCandidateListings([
      ...candidates,
      ...images.flatMap(r => r.status === 'fulfilled' ? r.value : []),
    ], intent, 28);
    displayCount = displayableListings(candidates, intent).length;
  }

  if (displayCount < 6) {
    candidates = rankCandidateListings([
      ...candidates,
      ...(await searchKavakAutos(searchText, intent).catch(() => [])),
      ...(await searchTrovitAutos(searchText, intent).catch(() => [])),
      ...(await searchMercadoLibreAutos(searchText, intent).catch(() => [])),
    ], intent, 28);
  }

  const enriched = await enrichListingsWithImages(candidates);
  const top = rankListings(enriched, intent);

  if (top.length < 3 && allowRelaxedCity && (intent.city || intent.state)) {
    const relaxedIntent = { ...intent, city: null, state: null, queries: [] };
    const relaxed = await searchSerpApi(searchText, relaxedIntent, false).catch(() => []);
    return enrichListingsWithImages(rankListings([...top, ...relaxed], intent));
  }

  return top;
}

function parseDuckResults(html, portal) {
  const listings = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*)<\/a>[\s\S]*<a[^>]+class="result__snippet"[^>]*>([\s\S]*)<\/a>/gi;
  let match;
  while ((match = re.exec(html)) && listings.length < 3) {
    const url = unwrapDuckUrl(match[1]);
    const title = cleanTitle(match[2]);
    const snippet = decodeHtml(match[3]).replace(/<[^>]+>/g, '');
    if (!title || !/^https:\/\//i.test(url)) continue;
    if (/duckduckgo|google|bing|facebook\.com\/sharer/i.test(url)) continue;

    listings.push({
      titulo: title,
      precio: inferPrice(`${title} ${snippet}`),
      ubicacion: inferLocation(snippet),
      kilometraje: inferKm(`${title} ${snippet}`),
      portal: portalFromUrl(url, portal),
      url,
      imagen: null,
    });
  }
  return listings;
}

function makeFallbackSearchCards(searchText) {
  const slug = encodeURIComponent(searchText);
  const mlSlug = searchText
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return [
    { portal: 'MercadoLibre', url: `https://listado.mercadolibre.com.mx/${mlSlug || 'autos'}` },
    { portal: 'Kavak', url: `https://www.kavak.com/mx/seminuevoskeyword=${slug}` },
    { portal: 'Seminuevos', url: `https://www.seminuevos.com/autos-en-ventaquery=${slug}` },
    { portal: 'AutoCosmos', url: `https://www.autocosmos.com.mx/auto/usadoq=${slug}` },
    { portal: 'AutoMexico', url: `https://automexico.com/auto-usado` },
    { portal: 'Carplanet', url: `https://carplanet.mx/` },
    { portal: 'Autos nuevos', url: `https://www.autocosmos.com.mx/catalogoq=${slug}` },
  ].map(item => ({
    titulo: `Buscar "${searchText}" en ${item.portal}`,
    precio: 'Consultar',
    ubicacion: 'Mexico',
    kilometraje: null,
    portal: item.portal,
    url: item.url,
    imagen: null,
  }));
}

function dedupeListings(listings) {
  const seen = new Set();
  return listings.filter(l => {
    if (!l || isDeadUrl(l.url)) return false;
    const key = String(l.url || l.titulo || '').split('')[0].split('#')[0].toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 60);
}

function isDeadUrl(url) {
  const u = String(url || '').toLowerCase();
  return !u || u === '#'
    || u.includes('soloautos.mx')
    || u.includes('/mxclose')
    || u.includes('duckduckgo.com')
    || u.includes('google.com/search')
    || u.includes('bing.com/search')
    || u.includes('youtube.com/watch')
    || u.includes('youtu.be/')
    || u.includes('facebook.com/groups/')
    || u.includes('tiktok.com/')
    || u.includes('instagram.com/')
    || u.includes('pinterest.')
    || u.includes('x.com/')
    || u.includes('twitter.com/');
}

function normalizeListing(raw) {
  const item = raw || {};
  const url = String(item.url || '').trim();
  if (isDeadUrl(url) || !/^https:\/\//i.test(url)) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname;
    if (host === 'autos.mercadolibre.com.mx' && /^\/MLM-\d+/i.test(path)) return null;
    if (host === 'auto.mercadolibre.com.mx' && /^\/MLM-\d+/i.test(path) && !/-_JM/i.test(path)) return null;
  } catch (e) {
    return null;
  }
  return {
    titulo: String(item.titulo || item.title || 'Auto disponible').trim().slice(0, 140),
    precio: item.precio || item.price || 'Consultar',
    ubicacion: item.ubicacion || item.location || 'Mexico',
    kilometraje: item.kilometraje || item.km || null,
    portal: item.portal || portalFromUrl(url, 'Fuente autos'),
    url,
    imagen: item.imagen || item.image || item.image_url || null,
  };
}

function completeAiListings(aiListings, sourceListings) {
  const sources = Array.isArray(sourceListings) ? sourceListings : [];
  const incoming = Array.isArray(aiListings) && aiListings.length ? aiListings : sources;

  return dedupeListings(incoming.map((item, index) => {
    const source = sources[index] || sources.find(s =>
      s.portal && item.portal && String(s.portal).toLowerCase() === String(item.portal).toLowerCase()
    ) || {};

    return normalizeListing({
      titulo: item.titulo || source.titulo || 'Ver opciones de autos',
      precio: item.precio || source.precio || 'Consultar',
      ubicacion: item.ubicacion || source.ubicacion || 'Mexico',
      kilometraje: item.kilometraje || source.kilometraje || null,
      portal: item.portal || source.portal || 'Fuente autos',
      url: item.url || source.url || source.fallback || '#',
      imagen: item.imagen || source.imagen || null,
    });
  }).filter(Boolean));
}

function isTixuzListing(listing) {
  const url = String(listing.url || '');
  const portal = String(listing.portal || '');
  return /tixuzautos\.com\/autos\//i.test(url)
    || /cool-kataifi-78a65b\.netlify\.app\/autos\//i.test(url)
    || /tixuz autos/i.test(portal);
}

function sourceCounts(listings) {
  const ownCount = (Array.isArray(listings) ? listings : []).filter(isTixuzListing).length;
  return {
    ownCount,
    externalCount: Math.max(0, (Array.isArray(listings) ? listings.length : 0) - ownCount),
  };
}

function moneyLabel(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? `${Math.round(n).toLocaleString('es-MX')}` : 'Consultar';
}

function kmLabel(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? `${Math.round(n).toLocaleString('es-MX')} km` : null;
}

function normalizeTixuzPublicListing(listing) {
  const images = Array.isArray(listing.images) ? listing.images : [];
  const image = images.find(isUsableImage) || null;
  const title = listing.title || [listing.year, listing.make, listing.model].filter(Boolean).join(' ');
  return normalizeListing({
    titulo: title || 'Auto publicado en Tixuz Autos',
    precio: moneyLabel(listing.price),
    ubicacion: listing.location || 'Mexico',
    kilometraje: kmLabel(listing.mileage),
    portal: 'Tixuz Autos',
    url: listing.url || `${SITE_URL}/autos/${encodeURIComponent(String(listing.id || '').trim())}`,
    imagen: image,
  });
}

async function searchTixuzAutos(searchText, intent = null) {
  try {
    const rows = await fetchPublicListings(500);
    const listings = rows.map(normalizeTixuzPublicListing).filter(Boolean);
    return rankCandidateListings(listings, intent, 12);
  } catch (e) {
    console.log('Tixuz inventory search unavailable:', String(e.message || e).slice(0, 200));
    return [];
  }
}

function acquisitionCta(searchText, intent = null, counts = {}) {
  const target = [
    intent.year_min,
    intent.make,
    intent.model,
    intent.city || intent.state,
  ].filter(Boolean).join(' ').trim() || String(searchText || '').trim().slice(0, 120);
  return {
    title: counts.ownCount
      ? 'Tambien puedes publicar un auto parecido en Tixuz'
      : 'Compradores ya estan buscando autos como este',
    message: counts.ownCount
      ? 'Si tienes inventario similar, publicalo en Tixuz para que aparezca junto a estas busquedas.'
      : 'Hoy esa busqueda tuvo que ampliarse a portales externos. Publicar ese tipo de auto en Tixuz ayuda a capturar esa demanda.',
    demand: target || 'autos usados en Mexico',
    publishUrl: `${SITE_URL}/?publicar=1`,
    lotUrl: `${SITE_URL}/ops=1`,
  };
}

function parseMercadoLibreAutos(html) {
  const listings = [];
  const itemRe = /<li class="ui-search-layout__item">([\s\S]*)(=<li class="ui-search-layout__item">|<\/ol>|$)/g;
  let match;
  while ((match = itemRe.exec(html)) && listings.length < 10) {
    const block = match[1];
    const link = block.match(/<a[^>]+href="([^"]+)"[^>]+class="poly-component__title"[^>]*>([\s\S]*)<\/a>/i);
    if (!link) continue;

    const url = decodeHtml(link[1]).split('#')[0];
    const title = cleanTitle(link[2]);
    const imageMatch = block.match(/<img[^>]+class="[^"]*poly-component__picture[^"]*"[^>]+src="([^"]+)"/i);
    const priceMatch = block.match(/<span class="andes-money-amount__fraction"[^>]*>([\d,\.]+)<\/span>/i);
    const attrs = [...block.matchAll(/<li class="poly-attributes_list__item[^"]*"[^>]*>([\s\S]*)<\/li>/gi)]
      .map(x => cleanTitle(x[1]));
    const locationMatch = block.match(/<span class="poly-component__location"[^>]*>([\s\S]*)<\/span>/i);

    const listing = normalizeListing({
      titulo: title,
      precio: priceMatch ? `${priceMatch[1]}` : 'Consultar',
      ubicacion: locationMatch ? cleanTitle(locationMatch[1]) : null,
      kilometraje: attrs.find(a => /\bkm\b/i.test(a)) || null,
      portal: 'MercadoLibre',
      url,
      imagen: imageMatch ? decodeHtml(imageMatch[1]) : null,
    });
    if (listing) listings.push(listing);
  }
  return listings;
}

async function searchMercadoLibreAutos(searchText, intent = null) {
  const phrase = focusedSearchPhrase(searchText, intent);
  const slug = buildSlug(phrase);
  if (!slug) return [];
  const urls = [
    `https://autos.mercadolibre.com.mx/${slug}`,
    `https://listado.mercadolibre.com.mx/${slug}`,
  ];

  const results = await Promise.allSettled(urls.map(async url => {
    try {
      const res = await fetchWithTimeout(url, 4500);
      if (!res.ok) return [];
      const html = await res.text();
      return parseMercadoLibreAutos(html);
    } catch (e) {}
    return [];
  }));
  const out = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  return dedupeListings(out);
}

function parseKavakAutos(html, intent = null) {
  const listings = [];
  const re = /\{\\"id\\":\\"([^"]+)\\"[\s\S]*\\"url\\":\\"([^"]+)\\"[\s\S]*\\"image\\":\\"([^"]+)\\"[\s\S]*\\"title\\":\\"([^"]*)\\"[\s\S]*\\"subtitle\\":\\"([^"]*)\\"[\s\S]*\\"mainPrice\\":\\"([^"]*)\\"[\s\S]*\\"footerInfo\\":\\"([^"]*)\\"/g;
  let match;
  while ((match = re.exec(html)) && listings.length < 12) {
    const url = decodeHtml(match[2]).replace(/\\\//g, '/');
    const imagePath = decodeHtml(match[3]).replace(/\\\//g, '/');
    const title = decodeHtml(match[4]).replace(/\s+/g, ' ').trim();
    const subtitle = decodeHtml(match[5]).replace(/\s+/g, ' ').trim();
    const mainPrice = decodeHtml(match[6]).replace(/[^\d,.]/g, '');
    const footerInfo = decodeHtml(match[7]).replace(/\s+/g, ' ').trim();
    const km = subtitle.match(/[\d,.]+\s*km/i)?.[0] || null;
    const listing = normalizeListing({
      titulo: `${title} ${subtitle}`.replace(/\s+/g, ' ').trim(),
      precio: mainPrice ? `${mainPrice}` : 'Consultar',
      ubicacion: footerInfo.split('Entrega')[0].trim() || 'Mexico',
      kilometraje: km,
      portal: 'Kavak',
      url,
      imagen: imagePath.startsWith('http') ? imagePath : `https://images.kavak.services/${imagePath.replace(/^\/+/, '')}`,
    });
    if (listing && listingMatchesIntent(listing, intent)) listings.push(listing);
  }
  return listings;
}

async function searchKavakAutos(searchText, intent = null) {
  const make = buildSlug(intent.make || '');
  const model = buildSlug(intent.model || '');
  const focused = buildSlug([intent.make, intent.model].filter(Boolean).join(' ') || focusedSearchPhrase(searchText, intent));
  const urls = [];
  if (make && model) urls.push(`https://www.kavak.com/mx/seminuevos/${make}/${model}`);
  if (focused) urls.push(`https://www.kavak.com/mx/seminuevoskeyword=${encodeURIComponent(focused.replace(/-/g, ' '))}`);

  const results = await Promise.allSettled([...new Set(urls)].map(async url => {
    const res = await fetchWithTimeout(url, 6000);
    if (!res.ok) return [];
    return parseKavakAutos(await res.text(), intent);
  }));
  return dedupeListings(results.flatMap(r => r.status === 'fulfilled' ? r.value : []));
}

function parseTrovitAutos(html, intent = null) {
  const listings = [];
  const blocks = String(html || '').split(/<div class="item js-item/).slice(1);
  for (const block of blocks) {
    if (listings.length >= 30) break;
    const href = block.match(/<a[^>]+href="([^"]+)"/i)?.[1];
    const img = block.match(/<img[^>]+src="([^"]+)"[^>]*class="snippet-image"/i)?.[1]
      || block.match(/<img[^>]+class="snippet-image"[^>]+src="([^"]+)"/i)?.[1];
    const title = cleanTitle(block.match(/<h4[^>]+class="item-title"[^>]*>([\s\S]*)<\/h4>/i)?.[1]);
    const price = cleanTitle(block.match(/<span[^>]+class="actual-price"[^>]*>([\s\S]*)<\/span>/i)?.[1]);
    const address = cleanTitle(block.match(/<h5[^>]+class="item-address"[^>]*>([\s\S]*)<\/h5>/i)?.[1]);
    const props = [...block.matchAll(/<div class="item-property">[\s\S]*<span>([\s\S]*)<\/span>/gi)].map(m => cleanTitle(m[1]));
    const year = props.find(p => /\b(19[8-9]\d|20[0-2]\d)\b/.test(p)) || null;
    const km = props.find(p => /\bkm/i.test(p)) || null;
    const listing = normalizeListing({
      titulo: year && !title.includes(year) ? `${title} ${year}` : title,
      precio: price || 'Consultar',
      ubicacion: address || 'Mexico',
      kilometraje: km,
      portal: 'Trovit',
      url: href ? decodeHtml(href) : '',
      imagen: img ? absoluteUrl(decodeHtml(img), 'https://autos.trovit.com.mx/') : null,
    });
    if (listing && listingMatchesIntent(listing, intent)) listings.push(listing);
  }
  return listings;
}

async function searchTrovitAutos(searchText, intent = null) {
  const core = [intent.make, intent.model].filter(Boolean).join(' ') || focusedSearchPhrase(searchText, intent);
  const slug = buildSlug(core);
  if (!slug) return [];
  const urls = [
    `https://autos.trovit.com.mx/autos-usados/${slug}`,
  ];
  if (/jetta/i.test(String(intent.model || core))) {
    urls.push('https://autos.trovit.com.mx/autos-usados/volkswagen-jetta-clasico');
  }

  const results = await Promise.allSettled(urls.map(async url => {
    const res = await fetchWithTimeout(url, 6000);
    if (!res.ok) return [];
    return parseTrovitAutos(await res.text(), intent);
  }));
  return dedupeListings(results.flatMap(r => r.status === 'fulfilled' ? r.value : []));
}

async function searchAutomotiveSources(searchText, intent = null) {
  const focused = focusedSearchPhrase(searchText, intent);
  const mlPromise = searchMercadoLibreAutos(searchText, intent);
  const kavakPromise = searchKavakAutos(searchText, intent);
  const trovitPromise = searchTrovitAutos(searchText, intent);
  const batches = await Promise.allSettled(
    SEARCH_SOURCES.map(async source => {
      const html = await fetchDuckDuckGo(`${focused} ${source.query} -tiktok -youtube -instagram -pinterest -facebook`);
      return parseDuckResults(html, source.portal);
    })
  );

  const mlResults = await mlPromise.catch(() => []);
  const kavakResults = await kavakPromise.catch(() => []);
  const trovitResults = await trovitPromise.catch(() => []);
  const found = rankListings([
    ...kavakResults,
    ...trovitResults,
    ...mlResults,
    ...batches.flatMap(r => r.status === 'fulfilled' ? r.value : []),
  ], intent);
  return found.length ? found : [];
}

function extractOpenAIResponseText(data) {
  if (data.output_text) return data.output_text;
  const chunks = [];
  for (const item of data.output || []) {
    for (const c of item.content || []) {
      if (c.type === 'output_text' && c.text) chunks.push(c.text);
      if (c.type === 'text' && c.text) chunks.push(c.text);
    }
  }
  return chunks.join('\n').trim();
}

function parseJsonFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Empty AI response');
  try {
    return JSON.parse(raw);
  } catch (e) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw e;
  }
}

function collectOpenAIAnnotations(data) {
  const out = [];
  const add = (url, title) => {
    const normalized = normalizeListing({
      titulo: title || portalFromUrl(url, 'Resultado web'),
      precio: 'Consultar',
      ubicacion: 'Mexico',
      kilometraje: null,
      portal: portalFromUrl(url, 'Resultado web'),
      url,
      imagen: null,
    });
    if (normalized) out.push(normalized);
  };

  const scan = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(scan);
      return;
    }
    if (typeof value !== 'object') return;

    if (value.type === 'url_citation' && value.url_citation) {
      add(value.url_citation.url, value.url_citation.title);
    }
    if (value.url && /https:\/\//i.test(value.url)) {
      add(value.url, value.title);
    }
    if (value.url_citation && value.url_citation.url) {
      add(value.url_citation.url, value.url_citation.title);
    }
    for (const v of Object.values(value)) scan(v);
  };

  scan(data);
  return dedupeListings(out);
}

function filterListingsByCitations(listings, citations) {
  if (!citations.length || listings.length) return listings;
  const citationUrls = new Set(citations.map(c => String(c.url || '').split('#')[0].toLowerCase()));
  return listings.filter(l => citationUrls.has(String(l.url || '').split('#')[0].toLowerCase()));
}

async function askOpenAIWebSearch(messages, searchText) {
  const apiKey = env('OPENAI_API_KEY');
  if (!apiKey) return null;

  const userContext = messages.map(m => `${m.role}: ${m.content}`).join('\n').slice(-8000);
  const prompt = `${VOICE_RULES}

Tarea: busca en TODO internet autos reales disponibles para esta solicitud: "${searchText}".

Fuentes preferidas pero no limitadas a: MercadoLibre Mexico, Kavak, Seminuevos, AutoCosmos, AutoMexico, Carplanet, agencias oficiales, inventarios de distribuidores y sitios de clasificados vigentes.

Reglas duras:
- No uses soloautos.mx: esta cerrado.
- No inventes autos ni URLs.
- Prioriza listings especificos; si no hay listing directo, usa pagina de busqueda vigente del portal.
- En MercadoLibre, un listing valido normalmente usa host auto.mercadolibre.com.mx y termina en -_JM; no inventes IDs MLM.
- Busca variedad entre portales, no todo de un solo sitio.
- Si puedes encontrar foto real del listing, pon URL absoluta en "imagen". Si no, null.
- Devuelve entre 6 y 10 resultados utiles.
- Devuelve SOLO JSON valido, sin markdown:
{"message":"frase corta para voz","listings":[{"titulo":"...","precio":"...","ubicacion":"...","kilometraje":"...","portal":"...","url":"https://...","imagen":"https://... o null"}]}

Conversacion:
${userContext}`;

  const chatRes = await fetch(OPENAI_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env('OPENAI_SEARCH_MODEL') || OPENAI_SEARCH_MODEL,
      web_search_options: {
        user_location: {
          type: 'approximate',
          approximate: {
            country: 'MX',
            city: 'Mexico City',
            region: 'CDMX',
          },
        },
      },
      messages: [
        { role: 'system', content: 'Devuelve solo JSON valido. No uses markdown.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (chatRes.ok) {
    const data = await chatRes.json();
    const text = data.choices?.[0].message.content || '';
    const parsed = parseJsonFromText(text);
    const citations = collectOpenAIAnnotations(data);
    const parsedListings = dedupeListings((parsed.listings || []).map(normalizeListing).filter(Boolean));
    const listings = parsedListings.length ? parsedListings : filterListingsByCitations(parsedListings, citations);
    const verifiedListings = await verifyAndEnrichListings(listings);
    const citationListings = verifiedListings.length ? [] : await verifyAndEnrichListings(citations);

    return {
      message: String(parsed.message || 'Encontré opciones reales en internet. Te las muestro en pantalla.').trim(),
      listings: verifiedListings.length ? verifiedListings : citationListings,
      provider: 'openai-search-preview',
    };
  }

  const chatErr = await chatRes.text();

  const res = await fetch(OPENAI_RESPONSES_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env('OPENAI_RESPONSES_MODEL') || 'gpt-4.1-mini',
      tools: [{ type: 'web_search_preview' }],
      tool_choice: 'auto',
      input: prompt,
    }),
  });

  if (!res.ok) throw new Error(`${chatErr.slice(0, 220)} | responses: ${(await res.text()).slice(0, 220)}`);
  const data = await res.json();
  const citations = collectOpenAIAnnotations(data);
  const parsed = parseJsonFromText(extractOpenAIResponseText(data));
  const parsedListings = dedupeListings((parsed.listings || []).map(normalizeListing).filter(Boolean));
  const listings = parsedListings.length ? parsedListings : filterListingsByCitations(parsedListings, citations);
  const verifiedListings = await verifyAndEnrichListings(listings);
  const citationListings = verifiedListings.length ? [] : await verifyAndEnrichListings(citations);

  return {
    message: String(parsed.message || 'Encontré opciones reales en internet. Te las muestro en pantalla.').trim(),
    listings: verifiedListings.length ? verifiedListings : citationListings,
    provider: 'openai-responses-web-search',
  };
}

async function askOpenAI(messages, sourceListings) {
  const apiKey = env('OPENAI_API_KEY');
  if (!apiKey) return null;

  const res = await fetch(OPENAI_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env('OPENAI_MODEL') || OPENAI_MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: `${VOICE_RULES}\nDevuelve solo JSON valido con esta forma: {"message":"...","listings":[...]}. Usa unicamente los listings que te doy. Puedes descartar ruido, no inventes datos.` },
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: `Listings encontrados en fuentes automotrices:\n${JSON.stringify(sourceListings).slice(0, 12000)}` },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) throw new Error((await res.text()).slice(0, 400));
  const data = await res.json();
  const text = data.choices?.[0].message.content || '';
  const parsed = JSON.parse(text);
  return {
    message: String(parsed.message || '').trim(),
    listings: completeAiListings(parsed.listings, sourceListings),
    provider: 'openai',
  };
}

async function fetchWithTimeout(url, ms = 4500, headers = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: headers || {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.9,en;q=0.7',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function absoluteUrl(value, base) {
  if (!value) return null;
  try { return new URL(value, base).toString(); } catch (e) { return null; }
}

function extractOgImage(html, baseUrl) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ];
  for (const re of patterns) {
    const match = html.match(re);
    const img = match && absoluteUrl(decodeHtml(match[1]), baseUrl);
    if (img && /^https:\/\//i.test(img)) return img;
  }
  return null;
}

function pageLooksDead(html) {
  return /no encontramos|no existe|publicaci[oó]n pausada|page not found|parece que esta p[aá]gina no existe|aviso de cierre/i.test(String(html || ''));
}

function pageLooksLikeListing(html, listing) {
  const text = String(html || '');
  const url = String(listing.url || '');
  const titleWords = String(listing.titulo || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(w => w.length > 2)
    .slice(0, 5);
  const normalizedPage = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const matchingWords = titleWords.filter(w => normalizedPage.includes(w)).length;

  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host === 'auto.mercadolibre.com.mx' && /\/MLM-\d+/i.test(new URL(url).pathname)) {
      return /ui-pdp-title|andes-money-amount|vpp-frontend/i.test(text) && matchingWords >= 2;
    }
  } catch (e) {}

  return matchingWords >= 1 || /og:title|twitter:title|schema\.org\/Vehicle|vehicle|precio|kil[oó]metro/i.test(text);
}

async function verifyAndEnrichListings(listings) {
  const candidates = dedupeListings(listings).slice(0, 10);
  const checked = await Promise.all(candidates.map(async item => {
    try {
      const res = await fetchWithTimeout(item.url, 6500);
      if (!res.ok) return null;
      const html = await res.text();
      if (pageLooksDead(html.slice(0, 20000)) && !isDirectListing(item) && !isTrustedAutoUrl(item.url)) return null;
      const ogImage = extractOgImage(html.slice(0, 250000), item.url);
      if (/auto\.mercadolibre\.com\.mx\/MLM-\d+/i.test(item.url) && !ogImage) return null;
      const imagen = item.imagen && /^https:\/\//i.test(item.imagen)
        ? item.imagen
        : ogImage;
      return { ...item, imagen: imagen || null };
    } catch (e) {
      return null;
    }
  }));
  return checked.filter(Boolean);
}

async function enrichListingsWithImages(listings) {
  const items = dedupeListings(listings).slice(0, 10);
  const enriched = await Promise.all(items.map(async item => {
    if (item.imagen && /^https:\/\//i.test(item.imagen)) return item;
    try {
      const res = await fetchWithTimeout(item.url);
      if (!res.ok) return item;
      const html = await res.text();
      const imagen = extractOgImage(html.slice(0, 250000), item.url);
      return imagen ? { ...item, imagen } : item;
    } catch (e) {
      return item;
    }
  }));
  return enriched;
}


async function askAnthropic(messages) {
  const apiKey = env('ANTHROPIC_API_KEY');
  if (!apiKey) return null;

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env('ANTHROPIC_MODEL') || ANTHROPIC_MODEL,
      max_tokens: 4096,
      system: ANTHROPIC_SYSTEM_PROMPT,
      tools: [{
        type: 'web_search_20260209',
        name: 'web_search',
        max_uses: 6,
        user_location: { type: 'approximate', country: 'MX', timezone: 'America/Mexico_City' },
      }],
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) throw new Error((await res.text()).slice(0, 400));
  const data = await res.json();
  const fullText = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  const match = fullText.match(/<resultados>([\s\S]*)<\/resultados>/);
  let listings = [];
  if (match) {
    try { listings = JSON.parse(match[1].trim()); } catch (e) { listings = []; }
  }
  return {
    message: fullText.replace(/<resultados>[\s\S]*<\/resultados>/, '').trim(),
    listings: Array.isArray(listings) ? dedupeListings(listings) : [],
    provider: 'anthropic',
  };
}

function fallbackQuestion(text) {
  if (!text || /^hola|buenas|qué tal|que tal|hey|ola$/i.test(text.trim())) {
    return firstSearchQuestion();
  }
  return firstSearchQuestion();
}

function isCountryWideSearch(text) {
  const t = normalizeText(text);
  return /\b(todo mexico|todo el pais|nacional|cualquier ciudad|sin importar ciudad|en mexico|mexico completo)\b/.test(t);
}

function isAdvisorStyleSearch(text, intent = {}) {
  const raw = String(text || '');
  const t = normalizeText(raw);
  return /^https?:\/\//i.test(raw.trim())
    || raw.length > 90
    || /\b(anuncio|publicacion|link|url|conviene|recomiendas|me lo compro|fallas|problemas|que revisar|vendedor|factura|adeudo|tenencia|trato|vendo|venta)\b/.test(t)
    || /\b(kavak|bbva|seminuevos|autocosmos|mercado libre|mercadolibre|agencia|lote|facebook|trovit|mitula)\b/.test(t)
    || Boolean(intent.make || intent.model || intent.body_type);
}

function hasLocationIntent(intent, searchText) {
  return Boolean(intent.city || intent.state || isCountryWideSearch(searchText) || isAdvisorStyleSearch(searchText, intent));
}

function joinNatural(items) {
  const clean = items.filter(Boolean);
  if (clean.length <= 1) return clean[0] || '';
  if (clean.length === 2) return `${clean[0]} y ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')} y ${clean[clean.length - 1]}`;
}

function buildQualificationQuestion(intent, searchText) {
  const missing = [];
  const advisorStyle = isAdvisorStyleSearch(searchText, intent);

  if (!intent.make && !intent.model && !intent.body_type && !advisorStyle) {
    missing.push('marca y modelo');
  }
  if (!hasLocationIntent(intent, searchText)) {
    missing.push('ciudad o estado');
  }
  if (!intent.year_min && !intent.year_max && !advisorStyle) missing.push('año');

  if (!missing.length) return null;

  return `Dime ${joinNatural(missing)}. Con eso arranco la búsqueda.`;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'Invalid JSON' });
  }

  const messages = normalizeMessages(Array.isArray(payload.messages) ? payload.messages : []);
  if (!messages.length) return json(400, { error: 'Empty messages after normalization' });

  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  if (totalChars > 20000) return json(413, { error: 'Conversation too long' });

  const latest = latestUserText(messages);
  const searchText = buildSearchText(messages);
  const shouldSearch = hasVehicleIntent(searchText);

  if (!shouldSearch) {
    return json(200, {
      message: fallbackQuestion(latest),
      listings: [],
      used_search: false,
      provider: 'free-rules',
    });
  }

  const quickIntent = inferIntentHeuristic(searchText);
  const quickQuestion = buildQualificationQuestion(quickIntent, searchText);
  if (quickQuestion) {
    return json(200, {
      message: quickQuestion,
      listings: [],
      used_search: false,
      provider: 'qualification-rules',
      intent: quickIntent,
    });
  }

  const intent = await planVehicleSearch(messages, searchText);
  const qualificationQuestion = buildQualificationQuestion(intent, searchText);
  if (qualificationQuestion) {
    return json(200, {
      message: qualificationQuestion,
      listings: [],
      used_search: false,
      provider: 'qualification-rules',
      intent,
    });
  }

  const tixuzMatches = displayableListings(await searchTixuzAutos(searchText, intent), intent);
  const sourcePromise = searchAutomotiveSources(searchText, intent).catch(() => []);

  let sourceListings = [];
  try {
    const externalListings = await enrichListingsWithImages(await sourcePromise);
    sourceListings = displayableListings([...tixuzMatches, ...externalListings], intent);
    if (sourceListings.length) {
      const counts = sourceCounts(sourceListings);
      return json(200, {
        message: foundMessage(sourceListings.length, counts),
        listings: sourceListings,
        used_search: true,
        provider: counts.ownCount ? 'tixuz-plus-direct-automotive-sources' : 'direct-automotive-sources',
        intent,
        inventory_mix: counts,
        acquisition_cta: acquisitionCta(searchText, intent, counts),
      });
    }
  } catch (e) {
    sourceListings = [];
  }

  try {
    const serpListings = await searchSerpApi(searchText, intent);
    const visible = displayableListings(serpListings, intent);
    if (visible.length) {
      const counts = sourceCounts(visible);
      return json(200, {
        message: foundMessage(visible.length, counts),
        listings: visible,
        used_search: true,
        provider: 'serpapi-google',
        intent,
        inventory_mix: counts,
        acquisition_cta: acquisitionCta(searchText, intent, counts),
      });
    }
  } catch (e) {
    console.log('SerpAPI unavailable, falling back:', String(e.message || e).slice(0, 250));
  }

  try {
    const ai = await askOpenAIWebSearch(messages, searchText);
    if (ai && ai.message && ai.listings.length) {
      const visible = displayableListings(await enrichListingsWithImages(ai.listings), intent);
      if (visible.length) {
        const counts = sourceCounts(visible);
        return json(200, {
          ...ai,
          message: foundMessage(visible.length, counts),
          listings: visible,
          used_search: true,
          intent,
          inventory_mix: counts,
          acquisition_cta: acquisitionCta(searchText, intent, counts),
        });
      }
    }
    if (ai && !ai.listings.length) {
      console.log('OpenAI web search returned no verified listings; falling back to direct sources');
    }
  } catch (e) {
    console.log('OpenAI web search unavailable, falling back:', String(e.message || e).slice(0, 300));
  }

  try {
    const ai = await askAnthropic(messages);
    if (ai && ai.message && ai.listings.length) {
      const visible = displayableListings(await enrichListingsWithImages(ai.listings), intent);
      if (visible.length) {
        const counts = sourceCounts(visible);
        return json(200, {
          ...ai,
          message: foundMessage(visible.length, counts),
          listings: visible,
          used_search: true,
          intent,
          inventory_mix: counts,
          acquisition_cta: acquisitionCta(searchText, intent, counts),
        });
      }
    }
  } catch (e) {
    console.log('Anthropic unavailable, falling back:', String(e.message || e).slice(0, 200));
  }

  const fallbackListings = sourceListings.length ? sourceListings : makeFallbackSearchCards(searchText);
  const counts = sourceCounts(fallbackListings);
  return json(200, {
    message: sourceListings.length
      ? foundMessage(sourceListings.length, counts)
      : 'No encontre anuncios especificos con foto confiable. Te dejo busquedas directas por fuente y puedes abrir el veredicto Tixuz para saber que revisar.',
    listings: fallbackListings,
    used_search: true,
    provider: 'free-automotive-search',
    intent,
    inventory_mix: counts,
    acquisition_cta: acquisitionCta(searchText, intent, counts),
  });
};
