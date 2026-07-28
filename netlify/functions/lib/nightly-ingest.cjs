const { sb, SERVICE_KEY, SUPABASE_URL } = require('../_shared');
const seminuevos = require('../seminuevos-discover.cjs');
const autocosmos = require('../autocosmos-discover.cjs');
const kavak = require('../kavak-discover.cjs');
const automarket = require('./fuentes/bbva-automarket-client.cjs');
const mercadolibre = require('./fuentes/mercadolibre-api.js');
const { withCrawlerFetch } = require('./fuentes-externas.cjs');
const { syncAggregatedListings } = require('../sync-aggregated-listings.js');
const {
  cleanText,
  integerOrNull,
  isoDateOrNull,
  normalizeCity,
  normalizeListingQuality,
  normalizeSellerType,
  normalizeState,
  normalizeTransmission,
  yearOrNull
} = require('./listing-normalize.cjs');

const DEFAULT_QUEUE_LIMIT = 25;
const DEFAULT_RUNTIME_MS = 13 * 60 * 1000;

function runId() {
  return `nightly-${new Date().toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '')}`;
}

function sourceKey(value) {
  const key = String(value || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
  if (key.includes('autocosmos')) return 'autocosmos';
  if (key.includes('mercadolibre')) return 'mercadolibre';
  if (key.includes('kavak')) return 'kavak';
  if (key.includes('bbva') || key.includes('automarket')) return 'automarket';
  if (key.includes('seminuevos') && !key.includes('nissan')) return 'seminuevos';
  return key;
}

function validPrice(value) {
  const price = integerOrNull(value);
  return price === null || (price >= 20000 && price <= 5000000);
}

function canonicalListing(car, source, context = {}) {
  const url = cleanText(car.url || car.source_url);
  const externalId = cleanText(car.id || car.external_id || source.externalId?.(url));
  if (!url || !externalId || !source.isVehicleUrl(url)) return null;
  const image = car.image_verified === true ? cleanText(car.image_url || car.thumbnail_url) : null;
  const city = normalizeCity(car.city || car.ubicacion || car.location);
  const state = normalizeState(car.state || context.estado);
  const rawPrice = car.precio ?? car.price_mxn;
  const rawMileage = car.km ?? car.mileage_km;
  const rawYear = car.anio ?? car.year ?? car.title;
  const quality = normalizeListingQuality(
    { price: rawPrice, year: rawYear, mileage: rawMileage },
    { source: source.label, priceContext: `${car.title || ''} ${car.description || car.snippet || car.raw?.snippet || ''}` }
  );
  const price = quality.price;
  if (!validPrice(price)) return null;
  const mileage = quality.mileage;
  const year = quality.year;
  const version = cleanText(car.version);
  const transmission = normalizeTransmission(car.transmission);
  const sellerName = cleanText(car.seller_name);
  const sellerType = normalizeSellerType(car.seller_type);
  const publishedAt = isoDateOrNull(car.published_at);
  const make = cleanText(car.marca || car.make);
  const model = cleanText(car.modelo || car.model);

  const qualityRejections = [...(Array.isArray(car.quality_rejections) ? car.quality_rejections : []), ...quality.rejections]
    .filter((item, index, all) => all.findIndex(other => other.field === item.field && other.reason === item.reason && other.raw_value === item.raw_value) === index);

  return {
    source_key: source.key,
    source_name: source.label,
    external_id: externalId,
    source_url: url,
    title: cleanText(car.title) || [year, make, model, version].filter(Boolean).join(' '),
    make,
    model,
    version,
    year,
    price_mxn: price,
    mileage_km: mileage,
    transmission,
    city,
    state,
    seller_name: sellerName,
    seller_type: sellerType,
    published_at: publishedAt,
    image_url: image,
    image_verified: Boolean(image),
    quality_rejections: qualityRejections,
    raw_source: car
  };
}

function hasCompleteLocation(listing) {
  return Boolean(normalizeCity(listing?.city) && normalizeState(listing?.state));
}

function partitionListingsByLocation(listings) {
  const accepted = [];
  const rejected = [];
  for (const listing of listings || []) {
    (hasCompleteLocation(listing) ? accepted : rejected).push(listing);
  }
  return { accepted, rejected };
}

function assertRowsHaveCompleteLocation(rows) {
  const incomplete = (rows || []).filter(row => !hasCompleteLocation(row));
  if (incomplete.length) {
    const sample = incomplete.slice(0, 3).map(row => row.source_url || row.external_id).join(',');
    throw new Error(`upsert_rejected_missing_location:${incomplete.length}:${sample}`);
  }
}

async function mapLimit(items, concurrency, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return out;
}

async function deepSeminuevos(query, limit) {
  const candidates = await seminuevos.discover(query.marca, query.modelo, '', { limit, timeoutMs: 30000 });
  const details = await mapLimit(candidates, 2, candidate => seminuevos.extractListing(candidate.url, {
    timeoutMs: 30000,
    fallback: { ...candidate, marca: query.marca, modelo: query.modelo }
  }));
  return {
    cars: details.filter(item => item && !item.error),
    errors: details.filter(item => item?.error).map(item => ({ url: item.url, error: item.error }))
  };
}

async function deepAutocosmos(query, limit) {
  const candidates = await autocosmos.discover(query.marca, query.modelo, '', {
    limit,
    pages: 1,
    timeoutMs: 18000,
    estado: query.estado || null
  });
  const details = await mapLimit(candidates, 2, candidate => autocosmos.extractListing(candidate.url, {
    timeoutMs: 25000,
    fallback: { ...candidate, state: candidate.state || query.estado || null }
  }));
  return {
    cars: details.filter(item => item && !item.error),
    errors: details.filter(item => item?.error).map(item => ({ url: item.url, error: item.error }))
  };
}

async function deepKavak(query, limit) {
  const cars = await kavak.discover(query.marca, query.modelo, '', {
    limit,
    candidateLimit: 30,
    maxAttempts: 1,
    timeoutMs: 25000
  });
  return { cars, errors: [] };
}

async function deepMercadoLibre(query, limit) {
  const cars = await mercadolibre.searchListings(query.marca, query.modelo, {
    limit,
    timeoutMs: 18000
  });
  return { cars, errors: [] };
}

async function deepAutomarket(query, limit) {
  const cars = await automarket.discover(query.marca, query.modelo, '', {
    limit,
    timeoutMs: 70000
  });
  return { cars, errors: [] };
}

const SOURCE_DEFS = [
  {
    key: 'mercadolibre',
    label: 'MercadoLibre Autos',
    externalId: mercadolibre.mlItemIdFromUrl,
    isVehicleUrl: mercadolibre.isMercadoLibreVehicleUrl,
    run: deepMercadoLibre,
    defaultLimit: 4
  },
  {
    key: 'seminuevos',
    label: 'Seminuevos.com',
    externalId: seminuevos.vehicleIdFromUrl,
    isVehicleUrl: seminuevos.isSeminuevosVehicleUrl,
    run: deepSeminuevos,
    defaultLimit: 2
  },
  {
    key: 'autocosmos',
    label: 'AutoCosmos',
    externalId: autocosmos.autocosmosIdFromUrl,
    isVehicleUrl: autocosmos.isAutocosmosVehicleUrl,
    run: deepAutocosmos,
    defaultLimit: 3
  },
  {
    key: 'kavak',
    label: 'Kavak',
    externalId: kavak.kavakIdFromUrl,
    isVehicleUrl: kavak.isKavakVehicleUrl,
    run: deepKavak,
    defaultLimit: 1
  },
  {
    key: 'automarket',
    label: 'BBVA AutoMarket',
    externalId: automarket.automarketIdFromUrl,
    isVehicleUrl: automarket.isAutomarketVehicleUrl,
    run: deepAutomarket,
    defaultLimit: 2
  }
];

async function getQueue(limit) {
  const path = `agg_search_queue?enabled=eq.true&select=id,marca,modelo,modelo_slug,estado,priority,last_run_at&order=last_run_at.asc.nullsfirst,estado.desc.nullslast,priority.desc,created_at.asc&limit=${limit}`;
  const response = await sb(path);
  if (!response.ok) throw new Error(`queue_${response.status}:${JSON.stringify(response.data).slice(0, 300)}`);
  return Array.isArray(response.data) ? response.data : [];
}

function sourcesForQuery(query) {
  return query.estado ? SOURCE_DEFS.filter(source => source.key === 'autocosmos') : SOURCE_DEFS;
}

async function getSourceRegistry() {
  const response = await sb('agg_source_registry?select=*');
  if (!response.ok) throw new Error(`sources_${response.status}:${JSON.stringify(response.data).slice(0, 300)}`);
  const map = new Map();
  for (const row of response.data || []) map.set(sourceKey(row.source_name || row.name || row.id), row);
  return map;
}

async function patchInventoryIds(ids, body) {
  if (!ids.length) return;
  const path = `agg_autos_inventory?id=in.(${encodeURIComponent(inList(ids))})`;
  const response = await sb(path, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`inventory_cleanup_${response.status}:${JSON.stringify(response.data).slice(0, 400)}`);
}

async function sanitizeExistingInventory(registry) {
  const sourceById = new Map();
  for (const definition of SOURCE_DEFS) {
    const row = registry.get(definition.key);
    if (row?.id) sourceById.set(row.id, definition);
  }
  const sourceIds = [...sourceById.keys()];
  if (!sourceIds.length) return { scanned: 0, expired_invalid_urls: 0, cleared_unverified_images: 0, cleared_generic_locations: 0, cleared_invalid_prices: 0, cleared_invalid_years: 0, cleared_invalid_mileage: 0 };
  const path = `agg_autos_inventory?source_id=in.(${encodeURIComponent(inList(sourceIds))})&status=eq.active&select=id,source_id,source_url,title,year,price_mxn,mileage_km,location,city,image_url,thumbnail_url,raw_payload&limit=2000`;
  const response = await sb(path);
  if (!response.ok) throw new Error(`inventory_scan_${response.status}:${JSON.stringify(response.data).slice(0, 400)}`);
  const rows = response.data || [];
  const invalid = [];
  const genericLocations = [];
  const invalidPrices = [];
  const invalidYears = [];
  const invalidMileage = [];
  for (const row of rows) {
    const source = sourceById.get(row.source_id);
    if (!source?.isVehicleUrl(row.source_url)) invalid.push(row.id);
    if (!normalizeCity(row.location) && !row.city && row.location) genericLocations.push(row.id);
    const quality = normalizeListingQuality(
      { price: row.price_mxn, year: row.year, mileage: row.mileage_km },
      { source: source?.label, priceContext: `${row.title || ''} ${row.raw_payload?.description || ''}` }
    );
    if (row.price_mxn !== null && quality.price === null) invalidPrices.push(row.id);
    if (row.year !== null && quality.year === null) invalidYears.push(row.id);
    if (row.mileage_km !== null && quality.mileage === null) invalidMileage.push(row.id);
  }
  // agg_autos_inventory currently accepts only active/sold as terminal states.
  await patchInventoryIds(invalid, { status: 'sold', expires_at: new Date().toISOString(), image_url: null, thumbnail_url: null, image_kind: 'missing' });
  await patchInventoryIds(genericLocations, { location: null });
  await patchInventoryIds(invalidPrices, { price_mxn: null });
  await patchInventoryIds(invalidYears, { year: null });
  await patchInventoryIds(invalidMileage, { mileage_km: null });
  return {
    scanned: rows.length,
    expired_invalid_urls: invalid.length,
    cleared_unverified_images: 0,
    cleared_generic_locations: genericLocations.length,
    cleared_invalid_prices: invalidPrices.length,
    cleared_invalid_years: invalidYears.length,
    cleared_invalid_mileage: invalidMileage.length
  };
}

function inList(values) {
  return values.map(value => `"${String(value).replace(/"/g, '\\"')}"`).join(',');
}

function clearRowImage(row) {
  row.image_url = null;
  row.thumbnail_url = null;
  row.image_kind = 'missing';
  row.raw_payload = {
    ...(row.raw_payload || {}),
    image_url: null,
    image_verified: false
  };
}

async function rejectDuplicateImages(rows) {
  const withImages = rows.filter(row => row.thumbnail_url);
  if (!withImages.length) return 0;
  const images = [...new Set(withImages.map(row => row.thumbnail_url))];
  const path = `agg_autos_inventory?status=eq.active&thumbnail_url=in.(${encodeURIComponent(inList(images))})&select=id,source_id,external_id,thumbnail_url`;
  const response = await sb(path);
  if (!response.ok) throw new Error(`image_duplicates_${response.status}:${JSON.stringify(response.data).slice(0, 300)}`);
  const owners = new Map();
  for (const existing of response.data || []) {
    owners.set(existing.thumbnail_url, `${existing.source_id}:${existing.external_id}`);
  }
  let rejected = 0;
  for (const row of withImages) {
    const owner = owners.get(row.thumbnail_url);
    const rowKey = `${row.source_id}:${row.external_id}`;
    if (owner && owner !== rowKey) {
      clearRowImage(row);
      rejected++;
      continue;
    }
    owners.set(row.thumbnail_url, rowKey);
  }
  return rejected;
}

async function existingRows(rows) {
  if (!rows.length) return new Map();
  const sourceIds = [...new Set(rows.map(row => row.source_id))];
  const externalIds = [...new Set(rows.map(row => row.external_id))];
  const path = `agg_autos_inventory?source_id=in.(${encodeURIComponent(inList(sourceIds))})&external_id=in.(${encodeURIComponent(inList(externalIds))})&select=source_id,external_id,first_seen_at`;
  const response = await sb(path);
  if (!response.ok) throw new Error(`existing_${response.status}:${JSON.stringify(response.data).slice(0, 400)}`);
  return new Map((response.data || []).map(row => [`${row.source_id}:${row.external_id}`, row.first_seen_at]));
}

function inventoryRow(listing, source, run, nowIso) {
  const location = [listing.city, listing.state].filter(Boolean).join(', ') || null;
  const rawPayload = {
    source: listing.source_name,
    source_url: listing.source_url,
    external_id: listing.external_id,
    make: listing.make,
    model: listing.model,
    version: listing.version,
    year: listing.year,
    price_mxn: listing.price_mxn,
    mileage_km: listing.mileage_km,
    transmission: listing.transmission,
    city: listing.city,
    state: listing.state,
    seller_name: listing.seller_name,
    seller_type: listing.seller_type,
    published_at: listing.published_at,
    image_url: listing.image_url,
    image_verified: listing.image_verified,
    quality_rejections: listing.quality_rejections,
    discovery_method: listing.raw_source?.discovery_method || null,
    extracted_at: nowIso
  };
  return {
    source_id: source.id,
    external_id: listing.external_id,
    source_url: listing.source_url,
    title: listing.title,
    make: listing.make,
    model: listing.model,
    year: listing.year,
    price_mxn: listing.price_mxn,
    mileage_km: listing.mileage_km,
    city: listing.city,
    state: listing.state,
    seller_type: listing.seller_type,
    image_url: listing.image_url,
    image_kind: listing.image_url ? 'real_source' : 'missing',
    location,
    thumbnail_url: listing.image_url,
    last_seen_at: nowIso,
    status: 'active',
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    ingest_run_id: run,
    raw_payload: rawPayload
  };
}

async function upsertRows(rows, nowIso) {
  if (!rows.length) return { newCount: 0, updatedCount: 0, upserted: 0 };
  assertRowsHaveCompleteLocation(rows);
  const existing = await existingRows(rows);
  let newCount = 0;
  let updatedCount = 0;
  for (const row of rows) {
    const key = `${row.source_id}:${row.external_id}`;
    if (existing.has(key)) {
      updatedCount++;
      row.first_seen_at = existing.get(key) || nowIso;
    } else {
      newCount++;
      row.first_seen_at = nowIso;
    }
  }
  const response = await sb('agg_autos_inventory?on_conflict=source_id,external_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows)
  });
  if (!response.ok) throw new Error(`upsert_${response.status}:${JSON.stringify(response.data).slice(0, 600)}`);
  return { newCount, updatedCount, upserted: rows.length };
}

async function touchQueue(id, timestamp) {
  const response = await sb(`agg_search_queue?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ last_run_at: timestamp })
  });
  if (!response.ok) throw new Error(`queue_touch_${response.status}`);
}

function coverage(rows) {
  const total = rows.length;
  const pct = count => total ? Math.round((count * 10000) / total) / 100 : 0;
  return {
    total,
    mileage_filled: rows.filter(row => Number.isInteger(row.mileage_km)).length,
    mileage_pct: pct(rows.filter(row => Number.isInteger(row.mileage_km)).length),
    city_filled: rows.filter(row => Boolean(row.city)).length,
    city_pct: pct(rows.filter(row => Boolean(row.city)).length),
    published_at_filled: rows.filter(row => Boolean(row.raw_payload?.published_at)).length,
    published_at_pct: pct(rows.filter(row => Boolean(row.raw_payload?.published_at)).length),
    price_filled: rows.filter(row => Number.isInteger(row.price_mxn)).length,
    price_pct: pct(rows.filter(row => Number.isInteger(row.price_mxn)).length),
    image_filled: rows.filter(row => Boolean(row.image_url)).length,
    image_pct: pct(rows.filter(row => Boolean(row.image_url)).length)
  };
}

function coverageBySource(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const source = row.raw_payload?.source || 'Fuente desconocida';
    if (!grouped.has(source)) grouped.set(source, []);
    grouped.get(source).push(row);
  }
  return Object.fromEntries([...grouped.entries()].map(([source, sourceRows]) => [source, coverage(sourceRows)]));
}

async function insertRun(payload) {
  const response = await sb('agg_ingest_runs', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`run_log_${response.status}:${JSON.stringify(response.data).slice(0, 400)}`);
}

async function updateSourceRegistry(registry, stats, finishedAt) {
  for (const source of SOURCE_DEFS) {
    const row = registry.get(source.key);
    if (!row?.id) continue;
    const sourceStats = stats[source.key];
    const errors = sourceStats.errors || [];
    const body = errors.length
      ? { last_error: errors[errors.length - 1].error.slice(0, 500) }
      : { last_success_at: finishedAt, last_error: null };
    await sb(`agg_source_registry?id=eq.${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(body)
    }).catch(() => null);
  }
}

async function runNightly(options = {}) {
  if (!SERVICE_KEY) throw new Error('missing_SUPABASE_SERVICE_ROLE_KEY');
  const startedAt = new Date();
  const startedMs = startedAt.getTime();
  const run = runId();
  const queueLimit = Math.min(Math.max(Number(options.queueLimit) || DEFAULT_QUEUE_LIMIT, 1), 30);
  const maxRuntimeMs = Math.min(Math.max(Number(options.maxRuntimeMs) || DEFAULT_RUNTIME_MS, 30000), 14 * 60 * 1000);
  const perSourceLimit = Number(options.perSourceLimit) || 0;
  const stats = Object.fromEntries(SOURCE_DEFS.map(source => [source.key, { source: source.label, queries: 0, found: 0, errors: [], validation_rejections: [] }]));
  const sourceErrors = [];
  const validationRejections = [];
  const queryDetails = [];
  const allSavedRows = [];
  let newCount = 0;
  let updatedCount = 0;
  let fatalError = null;
  let legacySync = null;
  let queue = [];
  let registry = new Map();
  let cleanup = { scanned: 0, expired_invalid_urls: 0, cleared_unverified_images: 0, cleared_generic_locations: 0, cleared_invalid_prices: 0, cleared_invalid_years: 0, cleared_invalid_mileage: 0 };

  console.log('nightly_ingest_start', JSON.stringify({ run_id: run, queue_limit: queueLimit, max_runtime_ms: maxRuntimeMs }));

  try {
    [queue, registry] = await Promise.all([getQueue(queueLimit), getSourceRegistry()]);
    if (!queue.length) throw new Error('agg_search_queue_empty');
    cleanup = await sanitizeExistingInventory(registry);

    for (const query of queue) {
      if (Date.now() - startedMs >= maxRuntimeMs) {
        queryDetails.push({ stopped: 'max_runtime', elapsed_ms: Date.now() - startedMs });
        break;
      }
      const queryLabel = `${query.marca} ${query.modelo}`.trim();
      const selectedSources = sourcesForQuery(query);
      console.log('nightly_ingest_query', JSON.stringify({ run_id: run, query: queryLabel, estado: query.estado || null, scope: query.estado ? 'state' : 'national' }));
      const sourceResults = await withCrawlerFetch(async () => {
        const settled = await Promise.allSettled(selectedSources.map(async source => {
          stats[source.key].queries++;
          const limit = perSourceLimit > 0 ? Math.min(perSourceLimit, 5) : source.defaultLimit;
          const result = await source.run(query, limit);
          const normalizedCars = (result.cars || []).map(car => canonicalListing(car, source, query)).filter(Boolean);
          const { accepted: cars, rejected: locationRejected } = partitionListingsByLocation(normalizedCars);
          const validations = [
            ...normalizedCars.flatMap(car => (car.quality_rejections || []).map(item => ({ ...item, url: car.source_url }))),
            ...locationRejected.map(car => ({
              field: 'location',
              reason: 'missing_city_or_state',
              raw_value: [car.city, car.state].filter(Boolean).join(', ') || null,
              url: car.source_url
            }))
          ];
          return { source, cars, errors: result.errors || [], validations, locationRejected: locationRejected.length };
        }));
        return settled.map((result, index) => result.status === 'fulfilled'
          ? result.value
          : { source: selectedSources[index], cars: [], errors: [{ error: String(result.reason?.message || result.reason) }] });
      });
      console.log('nightly_ingest_sources_done', JSON.stringify({ run_id: run, query: queryLabel, sources: sourceResults.map(result => ({ source: result.source.key, cars: result.cars.length, errors: result.errors.length })) }));

      const listings = [];
      const perSource = [];
      for (const result of sourceResults) {
        stats[result.source.key].found += result.cars.length;
        listings.push(...result.cars);
        for (const validation of result.validations || []) {
          const item = { source: result.source.label, query: queryLabel, url: validation.url || null, field: validation.field, reason: validation.reason, raw_value: validation.raw_value ?? null };
          stats[result.source.key].validation_rejections.push(item);
          validationRejections.push(item);
        }
        for (const error of result.errors) {
          const item = { source: result.source.label, query: queryLabel, url: error.url || null, error: String(error.error || error).slice(0, 300) };
          stats[result.source.key].errors.push(item);
          sourceErrors.push(item);
        }
        perSource.push({
          source: result.source.label,
          found: result.cars.length,
          rejected_missing_location: result.locationRejected || 0,
          errors: result.errors.length,
          validation_rejections: (result.validations || []).length
        });
      }

      const nowIso = new Date().toISOString();
      const rows = [];
      for (const listing of listings) {
        const source = registry.get(listing.source_key);
        if (!source?.id) {
          const item = { source: listing.source_name, query: queryLabel, error: 'source_registry_missing' };
          stats[listing.source_key].errors.push(item);
          sourceErrors.push(item);
          continue;
        }
        rows.push(inventoryRow(listing, source, run, nowIso));
      }

      try {
        const duplicateImagesRejected = await rejectDuplicateImages(rows);
        console.log('nightly_ingest_upsert_start', JSON.stringify({ run_id: run, query: queryLabel, rows: rows.length }));
        const saved = await upsertRows(rows, nowIso);
        newCount += saved.newCount;
        updatedCount += saved.updatedCount;
        allSavedRows.push(...rows);
        queryDetails.push({ id: query.id, query: queryLabel, estado: query.estado || null, search_scope: query.estado ? 'state' : 'national', sources: perSource, found: listings.length, upserted: saved.upserted, duplicate_images_rejected: duplicateImagesRejected });
        console.log('nightly_ingest_upsert_done', JSON.stringify({ run_id: run, query: queryLabel, upserted: saved.upserted }));
      } catch (error) {
        const item = { source: 'pipeline', query: queryLabel, error: String(error.message || error).slice(0, 500) };
        sourceErrors.push(item);
        queryDetails.push({ id: query.id, query: queryLabel, estado: query.estado || null, search_scope: query.estado ? 'state' : 'national', sources: perSource, found: listings.length, upserted: 0, error: item.error });
      }

      try {
        await touchQueue(query.id, nowIso);
      } catch (error) {
        sourceErrors.push({ source: 'queue', query: queryLabel, error: String(error.message || error).slice(0, 300) });
      }
    }
  } catch (error) {
    fatalError = String(error.message || error);
    sourceErrors.push({ source: 'pipeline', error: fatalError.slice(0, 500) });
  }

  try {
    legacySync = await syncAggregatedListings({ limit: 5000, trigger: run });
    if (!legacySync.ok) {
      throw new Error(`partial_sync:${legacySync.errors.length}`);
    }
  } catch (error) {
    const syncError = String(error.message || error).slice(0, 500);
    legacySync = { ok: false, error: syncError };
    sourceErrors.push({ source: 'sync-aggregated-listings', error: syncError });
    fatalError = fatalError || `sync-aggregated-listings:${syncError}`;
  }

  const finishedAt = new Date().toISOString();
  const processed = queryDetails.filter(item => item.id).length;
  const details = {
    queue_requested: queueLimit,
    queue_selected: queue.length,
    queue_processed: processed,
    round_robin: 'last_run_at asc nulls first, state rows first when never run, priority desc',
    sources: stats,
    queries: queryDetails,
    coverage: coverage(allSavedRows),
    coverage_by_source: coverageBySource(allSavedRows),
    validation_rejections: validationRejections,
    validation_rejection_counts: {
      prices: validationRejections.filter(item => item.field === 'price_mxn').length,
      years: validationRejections.filter(item => item.field === 'year').length,
      mileage: validationRejections.filter(item => item.field === 'mileage_km').length,
      location: validationRejections.filter(item => item.field === 'location').length
    },
    cleanup,
    sync_aggregated_listings: legacySync,
    runtime_ms: Date.now() - startedMs,
    max_runtime_ms: maxRuntimeMs,
    fatal_error: fatalError,
    supabase_url: SUPABASE_URL
  };
  const payload = {
    run_id: run,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt,
    source_name: 'nightly_semiauto_kavak',
    queries_run: processed,
    listings_found: allSavedRows.length,
    listings_upserted: newCount + updatedCount,
    errors: sourceErrors,
    notes: 'MercadoLibre official API; Seminuevos via ScraperAPI; AutoCosmos direct; Kavak JSON-LD. Only listing-owned images are persisted.',
    modelos_consultados: processed,
    listados_nuevos: newCount,
    listados_actualizados: updatedCount,
    errores: sourceErrors.length,
    detalle: details
  };

  await insertRun(payload);
  await updateSourceRegistry(registry, stats, finishedAt);
  console.log('nightly_ingest_finish', JSON.stringify({ run_id: run, queries_run: processed, upserted: newCount + updatedCount, errors: sourceErrors.length }));
  return { ok: !fatalError, ...payload };
}

module.exports = {
  SOURCE_DEFS,
  assertRowsHaveCompleteLocation,
  canonicalListing,
  coverage,
  coverageBySource,
  inventoryRow,
  hasCompleteLocation,
  partitionListingsByLocation,
  rejectDuplicateImages,
  runNightly,
  sanitizeExistingInventory,
  sourcesForQuery,
  sourceKey
};
