const { sb, json, SERVICE_KEY } = require('./_shared');
const { withCrawlerFetch } = require('./lib/fuentes-externas.cjs');
const kavak = require('./kavak-discover.cjs');

// Manual compatibility endpoint. Kavak is now part of ingesta-nocturna.

const MAX_RUNTIME_MS = 22 * 1000; // techo real: timeout de la function en netlify.toml es 26s

function runId() {
  return 'kav-' + new Date().toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .replace(/\.\d+Z$/, '')
    .slice(0, 17);
}

async function getKavakSource() {
  const res = await sb(`agg_source_registry?name=eq.Kavak&select=*&limit=1`);
  if (!res.ok || !Array.isArray(res.data) || !res.data[0]) {
    throw new Error(`kavak_source_missing:${JSON.stringify(res.data).slice(0, 200)}`);
  }
  return res.data[0];
}

async function getModels(limit) {
  const res = await sb(`agg_modelo_referencia?select=*&order=marca.asc,modelo.asc&limit=${limit}`);
  if (!res.ok) throw new Error(`modelos_${res.status}:${JSON.stringify(res.data).slice(0, 300)}`);
  return Array.isArray(res.data) ? res.data : [];
}

async function getLastProgress() {
  const res = await sb('agg_ingest_runs?source_name=eq.kavak&select=detalle,started_at&order=started_at.desc&limit=1');
  if (!res.ok || !Array.isArray(res.data) || !res.data[0]) return -1;
  const value = Number(res.data[0].detalle?.ultimo_modelo_procesado);
  return Number.isFinite(value) ? value : -1;
}

function inventoryRow(car, source, run, nowIso, expiresIso) {
  return {
    source_id: source.id,
    external_id: String(car.id || car.url),
    make: car.marca,
    model: car.modelo,
    year: car.anio,
    price_mxn: car.precio,
    mileage_km: car.km,
    location: car.ubicacion,
    thumbnail_url: car.thumbnail_url,
    source_url: car.url,
    title: car.title || `${car.anio || ''} ${car.marca || ''} ${car.modelo || ''}`.trim(),
    status: 'active',
    last_seen_at: nowIso,
    first_seen_at: nowIso,
    expires_at: expiresIso,
    ingest_run_id: run,
    raw_payload: car
  };
}

async function existingKeys(rows) {
  const keys = new Set();
  for (const row of rows) {
    const res = await sb(`agg_autos_inventory?source_id=eq.${encodeURIComponent(row.source_id)}&external_id=eq.${encodeURIComponent(row.external_id)}&select=source_id,external_id&limit=1`);
    if (res.ok && Array.isArray(res.data) && res.data.length) keys.add(`${row.source_id}:${row.external_id}`);
  }
  return keys;
}

async function upsertRows(rows) {
  if (!rows.length) return { nuevos: 0, actualizados: 0, error: null };
  const existing = await existingKeys(rows);
  const res = await sb('agg_autos_inventory?on_conflict=source_id,external_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(rows)
  });
  if (!res.ok) return { nuevos: 0, actualizados: 0, error: `upsert_${res.status}:${JSON.stringify(res.data).slice(0, 500)}` };
  let nuevos = 0;
  let actualizados = 0;
  for (const row of rows) {
    if (existing.has(`${row.source_id}:${row.external_id}`)) actualizados++;
    else nuevos++;
  }
  return { nuevos, actualizados, error: null };
}

async function insertRunLog(payload) {
  await sb('agg_ingest_runs', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(payload) });
}

exports.handler = async (event = {}) => {
  const started = Date.now();
  const run = runId();
  const qs = event.queryStringParameters || {};
  const maxModelos = Number(qs.max_modelos || qs.maxModelos || 1);
  const perModelLimit = Math.min(Number(qs.per_model_limit || qs.perModelLimit || 1) || 1, 8);
  const runtimeMs = Math.min(Number(qs.max_runtime_ms || qs.maxRuntimeMs || MAX_RUNTIME_MS) || MAX_RUNTIME_MS, MAX_RUNTIME_MS);
  const detalle = { modelos: [] };
  let modelosConsultados = 0;
  let nuevos = 0;
  let actualizados = 0;
  let errores = 0;
  let ultimoModeloProcesado = -1;

  try {
    if (!SERVICE_KEY) throw new Error('Falta SUPABASE_SERVICE_KEY o SUPABASE_SERVICE_ROLE_KEY');
    const source = await getKavakSource();
    // marca/modelo explicitos: corrida dirigida de un solo par, sin tocar el cursor de rotacion.
    let ordered;
    let startIndex = 0;
    if (qs.marca && qs.modelo) {
      ordered = [{ marca: qs.marca, modelo: qs.modelo }];
    } else {
      const [models, last] = await Promise.all([getModels(200), getLastProgress()]);
      if (!models.length) throw new Error('agg_modelo_referencia no devolvio modelos');
      startIndex = (last + 1) % models.length;
      ordered = [...models.slice(startIndex), ...models.slice(0, startIndex)];
    }

    for (let offset = 0; offset < ordered.length; offset++) {
      if (modelosConsultados >= maxModelos) { detalle.limite_modelos = maxModelos; break; }
      if (Date.now() - started > runtimeMs) { detalle.limite_tiempo = true; break; }
      const model = ordered[offset];
      const absoluteIndex = ordered.length && qs.marca && qs.modelo ? -1 : (startIndex + offset) % ordered.length;
      const marca = model.marca || model.make || model.brand;
      const modelo = model.modelo || model.model || model.modelo_slug;
      if (!marca || !modelo) continue;

      modelosConsultados++;
      ultimoModeloProcesado = absoluteIndex;

      let cars = [];
      try {
        cars = await withCrawlerFetch(() => kavak.discover(marca, modelo, '', {
          limit: perModelLimit,
          candidateLimit: 15,
          timeoutMs: 12000
        }));
      } catch (err) {
        errores++;
        detalle.modelos.push({ index: absoluteIndex, marca, modelo, ok: false, error: String(err.message || err).slice(0, 160) });
        continue;
      }

      const nowIso = new Date().toISOString();
      const expiresIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const rows = cars
        .filter(car => car.precio && car.precio >= 20000 && car.precio <= 5000000)
        .map(car => inventoryRow(car, source, run, nowIso, expiresIso));
      const saved = await upsertRows(rows);
      if (saved.error) {
        errores++;
        detalle.modelos.push({ index: absoluteIndex, marca, modelo, ok: false, error: saved.error });
      }
      nuevos += saved.nuevos;
      actualizados += saved.actualizados;
      detalle.modelos.push({ index: absoluteIndex, marca, modelo, ok: true, encontrados: rows.length, nuevos: saved.nuevos, actualizados: saved.actualizados });

      if (Date.now() - started > runtimeMs) { detalle.limite_tiempo = true; break; }
    }

    detalle.ultimo_modelo_procesado = ultimoModeloProcesado;
    const payload = {
      run_id: run,
      started_at: new Date(started).toISOString(),
      finished_at: new Date().toISOString(),
      source_name: 'kavak',
      modelos_consultados: modelosConsultados,
      listados_nuevos: nuevos,
      listados_actualizados: actualizados,
      errores,
      detalle
    };
    await insertRunLog(payload);
    if (nuevos + actualizados > 0) {
      await sb(`agg_source_registry?id=eq.${encodeURIComponent(source.id)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ last_success_at: new Date().toISOString() })
      }).catch(() => null);
    }
    return json(200, { ok: true, ...payload });
  } catch (err) {
    errores++;
    detalle.error_fatal = String(err.message || err);
    detalle.ultimo_modelo_procesado = ultimoModeloProcesado;
    const payload = {
      run_id: run,
      started_at: new Date(started).toISOString(),
      finished_at: new Date().toISOString(),
      source_name: 'kavak',
      modelos_consultados: modelosConsultados,
      listados_nuevos: nuevos,
      listados_actualizados: actualizados,
      errores,
      detalle
    };
    try { await insertRunLog(payload); } catch (_) {}
    return json(500, { ok: false, ...payload });
  }
};
