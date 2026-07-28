const { sb, SERVICE_KEY } = require('../netlify/functions/_shared');
const ml = require('../netlify/functions/lib/fuentes/mercadolibre-api.js');
const {
  assertRowsHaveCompleteLocation,
  canonicalListing,
  inventoryRow,
  rejectDuplicateImages
} = require('../netlify/functions/lib/nightly-ingest.cjs');

const SOURCE_DEF = {
  key: 'mercadolibre',
  label: 'MercadoLibre',
  externalId: ml.mlItemIdFromUrl,
  isVehicleUrl: ml.isMercadoLibreVehicleUrl
};

function inList(values) {
  return values.map(value => `"${String(value).replace(/"/g, '\\"')}"`).join(',');
}

async function requireOk(path, options = {}, label = 'supabase') {
  const response = await sb(path, options);
  if (!response.ok) throw new Error(`${label}_${response.status}:${JSON.stringify(response.data).slice(0, 500)}`);
  return response.data;
}

async function main() {
  if (!SERVICE_KEY) throw new Error('missing_SUPABASE_SERVICE_ROLE_KEY');
  const startedAt = new Date();
  const runId = `mercadolibre-first-pull-${startedAt.toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '')}`;
  const sources = await requireOk(
    'agg_source_registry?or=(source_name.ilike.*mercado*,base_url.ilike.*mercado*)&select=*&limit=10',
    {},
    'source_registry'
  );
  if (!sources.length) throw new Error('mercadolibre_source_registry_missing');
  const source = sources[0];

  // OAuth is validated even when the listing-search endpoint is forbidden.
  const accessToken = await ml.getAccessToken();
  const identity = await fetch('https://api.mercadolibre.com/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!identity.ok) throw new Error(`ml_identity_${identity.status}`);

  const discovered = await ml.searchPublicCatalog('', '', { limit: 20, pages: 4, timeoutMs: 20000 });
  const listings = discovered.map(item => canonicalListing(item, SOURCE_DEF, {})).filter(Boolean);
  if (listings.length !== 20) throw new Error(`mercadolibre_expected_20_got_${listings.length}`);
  if (listings.some(item => !item.image_verified || !item.price_mxn || !item.mileage_km)) {
    throw new Error('mercadolibre_incomplete_required_fields');
  }

  const nowIso = new Date().toISOString();
  const rows = listings.map(listing => inventoryRow(listing, source, runId, nowIso));
  assertRowsHaveCompleteLocation(rows);
  await rejectDuplicateImages(rows);
  if (rows.some(row => !row.thumbnail_url)) throw new Error('mercadolibre_duplicate_or_missing_photo');

  const externalIds = rows.map(row => row.external_id);
  const existing = await requireOk(
    `agg_autos_inventory?source_id=eq.${encodeURIComponent(source.id)}&external_id=in.(${encodeURIComponent(inList(externalIds))})&select=external_id,first_seen_at`,
    {},
    'existing'
  );
  const existingMap = new Map(existing.map(row => [row.external_id, row.first_seen_at]));
  for (const row of rows) row.first_seen_at = existingMap.get(row.external_id) || nowIso;

  await requireOk('agg_autos_inventory?on_conflict=source_id,external_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows)
  }, 'inventory_upsert');

  const finishedAt = new Date().toISOString();
  await requireOk(`agg_source_registry?id=eq.${encodeURIComponent(source.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      source_name: 'MercadoLibre',
      status: 'active',
      last_success_at: finishedAt,
      last_error: null
    })
  }, 'source_activate');

  const inserted = rows.filter(row => !existingMap.has(row.external_id)).length;
  const updated = rows.length - inserted;
  const run = {
    run_id: runId,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt,
    source_name: 'MercadoLibre',
    queries_run: 1,
    listings_found: rows.length,
    listings_upserted: rows.length,
    errors: [],
    notes: 'OAuth validado; catalogo publico estructurado usado como fallback ante 403 del endpoint /sites/MLM/search.',
    modelos_consultados: 1,
    listados_nuevos: inserted,
    listados_actualizados: updated,
    errores: 0,
    detalle: {
      oauth_identity_status: identity.status,
      official_search_status: 403,
      discovery_method: 'public_catalog_card',
      with_photo: rows.filter(row => row.thumbnail_url).length,
      with_price: rows.filter(row => row.price_mxn).length,
      with_mileage: rows.filter(row => row.mileage_km).length,
      with_location: rows.filter(row => row.city && row.state).length
    }
  };
  await requireOk('agg_ingest_runs', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(run)
  }, 'run_log');

  console.log(JSON.stringify({
    run_id: runId,
    source_id: source.id,
    source_name: 'MercadoLibre',
    status: 'active',
    found: rows.length,
    inserted,
    updated,
    with_photo: run.detalle.with_photo,
    with_price: run.detalle.with_price,
    with_mileage: run.detalle.with_mileage,
    with_location: run.detalle.with_location
  }, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify({ ok: false, error: error.message || String(error) }));
  process.exitCode = 1;
});
