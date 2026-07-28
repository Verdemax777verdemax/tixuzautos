const { sb, SERVICE_KEY } = require('../netlify/functions/_shared');
const automarket = require('../netlify/functions/bbva-automarket-discover.cjs');
const {
  assertRowsHaveCompleteLocation,
  canonicalListing,
  inventoryRow,
  rejectDuplicateImages
} = require('../netlify/functions/lib/nightly-ingest.cjs');

const SOURCE_DEF = {
  key: 'automarket',
  label: 'BBVA AutoMarket',
  externalId: automarket.automarketIdFromUrl,
  isVehicleUrl: automarket.isAutomarketVehicleUrl
};

async function requireOk(path, options = {}, label = 'supabase') {
  const response = await sb(path, options);
  if (!response.ok) throw new Error(`${label}_${response.status}:${JSON.stringify(response.data).slice(0, 500)}`);
  return response.data;
}

async function main() {
  if (!SERVICE_KEY) throw new Error('missing_SUPABASE_SERVICE_ROLE_KEY');
  const startedAt = new Date();
  const runId = `bbva-automarket-smoke-${startedAt.toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '')}`;
  const [source] = await requireOk(
    'agg_source_registry?or=(source_name.ilike.*bbva*,base_url.ilike.*automarket*)&select=*&limit=1',
    {},
    'source_registry'
  );
  if (!source?.id) throw new Error('bbva_source_registry_missing');

  const discovered = await automarket.discover('Chevrolet', 'Tracker', '', {
    limit: 2,
    timeoutMs: 30000,
    detailTimeoutMs: 15000
  });
  const listings = discovered.map(item => canonicalListing(item, SOURCE_DEF, {})).filter(Boolean);
  if (!listings.length) throw new Error('bbva_no_verified_listings');
  const nowIso = new Date().toISOString();
  const rows = listings.map(listing => ({
    ...inventoryRow(listing, source, runId, nowIso),
    first_seen_at: nowIso
  }));
  assertRowsHaveCompleteLocation(rows);
  await rejectDuplicateImages(rows);
  if (rows.some(row => !row.thumbnail_url || !row.price_mxn || !row.mileage_km)) {
    throw new Error('bbva_incomplete_required_fields');
  }

  await requireOk('agg_autos_inventory?on_conflict=source_id,external_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows)
  }, 'inventory_upsert');
  const finishedAt = new Date().toISOString();
  await requireOk(`agg_source_registry?id=eq.${encodeURIComponent(source.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'active', last_success_at: finishedAt, last_error: null })
  }, 'source_activate');
  await requireOk('agg_ingest_runs', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      run_id: runId,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt,
      source_name: 'BBVA AutoMarket',
      queries_run: 1,
      listings_found: rows.length,
      listings_upserted: rows.length,
      errors: [],
      notes: 'Smoke end-to-end: Puppeteer Venia catalog -> GraphQL -> SPA product detail -> inventory upsert.',
      modelos_consultados: 1,
      listados_nuevos: rows.length,
      listados_actualizados: 0,
      errores: 0,
      detalle: {
        query: 'Chevrolet Tracker',
        headless: 'puppeteer-core',
        detail_verified: rows.length,
        with_photo: rows.filter(row => row.thumbnail_url).length,
        with_price: rows.filter(row => row.price_mxn).length,
        with_mileage: rows.filter(row => row.mileage_km).length,
        with_location: rows.filter(row => row.city && row.state).length
      }
    })
  }, 'run_log');

  console.log(JSON.stringify({
    run_id: runId,
    source_id: source.id,
    status: 'active',
    upserted: rows.length,
    with_photo: rows.filter(row => row.thumbnail_url).length,
    with_price: rows.filter(row => row.price_mxn).length,
    with_mileage: rows.filter(row => row.mileage_km).length,
    with_location: rows.filter(row => row.city && row.state).length,
    listings: rows.map(row => ({
      external_id: row.external_id,
      title: row.title,
      price_mxn: row.price_mxn,
      mileage_km: row.mileage_km,
      city: row.city,
      state: row.state,
      source_url: row.source_url
    }))
  }, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify({ ok: false, error: error.message || String(error) }));
  process.exitCode = 1;
});
