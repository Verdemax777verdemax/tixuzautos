const { sb } = require('../netlify/functions/_shared');

const after = Date.parse(process.argv.find(arg => arg.startsWith('--after='))?.slice(8) || '2026-07-15T00:23:00Z');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pct(count, total) {
  return total ? Math.round((count * 10000) / total) / 100 : 0;
}

async function rows(path) {
  const response = await sb(path);
  if (!response.ok) throw new Error(`${response.status}:${JSON.stringify(response.data).slice(0, 400)}`);
  return response.data || [];
}

function coverage(items) {
  const total = items.length;
  const count = predicate => items.filter(predicate).length;
  return {
    total,
    km_pct: pct(count(row => Number.isInteger(row.mileage_km)), total),
    city_pct: pct(count(row => Boolean(row.city)), total),
    date_pct: pct(count(row => Boolean(row.raw_payload?.published_at)), total),
    price_pct: pct(count(row => Number.isInteger(row.price_mxn)), total),
    image_pct: pct(count(row => Boolean(row.thumbnail_url)), total)
  };
}

async function latestCompletedRun() {
  for (let attempt = 0; attempt < 30; attempt++) {
    const latest = (await rows('agg_ingest_runs?source_name=eq.nightly_semiauto_kavak&select=*&order=started_at.desc&limit=1'))[0];
    if (latest?.finished_at && Date.parse(latest.started_at) >= after) return latest;
    await sleep(10000);
  }
  throw new Error('quality_ingest_timeout');
}

(async () => {
  const run = await latestCompletedRun();
  const inventory = await rows(`agg_autos_inventory?ingest_run_id=eq.${encodeURIComponent(run.run_id)}&select=id,source_id,external_id,title,year,price_mxn,mileage_km,city,state,thumbnail_url,source_url,raw_payload&limit=1000`);
  const registry = await rows('agg_source_registry?select=id,source_name,status,method,notes');
  const sourceById = new Map(registry.map(source => [source.id, source.source_name]));
  const grouped = new Map();
  for (const row of inventory) {
    const source = sourceById.get(row.source_id) || row.raw_payload?.source || 'Fuente desconocida';
    if (!grouped.has(source)) grouped.set(source, []);
    grouped.get(source).push(row);
  }
  const images = inventory.filter(row => row.thumbnail_url);
  const imageChecks = await Promise.all(images.map(async row => {
    try {
      const response = await fetch(row.thumbnail_url, { method: 'GET', headers: { Range: 'bytes=0-1023' } });
      return { id: row.external_id, ok: response.ok, status: response.status, content_type: response.headers.get('content-type') };
    } catch (error) {
      return { id: row.external_id, ok: false, error: error.message || String(error) };
    }
  }));
  console.log(JSON.stringify({
    deploy_url: 'https://tixuzautos.com',
    run: {
      run_id: run.run_id,
      started_at: run.started_at,
      finished_at: run.finished_at,
      queries_run: run.queries_run,
      listings_found: run.listings_found,
      listings_upserted: run.listings_upserted,
      new_listings: run.listados_nuevos,
      updated_listings: run.listados_actualizados,
      errors: run.errors,
      validation_rejection_counts: run.detalle?.validation_rejection_counts || {},
      validation_rejections: run.detalle?.validation_rejections || [],
      cleanup: run.detalle?.cleanup || {},
      coverage: coverage(inventory),
      coverage_by_source: Object.fromEntries([...grouped.entries()].map(([source, sourceRows]) => [source, coverage(sourceRows)]))
    },
    listings: inventory.map(row => ({
      source: sourceById.get(row.source_id),
      title: row.title,
      year: row.year,
      price_mxn: row.price_mxn,
      mileage_km: row.mileage_km,
      city: row.city,
      state: row.state,
      published_at: row.raw_payload?.published_at || null,
      image: row.thumbnail_url || null,
      source_url: row.source_url
    })),
    image_checks: imageChecks,
    census: registry.filter(source => /Das WeltAuto|Toyota Como Nuevos|Carmudi Mexico|ClikAuto|Odetta|Dalton Seminuevos|Grupo Plasencia/.test(source.source_name))
  }, null, 2));
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
