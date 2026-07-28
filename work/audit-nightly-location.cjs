'use strict';

const SUPABASE_URL = 'https://rbiuoljoduekajivffzh.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!serviceKey) throw new Error('missing_service_key');

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

async function get(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status}:${JSON.stringify(body)}`);
  return body;
}

async function main() {
  const requestedRun = process.argv[2] || '';
  const runFilter = requestedRun ? `&run_id=eq.${encodeURIComponent(requestedRun)}` : '';
  const runs = await get(`agg_ingest_runs?source_name=eq.nightly_semiauto_kavak${runFilter}&select=run_id,started_at,finished_at,listados_nuevos,listados_actualizados,errores,detalle&order=started_at.desc&limit=1`);
  const run = runs[0];
  if (!run) throw new Error('nightly_run_not_found');
  const params = new URLSearchParams({
    ingest_run_id: `eq.${run.run_id}`,
    first_seen_at: `gte.${run.started_at}`,
    select: 'id,external_id,source_url,title,city,state,location,first_seen_at,last_seen_at,ingest_run_id,raw_payload',
    order: 'first_seen_at.asc',
    limit: '1000',
  });
  const rows = await get(`agg_autos_inventory?${params}`);
  const missing = rows.filter((row) => !String(row.city || '').trim() || !String(row.state || '').trim());
  const activeRows = await get('agg_autos_inventory?status=eq.active&select=id,city,state,raw_payload&limit=5000');
  const activeMissing = activeRows.filter((row) => !String(row.city || '').trim() || !String(row.state || '').trim());
  const bySource = {};
  for (const row of rows) {
    const source = row.raw_payload?.source || 'unknown';
    bySource[source] ||= { new: 0, missing_city_or_state: 0 };
    bySource[source].new++;
    if (missing.includes(row)) bySource[source].missing_city_or_state++;
  }
  console.log(JSON.stringify({
    run: {
      run_id: run.run_id,
      started_at: run.started_at,
      finished_at: run.finished_at,
      reported_new: run.listados_nuevos,
      reported_updated: run.listados_actualizados,
      errors: run.errores,
    },
    new_rows: rows.length,
    missing_city_or_state: missing.length,
    active_missing_city_or_state: activeMissing.length,
    active_missing_by_source: activeMissing.reduce((counts, row) => {
      const source = row.raw_payload?.source || 'unknown';
      counts[source] = (counts[source] || 0) + 1;
      return counts;
    }, {}),
    by_source: bySource,
    missing: missing.map((row) => ({
      id: row.id,
      title: row.title,
      url: row.source_url,
      city: row.city,
      state: row.state,
      location: row.location,
      first_seen_at: row.first_seen_at,
      ingest_run_id: row.ingest_run_id,
      source: row.raw_payload?.source,
      raw_city: row.raw_payload?.city,
      raw_state: row.raw_payload?.state,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});
