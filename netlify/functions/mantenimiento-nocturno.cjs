'use strict';

const SCHEDULE = '0 10 * * *';
const EXPIRATION_DAYS = 21;
const DUPLICATE_PRICE_DELTA = 0.02;
const MAX_ROWS = 5000;

const CANONICAL_STATES = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche',
  'Chiapas', 'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima',
  'Durango', 'Estado de México', 'Guanajuato', 'Guerrero', 'Hidalgo',
  'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca',
  'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa',
  'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán',
  'Zacatecas'
];

const KNOWN_ACRONYMS = new Set([
  'BMW', 'BYD', 'GMC', 'JAC', 'MG', 'RAM', 'SEAT', 'SUV', 'GT', 'GTI', 'GLI'
]);

function env(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || '';
}

function compactText(value) {
  if (value === null || value === undefined) return null;
  const result = String(value).trim().replace(/\s+/g, ' ');
  return result || null;
}

function comparisonKey(value) {
  return compactText(value)?.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX').replace(/[^a-z0-9]/g, '') || '';
}

function titleCasePart(part) {
  if (!part) return part;
  const upper = part.toLocaleUpperCase('es-MX');
  if (KNOWN_ACRONYMS.has(upper)) return upper;
  if (/^i\d+$/i.test(part)) return `i${part.slice(1)}`;
  if (/^[A-ZÁÉÍÓÚÑ]{1,3}\d*$/u.test(part)) return upper;
  const lower = part.toLocaleLowerCase('es-MX');
  return lower.charAt(0).toLocaleUpperCase('es-MX') + lower.slice(1);
}

function consistentCase(value) {
  const clean = compactText(value);
  if (!clean) return null;
  return clean.split(' ').map(word => word.split('-').map(titleCasePart).join('-')).join(' ');
}

function stateAliases() {
  const aliases = new Map(CANONICAL_STATES.map(state => [comparisonKey(state), state]));
  for (const alias of ['CDMX', 'DF', 'Distrito Federal', 'México DF', 'Mexico DF']) {
    aliases.set(comparisonKey(alias), 'Ciudad de México');
  }
  for (const alias of ['Edomex', 'Edo de México', 'Edo. de México', 'Estado de Mexico', 'México', 'Mexico']) {
    aliases.set(comparisonKey(alias), 'Estado de México');
  }
  aliases.set(comparisonKey('Coahuila de Zaragoza'), 'Coahuila');
  aliases.set(comparisonKey('Michoacán de Ocampo'), 'Michoacán');
  aliases.set(comparisonKey('Querétaro de Arteaga'), 'Querétaro');
  aliases.set(comparisonKey('Veracruz de Ignacio de la Llave'), 'Veracruz');
  return aliases;
}

function buildVehicleReference(rows) {
  const makes = new Map();
  const models = new Map();
  for (const row of rows || []) {
    const make = compactText(row.marca);
    const model = compactText(row.modelo);
    if (!make) continue;
    const makeKey = comparisonKey(make);
    if (!makes.has(makeKey)) makes.set(makeKey, make);
    if (model) models.set(`${makeKey}\u0000${comparisonKey(model)}`, { make, model });
  }
  return { makes, models };
}

function normalizedPatch(row, reference, aliases) {
  const rawMake = compactText(row.make);
  const rawModel = compactText(row.model);
  const makeKey = comparisonKey(rawMake);
  const pair = reference.models.get(`${makeKey}\u0000${comparisonKey(rawModel)}`);
  const make = pair?.make || reference.makes.get(makeKey) || consistentCase(rawMake);
  const model = pair?.model || consistentCase(rawModel);
  const rawState = compactText(row.state);
  const state = rawState ? (aliases.get(comparisonKey(rawState)) || consistentCase(rawState)) : null;
  const price = Number(row.price_mxn) === 0 ? null : row.price_mxn;
  const patch = {};
  if (row.make !== make) patch.make = make;
  if (row.model !== model) patch.model = model;
  if (row.state !== state) patch.state = state;
  if (row.price_mxn !== price) patch.price_mxn = price;
  return patch;
}

function priceWithinTwoPercent(left, right) {
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return false;
  return Math.abs(a - b) / Math.max(a, b) < DUPLICATE_PRICE_DELTA;
}

function duplicateIds(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (row.status !== 'active') continue;
    const key = [
      comparisonKey(row.make),
      comparisonKey(row.model),
      row.year ?? '',
      row.mileage_km ?? '',
      comparisonKey(row.city)
    ].join('\u0000');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const duplicates = [];
  for (const group of groups.values()) {
    group.sort((left, right) => {
      const timeDifference = new Date(right.last_seen_at).getTime() - new Date(left.last_seen_at).getTime();
      return timeDifference || String(left.id).localeCompare(String(right.id));
    });
    const keepers = [];
    for (const row of group) {
      if (keepers.some(keeper => priceWithinTwoPercent(row.price_mxn, keeper.price_mxn))) {
        duplicates.push(row.id);
      } else {
        keepers.push(row);
      }
    }
  }
  return duplicates;
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function inFilter(values) {
  return `(${values.map(value => `"${String(value).replaceAll('"', '\\"')}"`).join(',')})`;
}

function runId(date) {
  return `mant-${date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}`;
}

function statusCounts(rows) {
  return rows.reduce((counts, row) => {
    counts[row.status] = (counts[row.status] || 0) + 1;
    return counts;
  }, {});
}

function createSupabaseClient() {
  const url = env('SUPABASE_URL') || 'https://rbiuoljoduekajivffzh.supabase.co';
  const key = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SERVICE_KEY');
  if (!key) throw new Error('missing_SUPABASE_SERVICE_ROLE_KEY');

  return async function sb(path, options = {}) {
    const response = await fetch(`${url}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    if (!response.ok) {
      throw new Error(`supabase_${response.status}:${typeof data === 'string' ? data : JSON.stringify(data)}`);
    }
    return { data, response };
  };
}

async function patchRows(sb, changes) {
  let updated = 0;
  for (const batch of chunks(changes, 10)) {
    const results = await Promise.all(batch.map(({ id, patch }) => sb(
      `agg_autos_inventory?id=eq.${encodeURIComponent(id)}`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) }
    )));
    updated += results.reduce((total, result) => total + (Array.isArray(result.data) ? result.data.length : 0), 0);
  }
  return updated;
}

async function patchStatus(sb, ids, status) {
  let updated = 0;
  for (const batch of chunks(ids, 100)) {
    const result = await sb(`agg_autos_inventory?id=in.${encodeURIComponent(inFilter(batch))}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status })
    });
    updated += Array.isArray(result.data) ? result.data.length : 0;
  }
  return updated;
}

async function insertRun(sb, payload) {
  await sb('agg_ingest_runs', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(payload)
  });
}

async function runMaintenance() {
  const sb = createSupabaseClient();
  const startedAt = new Date();
  const id = runId(startedAt);
  let before = {};

  try {
    const [inventoryResponse, referenceResponse] = await Promise.all([
      sb(`agg_autos_inventory?select=${encodeURIComponent('id,make,model,year,price_mxn,mileage_km,city,state,last_seen_at,status')}&limit=${MAX_ROWS}`),
      sb('agg_marcas_modelos?select=marca,modelo&limit=5000')
    ]);
    const inventory = inventoryResponse.data || [];
    before = statusCounts(inventory);

    const cutoff = new Date(startedAt.getTime() - EXPIRATION_DAYS * 86400000).toISOString();
    const expiration = await sb(
      `agg_autos_inventory?status=eq.active&last_seen_at=lt.${encodeURIComponent(cutoff)}&select=id`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ status: 'expired' })
      }
    );
    const expiredIds = new Set((expiration.data || []).map(row => row.id));
    for (const row of inventory) if (expiredIds.has(row.id)) row.status = 'expired';

    const reference = buildVehicleReference(referenceResponse.data || []);
    const aliases = stateAliases();
    const normalizationChanges = [];
    for (const row of inventory) {
      const patch = normalizedPatch(row, reference, aliases);
      if (Object.keys(patch).length) {
        normalizationChanges.push({ id: row.id, patch });
        Object.assign(row, patch);
      }
    }
    const normalized = await patchRows(sb, normalizationChanges);

    const duplicateCandidates = duplicateIds(inventory);
    const duplicated = await patchStatus(sb, duplicateCandidates, 'duplicate');
    const duplicateSet = new Set(duplicateCandidates);
    for (const row of inventory) if (duplicateSet.has(row.id)) row.status = 'duplicate';

    const finishedAt = new Date();
    const counts = {
      expirados: expiredIds.size,
      duplicados: duplicated,
      normalizados: normalized
    };
    const notes = `expirados=${counts.expirados}; duplicados=${counts.duplicados}; normalizados=${counts.normalizados}`;
    const after = statusCounts(inventory);
    await insertRun(sb, {
      run_id: id,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      source_name: 'mantenimiento',
      queries_run: 0,
      listings_found: inventory.length,
      listings_upserted: counts.expirados + counts.duplicados + counts.normalizados,
      errors: [],
      errores: 0,
      notes,
      detalle: {
        counts,
        before,
        after,
        expiration_days: EXPIRATION_DAYS,
        duplicate_price_delta_pct: DUPLICATE_PRICE_DELTA * 100,
        marketplace_listings_touched: false
      }
    });

    return {
      ok: true,
      run_id: id,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      counts,
      before,
      after,
      notes
    };
  } catch (error) {
    const finishedAt = new Date();
    const message = String(error?.message || error).slice(0, 1000);
    await insertRun(sb, {
      run_id: id,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      source_name: 'mantenimiento',
      errors: [{ error: message }],
      errores: 1,
      notes: `fallido: ${message}`,
      detalle: { before, marketplace_listings_touched: false }
    }).catch(() => null);
    throw error;
  }
}

exports.config = { schedule: SCHEDULE };

exports.handler = async function handler() {
  try {
    const result = await runMaintenance();
    console.log(JSON.stringify({ event: 'mantenimiento_nocturno_completed', ...result }));
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error(JSON.stringify({ event: 'mantenimiento_nocturno_failed', error: String(error?.message || error) }));
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: false, error: String(error?.message || error) })
    };
  }
};

exports._test = {
  buildVehicleReference,
  comparisonKey,
  duplicateIds,
  normalizedPatch,
  priceWithinTwoPercent,
  stateAliases
};
