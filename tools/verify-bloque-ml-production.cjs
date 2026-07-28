const { sb } = require('../netlify/functions/_shared');

const TARGET_SOURCES = [
  'Das WeltAuto',
  'Toyota Como Nuevos',
  'Carmudi Mexico',
  'ClikAuto',
  'Odetta',
  'Dalton Seminuevos',
  'Grupo Plasencia Seminuevos',
  'MercadoLibre Autos'
];

function pct(count, total) {
  return total ? Math.round((count * 10000) / total) / 100 : 0;
}

function coverage(rows) {
  const total = rows.length;
  const km = rows.filter(row => Number.isInteger(row.mileage_km)).length;
  const city = rows.filter(row => Boolean(row.city)).length;
  const date = rows.filter(row => Boolean(row.raw_payload?.published_at)).length;
  const image = rows.filter(row => Boolean(row.thumbnail_url)).length;
  return {
    total,
    km_filled: km,
    km_pct: pct(km, total),
    city_filled: city,
    city_pct: pct(city, total),
    date_filled: date,
    date_pct: pct(date, total),
    image_filled: image,
    image_pct: pct(image, total)
  };
}

async function rows(path) {
  const response = await sb(path);
  if (!response.ok) throw new Error(`${response.status}:${JSON.stringify(response.data).slice(0, 300)}`);
  return response.data || [];
}

(async () => {
  const latest = (await rows('agg_ingest_runs?source_name=eq.nightly_semiauto_kavak&select=*&order=started_at.desc&limit=1'))[0];
  if (!latest) throw new Error('no_ingest_run');
  const inventory = await rows(`agg_autos_inventory?ingest_run_id=eq.${encodeURIComponent(latest.run_id)}&select=id,source_id,external_id,source_url,title,year,price_mxn,mileage_km,city,state,location,thumbnail_url,image_kind,raw_payload&limit=1000`);
  const registry = await rows('agg_source_registry?select=id,source_name,status,method,notes,last_error,last_success_at');
  const sourceById = new Map(registry.map(source => [source.id, source.source_name]));
  const grouped = new Map();
  for (const row of inventory) {
    const source = sourceById.get(row.source_id) || row.raw_payload?.source || 'Fuente desconocida';
    if (!grouped.has(source)) grouped.set(source, []);
    grouped.get(source).push(row);
  }
  const imageGroups = new Map();
  for (const row of inventory) {
    if (!row.thumbnail_url) continue;
    imageGroups.set(row.thumbnail_url, [...(imageGroups.get(row.thumbnail_url) || []), row.id]);
  }
  const config = await rows('app_config?key=in.(ml_token_obtained_at,ml_token_expires_in)&select=key,value,updated_at');
  console.log(JSON.stringify({
    run: {
      run_id: latest.run_id,
      started_at: latest.started_at,
      finished_at: latest.finished_at,
      queries_run: latest.queries_run,
      listings_found: latest.listings_found,
      listings_upserted: latest.listings_upserted,
      new_listings: latest.listados_nuevos,
      updated_listings: latest.listados_actualizados,
      errors: latest.errors,
      coverage: coverage(inventory),
      coverage_by_source: Object.fromEntries([...grouped.entries()].map(([source, sourceRows]) => [source, coverage(sourceRows)])),
      duplicate_image_groups: [...imageGroups.values()].filter(ids => ids.length > 1).length
    },
    listings: inventory.map(row => ({
      source: sourceById.get(row.source_id),
      id: row.external_id,
      title: row.title,
      year: row.year,
      price_mxn: row.price_mxn,
      mileage_km: row.mileage_km,
      city: row.city,
      state: row.state,
      version: row.raw_payload?.version || null,
      transmission: row.raw_payload?.transmission || null,
      seller_name: row.raw_payload?.seller_name || null,
      published_at: row.raw_payload?.published_at || null,
      image: Boolean(row.thumbnail_url),
      source_url: row.source_url
    })),
    census: registry
      .filter(source => TARGET_SOURCES.includes(source.source_name))
      .map(source => ({ source: source.source_name, status: source.status, method: source.method, notes: source.notes })),
    ml_token_metadata: Object.fromEntries(config.map(row => [row.key, row.value]))
  }, null, 2));
})().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
