const { sb, json } = require('./_shared');

const DEFAULT_LIMIT = 5000;
const MAX_LIMIT = 5000;
const PAGE_SIZE = 500;
const CONCURRENCY = 8;

function titleFor(row) {
  return String(row.title || `${row.year || ''} ${row.make || ''} ${row.model || ''}`.trim() || 'Auto usado').trim();
}

function descriptionFor(row) {
  const parts = [
    row.year ? `Ano: ${row.year}` : '',
    row.make ? `Marca: ${row.make}` : '',
    row.model ? `Modelo: ${row.model}` : '',
    row.mileage_km ? `Kilometraje: ${Number(row.mileage_km).toLocaleString('es-MX')} km` : '',
    row.location || row.city || row.state ? `Ubicacion: ${row.location || [row.city, row.state].filter(Boolean).join(', ')}` : '',
    'Anuncio agregado desde fuente externa. Verifica datos en el anuncio original.'
  ].filter(Boolean);
  return parts.join('\n');
}

let vehicleColumnSupportPromise = null;

async function supportsVehicleColumns() {
  if (!vehicleColumnSupportPromise) {
    vehicleColumnSupportPromise = sb('aggregated_listings?select=vehicle_year,vehicle_km,vehicle_brand,vehicle_model,vehicle_transmission&limit=1')
      .then(probe => Boolean(probe.ok))
      .catch(() => false);
  }
  return vehicleColumnSupportPromise;
}

function vehicleFields(row) {
  return {
    vehicle_year: row.year ? Number(row.year) : null,
    vehicle_km: row.mileage_km ? Number(row.mileage_km) : null,
    vehicle_brand: row.make || null,
    vehicle_model: row.model || null,
    vehicle_transmission: row.raw_payload?.transmision || row.raw_payload?.transmission || null
  };
}

function legacyFields(row) {
  const sourceName = row.agg_source_registry?.source_name || row.source_name || row.source || 'Fuente externa';
  const image = row.thumbnail_url || row.image_url || '';
  const location = row.location || '';
  const city = row.city || (location.split(',')[0] || '').trim();
  const price = Number(row.price_mxn || 0);
  return {
    source_id: String(row.external_id || row.id || row.source_url),
    source: sourceName,
    source_name: sourceName,
    source_url: row.source_url,
    title: titleFor(row),
    original_title: titleFor(row),
    description: descriptionFor(row),
    original_description: descriptionFor(row),
    price,
    price_amount: price,
    currency: 'MXN',
    state: row.state || '',
    city,
    type: 'venta',
    operation_type: 'VENTA',
    operation: 'venta',
    property_type: 'auto',
    image_url: image,
    main_image_url: image,
    images: image ? [image] : [],
    condition: 'usado',
    active: true,
    review_status: 'approved',
    ready_for_sigma: true,
    expires_at: row.expires_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  };
}

async function aggregatedRow(row) {
  const payload = legacyFields(row);
  if (await supportsVehicleColumns()) Object.assign(payload, vehicleFields(row));
  return payload;
}

async function upsertOne(row) {
  if (!row.source_url || !row.expires_at) {
    return { skipped: true, reason: 'missing_required' };
  }
  const payload = await aggregatedRow(row);
  const existing = await sb(`aggregated_listings?source_url=eq.${encodeURIComponent(row.source_url)}&select=id&limit=1`);
  if (existing.ok && Array.isArray(existing.data) && existing.data[0]?.id) {
    const patched = await sb(`aggregated_listings?id=eq.${existing.data[0].id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify(payload)
    });
    return { updated: patched.ok, status: patched.status };
  }
  const inserted = await sb('aggregated_listings', {
    method: 'POST',
    prefer: 'return=minimal',
    body: JSON.stringify(payload)
  });
  return { inserted: inserted.ok, status: inserted.status };
}

async function mapLimit(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function readInventory(limit) {
  const select = 'id,source_id,external_id,source_url,title,make,model,year,price_mxn,mileage_km,city,state,location,thumbnail_url,image_url,expires_at,status,raw_payload,agg_source_registry(source_name)';
  const rows = [];
  for (let offset = 0; offset < limit; offset += PAGE_SIZE) {
    const pageLimit = Math.min(PAGE_SIZE, limit - offset);
    const path = `agg_autos_inventory?status=eq.active&select=${encodeURIComponent(select)}&order=id.asc&limit=${pageLimit}&offset=${offset}`;
    const response = await sb(path);
    if (!response.ok) {
      const error = new Error(`read_inventory_${response.status}`);
      error.stage = 'read_inventory';
      error.response = response.data;
      throw error;
    }
    const page = Array.isArray(response.data) ? response.data : [];
    rows.push(...page);
    if (page.length < pageLimit) break;
  }
  return rows;
}

async function syncAggregatedListings(options = {}) {
  const startedAt = new Date();
  const limit = Math.min(Math.max(Number(options.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const rows = await readInventory(limit);
  const results = await mapLimit(rows, CONCURRENCY, row => upsertOne(row)
    .catch(error => ({ error: String(error.message || error) })));

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];
  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    if (result.inserted) inserted++;
    else if (result.updated) updated++;
    else if (result.skipped) skipped++;
    else errors.push({ source_url: rows[index]?.source_url, result });
  }

  const finishedAt = new Date();
  const summary = {
    ok: errors.length === 0,
    scanned: rows.length,
    inserted,
    updated,
    skipped,
    errors: errors.slice(0, 20)
  };
  const logged = await sb('agg_ingest_runs', {
    method: 'POST',
    prefer: 'return=minimal',
    body: JSON.stringify({
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      source_name: 'sync-aggregated-listings',
      listings_found: rows.length,
      listings_upserted: inserted + updated,
      errors,
      notes: `Sync agg_autos_inventory active rows into legacy aggregated_listings after ${options.trigger || 'manual'}; price_amount mirrors price.`
    })
  });
  if (!logged.ok) throw new Error(`sync_run_log_${logged.status}`);
  return summary;
}

exports.handler = async (event = {}) => {
  const qs = event.queryStringParameters || {};
  try {
    const result = await syncAggregatedListings({ limit: qs.limit, trigger: qs.trigger || 'manual' });
    return json(result.ok ? 200 : 207, result);
  } catch (error) {
    return json(500, {
      ok: false,
      stage: error.stage || 'sync',
      error: String(error.message || error),
      data: error.response || null
    });
  }
};

module.exports.legacyFields = legacyFields;
module.exports.syncAggregatedListings = syncAggregatedListings;
