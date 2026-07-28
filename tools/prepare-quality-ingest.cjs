const { sb } = require('../netlify/functions/_shared');

(async () => {
  const existing = await sb('agg_search_queue?marca=ilike.Suzuki&modelo=ilike.Swift&select=*&limit=1');
  if (!existing.ok) throw new Error(`queue_read_${existing.status}`);
  const row = existing.data?.[0];
  const body = { marca: 'Suzuki', modelo: 'Swift', modelo_slug: 'swift', enabled: true, priority: 999, last_run_at: null };
  const response = row
    ? await sb(`agg_search_queue?id=eq.${encodeURIComponent(row.id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body)
    })
    : await sb('agg_search_queue', {
      method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body)
    });
  if (!response.ok) throw new Error(`queue_write_${response.status}:${JSON.stringify(response.data)}`);
  console.log(JSON.stringify({ operation: row ? 'updated' : 'inserted', row: response.data?.[0] || null }, null, 2));
})().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
