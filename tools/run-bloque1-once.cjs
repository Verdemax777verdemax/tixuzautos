const nightly = require('../netlify/functions/lib/nightly-ingest.cjs');

async function main() {
  const result = await nightly.runNightly({
    queueLimit: Number(process.env.BLOQUE1_LIMIT || 1),
    perSourceLimit: Number(process.env.BLOQUE1_PER_SOURCE || 1),
    maxRuntimeMs: Number(process.env.BLOQUE1_MAX_RUNTIME_MS || 120000)
  });
  console.log(JSON.stringify({
    ok: result.ok,
    run_id: result.run_id,
    queries_run: result.queries_run,
    listings_found: result.listings_found,
    listings_upserted: result.listings_upserted,
    new: result.listados_nuevos,
    updated: result.listados_actualizados,
    errors: result.errores,
    source_errors: result.errors,
    coverage: result.detalle.coverage,
    queries: result.detalle.queries
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
