const autocosmos = require('./netlify/functions/autocosmos-discover.cjs');
const { cleanText, normalizeCity, normalizeState, splitLocation } = require('./netlify/functions/lib/listing-normalize.cjs');

const PROJECT_REF = 'rbiuoljoduekajivffzh';
const SUPABASE_URL = process.env.SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const REQUEST_DELAY_MS = 1500;
const REQUEST_TIMEOUT_MS = 10000;
const USER_AGENT = 'TixuzBot/1.0';

const STATE_NAMES = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas',
  'Chihuahua', 'Ciudad de México', 'Coahuila de Zaragoza', 'Colima', 'Durango',
  'Estado de México', 'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán',
  'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo',
  'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala',
  'Veracruz', 'Yucatán', 'Zacatecas'
];

function normKey(value) {
  return String(value || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

const STATE_ALIASES = new Map(STATE_NAMES.map(state => [normKey(state), state]));
for (const [alias, state] of [
  ['cdmx', 'Ciudad de México'], ['ciudad mexico', 'Ciudad de México'],
  ['distrito federal', 'Ciudad de México'], ['df', 'Ciudad de México'],
  ['coahuila', 'Coahuila de Zaragoza'], ['estado mexico', 'Estado de México'],
  ['edo mexico', 'Estado de México'], ['edomex', 'Estado de México'],
  ['michoacan de ocampo', 'Michoacán'], ['veracruz de ignacio de la llave', 'Veracruz']
]) STATE_ALIASES.set(alias, state);

const CITY_STATE = new Map(Object.entries({
  'ciudad de mexico': 'Ciudad de México', cdmx: 'Ciudad de México',
  azcapotzalco: 'Ciudad de México', coyoacan: 'Ciudad de México',
  'gustavo a madero': 'Ciudad de México', iztacalco: 'Ciudad de México',
  iztapalapa: 'Ciudad de México', 'miguel hidalgo': 'Ciudad de México',
  tlalpan: 'Ciudad de México', xochimilco: 'Ciudad de México',
  'alvaro obregon': 'Ciudad de México', cuajimalpa: 'Ciudad de México',
  guadalajara: 'Jalisco', zapopan: 'Jalisco', tlaquepaque: 'Jalisco',
  tonala: 'Jalisco', monterrey: 'Nuevo León', 'san pedro garza garcia': 'Nuevo León',
  apodaca: 'Nuevo León', guadalupe: 'Nuevo León', escobedo: 'Nuevo León',
  puebla: 'Puebla', atlixco: 'Puebla', cholula: 'Puebla',
  queretaro: 'Querétaro', toluca: 'Estado de México', metepec: 'Estado de México',
  lerma: 'Estado de México', naucalpan: 'Estado de México', tlalnepantla: 'Estado de México',
  'cuautitlan izcalli': 'Estado de México', ecatepec: 'Estado de México',
  'nezahualcoyotl': 'Estado de México', cuernavaca: 'Morelos', cancun: 'Quintana Roo',
  merida: 'Yucatán', leon: 'Guanajuato', 'san luis potosi': 'San Luis Potosí',
  aguascalientes: 'Aguascalientes', veracruz: 'Veracruz', xalapa: 'Veracruz',
  tijuana: 'Baja California', mexicali: 'Baja California', culiacan: 'Sinaloa',
  hermosillo: 'Sonora', chihuahua: 'Chihuahua', saltillo: 'Coahuila de Zaragoza',
  torreon: 'Coahuila de Zaragoza', morelia: 'Michoacán', uruapan: 'Michoacán',
  oaxaca: 'Oaxaca', pachuca: 'Hidalgo', villahermosa: 'Tabasco',
  'tuxtla gutierrez': 'Chiapas', acapulco: 'Guerrero', tampico: 'Tamaulipas',
  reynosa: 'Tamaulipas', matamoros: 'Tamaulipas'
}));

function canonicalState(value) {
  const key = normKey(value);
  if (!key) return null;
  if (STATE_ALIASES.has(key)) return STATE_ALIASES.get(key);
  for (const [alias, state] of STATE_ALIASES) {
    if (key === alias || key.endsWith(` ${alias}`)) return state;
  }
  return null;
}

function stateForCity(city) {
  const key = normKey(city);
  return CITY_STATE.get(key) || STATE_ALIASES.get(key) || null;
}

function resolvedLocation(city, state) {
  const cleanCity = normalizeCity(city);
  const cleanState = canonicalState(state) || normalizeState(state);
  return cleanCity && cleanState ? { city: cleanCity, state: cleanState } : null;
}

function locationFromText(value) {
  const text = cleanText(value);
  if (!text) return null;
  const split = splitLocation(text);
  if (split.city && split.state) {
    const found = resolvedLocation(split.city, split.state);
    if (found && canonicalState(found.state)) return found;
  }
  const state = canonicalState(text);
  if (state) {
    const cityPart = text.replace(new RegExp(`${state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), '')
      .replace(/(?:\ben\b|[,|\-])+\s*$/i, '').trim();
    if (cityPart) return resolvedLocation(cityPart, state);
  }
  return null;
}

function locationFromRaw(row) {
  const raw = row.raw_payload && typeof row.raw_payload === 'object' ? row.raw_payload : {};
  const direct = resolvedLocation(raw.city, raw.state);
  if (direct) return direct;
  for (const value of [raw.ubicacion, raw.location, raw.source_location, raw.seller_location, raw.address]) {
    if (typeof value === 'string') {
      const found = locationFromText(value);
      if (found) return found;
    }
  }
  return null;
}

function decodeEscaped(value) {
  try { return JSON.parse(`"${String(value || '').replace(/"/g, '\\"')}"`); } catch (_) { return String(value || ''); }
}

function kavakLocationFromHtml(html) {
  const source = String(html || '');
  const cityPatterns = [
    /\\"id\\":\\"region\\",\\"title\\":\\"Ciudad\\",\\"description\\":\\"([^"\\]+)\\"/i,
    /"id"\s*:\s*"region"\s*,\s*"title"\s*:\s*"Ciudad"\s*,\s*"description"\s*:\s*"([^"]+)"/i,
    />\s*Ciudad\s*<\/[\s\S]{0,300}?<p[^>]*>([^<]+)<\/p>/i
  ];
  let city = null;
  for (const pattern of cityPatterns) {
    const match = source.match(pattern);
    if (match?.[1]) {
      city = normalizeCity(decodeEscaped(match[1]));
      if (city) break;
    }
  }
  if (!city) return null;
  return resolvedLocation(city, stateForCity(city));
}

let externalRequests = 0;

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchHtml(url) {
  if (externalRequests > 0) await sleep(REQUEST_DELAY_MS);
  externalRequests++;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' }
    });
    if (!response.ok) throw new Error(`fetch_${response.status}`);
    return { html: await response.text(), finalUrl: response.url || url };
  } finally {
    clearTimeout(timer);
  }
}

async function locationFromSource(row) {
  const host = new URL(row.source_url).hostname.replace(/^www\./i, '').toLowerCase();
  const { html, finalUrl } = await fetchHtml(row.source_url);
  if (host.endsWith('autocosmos.com.mx')) {
    const detail = autocosmos.parseDetail(html.slice(0, 900000), finalUrl, { title: row.title });
    return resolvedLocation(detail.city, detail.state);
  }
  if (host.endsWith('kavak.com')) return kavakLocationFromHtml(html);
  throw new Error(`unsupported_source_${host}`);
}

async function sb(path, options = {}) {
  if (!SERVICE_KEY) throw new Error('missing_SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!response.ok) throw new Error(`supabase_${response.status}:${JSON.stringify(data).slice(0, 500)}`);
  return data;
}

function makeRunId() {
  return `backfill-ubicaciones-${new Date().toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '')}`;
}

async function main() {
  if (!SERVICE_KEY) throw new Error('Define SUPABASE_SERVICE_ROLE_KEY o SUPABASE_SERVICE_KEY');
  if (!SUPABASE_URL.includes(PROJECT_REF)) throw new Error(`SUPABASE_URL debe apuntar a ${PROJECT_REF}`);

  const resumeArg = process.argv.find(arg => arg.startsWith('--resume-run='));
  const resumeRunId = resumeArg ? resumeArg.slice('--resume-run='.length) : null;
  let priorRun = null;
  if (resumeRunId) {
    const matches = await sb(`agg_ingest_runs?run_id=eq.${encodeURIComponent(resumeRunId)}&source_name=eq.backfill_ubicaciones&select=*&limit=1`);
    priorRun = matches[0] || null;
    if (!priorRun) throw new Error(`resume_run_not_found:${resumeRunId}`);
  }
  const startedAt = priorRun ? new Date(priorRun.started_at) : new Date();
  const runId = priorRun?.run_id || makeRunId();
  const rows = await sb('agg_autos_inventory?status=eq.active&or=(state.is.null,state.eq.)&select=id,source_url,title,raw_payload&limit=1000');
  const resolved = [];
  const unresolved = [];

  console.log(JSON.stringify({ event: 'backfill_start', run_id: runId, orphan_count_before: rows.length }));
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    let location = locationFromRaw(row) || locationFromText(row.title);
    let method = location ? 'stored_payload_or_title' : 'source_page';
    let error = null;
    if (!location) {
      try { location = await locationFromSource(row); } catch (cause) { error = cause.message || String(cause); }
    }
    if (location) {
      await sb(`agg_autos_inventory?id=eq.${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ city: location.city, state: location.state })
      });
      resolved.push({ id: row.id, ...location, method });
    } else {
      unresolved.push({ id: row.id, source_url: row.source_url, error: error || 'location_not_found' });
    }
    console.log(JSON.stringify({ event: 'backfill_progress', current: index + 1, total: rows.length, resolved: resolved.length, unresolved: unresolved.length }));
  }

  const after = await sb('agg_autos_inventory?status=eq.active&or=(state.is.null,state.eq.)&select=id&limit=1000');
  const finishedAt = new Date();
  const previousResolved = Number(priorRun?.detalle?.resolved) || 0;
  const previousExternalRequests = Number(priorRun?.detalle?.external_requests) || 0;
  const previousMethods = priorRun?.detalle?.resolution_methods || {};
  const originalBefore = Number(priorRun?.detalle?.orphan_count_before) || rows.length;
  const totalResolved = previousResolved + resolved.length;
  const resolutionMethods = resolved.reduce((acc, item) => ({ ...acc, [item.method]: (acc[item.method] || 0) + 1 }), { ...previousMethods });
  const payload = {
    run_id: runId,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    source_name: 'backfill_ubicaciones',
    queries_run: originalBefore,
    listings_found: totalResolved,
    listings_upserted: totalResolved,
    errors: unresolved,
    notes: 'Backfill one-time de city/state para inventario activo de AutoCosmos y Kavak.',
    modelos_consultados: originalBefore,
    listados_nuevos: 0,
    listados_actualizados: totalResolved,
    errores: unresolved.length,
    detalle: {
      orphan_count_before: originalBefore,
      orphan_count_after: after.length,
      resolved: totalResolved,
      unresolved: unresolved.length,
      external_requests: previousExternalRequests + externalRequests,
      request_delay_ms: REQUEST_DELAY_MS,
      request_timeout_ms: REQUEST_TIMEOUT_MS,
      user_agent: USER_AGENT,
      resolution_methods: resolutionMethods
    }
  };
  if (priorRun) {
    await sb(`agg_ingest_runs?run_id=eq.${encodeURIComponent(runId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(payload) });
  } else {
    await sb('agg_ingest_runs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(payload) });
  }
  console.log(JSON.stringify({ event: 'backfill_finish', ...payload.detalle, run_id: runId }));
}

if (require.main === module) {
  main().catch(error => {
    console.error(JSON.stringify({ event: 'backfill_fatal', error: error.message || String(error) }));
    process.exitCode = 1;
  });
}

module.exports = { canonicalState, kavakLocationFromHtml, locationFromRaw, locationFromText, stateForCity };
