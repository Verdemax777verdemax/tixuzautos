const { sb, json } = require('./_shared');
const { fetchPublicListings } = require('./seo-utils.cjs');

function norm(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function matches(text, q) {
  const tokens = norm(q).split(/\s+/).filter(t => t.length >= 2);
  const hay = norm(text);
  return !tokens.length || tokens.every(t => hay.includes(t));
}

function queryTokens(q) {
  const stop = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'para', 'con', 'en', 'un', 'una']);
  return norm(q).split(/\s+/).filter(t => t.length >= 2 && !stop.has(t));
}

function searchTokens(q) {
  return String(q || '').split(/\s+/).filter(Boolean);
}

function ownToResult(row) {
  return {
    type: 'marketplace',
    badge: 'Vendedor directo',
    id: row.id,
    title: `${row.year || ''} ${row.make || ''} ${row.model || ''}`.trim(),
    make: row.make,
    model: row.model,
    year: row.year,
    price_mxn: row.price,
    mileage_km: row.mileage,
    location: row.location,
    image_url: row.images?.[0] || null,
    url: row.url,
    precio_veredicto: null,
    precio_metodo: null,
    precio_n: null,
    precio_mediana: null
  };
}

function aggToResult(row) {
  const source = row.source || row.source_name || 'Fuente externa';
  const tracking = `/.netlify/functions/ir?to=${encodeURIComponent(row.source_url)}&source=${encodeURIComponent(source)}`;
  return {
    type: 'aggregated',
    badge: `Fuente: ${source}`,
    id: row.id,
    title: row.title,
    make: row.vehicle_brand_norm || row.vehicle_brand || null,
    model: row.vehicle_model_norm || row.vehicle_model || null,
    year: row.vehicle_year || null,
    mileage_km: row.vehicle_km || null,
    transmission: row.vehicle_transmission || null,
    body_type: row.vehicle_body_type || null,
    price_mxn: Number(row.price || row.price_amount || 0),
    location: [row.city, row.state].filter(Boolean).join(', '),
    image_url: row.image_url || row.main_image_url || null,
    url: tracking,
    original_url: row.source_url,
    source,
    image_kind: row.image_url || row.main_image_url ? 'real_source' : 'placeholder',
    expires_at: row.expires_at,
    precio_veredicto: row.precio_veredicto || null,
    precio_metodo: row.precio_metodo || null,
    precio_n: row.precio_n || null,
    precio_mediana: row.precio_mediana || null
  };
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

function structuredFilters(params = {}) {
  const allowedBodyTypes = new Set(['suv', 'sedan', 'hatchback', 'pickup', 'van', 'otro']);
  const bodyType = norm(params.body_type || params.vehicle_body_type);
  const priceMin = positiveNumber(params.price_min);
  const priceMax = positiveNumber(params.price_max);
  return {
    bodyType: allowedBodyTypes.has(bodyType) ? bodyType : null,
    priceMin,
    priceMax,
  };
}

function buildAggregatedPath(filters, limit, now = new Date(), q = '') {
  const query = [
    'active=eq.true',
    `expires_at=gt.${encodeURIComponent(now.toISOString())}`,
  ];
  if (filters.bodyType) query.push(`vehicle_body_type=eq.${encodeURIComponent(filters.bodyType)}`);
  if (filters.priceMin) query.push(`price_amount=gte.${filters.priceMin}`);
  if (filters.priceMax) query.push(`price_amount=lte.${filters.priceMax}`);

  // Búsqueda por texto EN LA BASE, no en memoria sobre una ventana truncada.
  for (const token of searchTokens(q)) {
    const limpio = token.replace(/[^a-z0-9ñáéíóú]/gi, '');
    if (limpio.length < 2) continue;
    const patron = encodeURIComponent(`*${limpio}*`);
    query.push(`or=(title.ilike.${patron},vehicle_brand.ilike.${patron},vehicle_model.ilike.${patron},city.ilike.${patron},state.ilike.${patron},source.ilike.${patron})`);
  }

  const select = [
    'id', 'source', 'source_name', 'source_url', 'title', 'price', 'price_amount',
    'city', 'state', 'image_url', 'main_image_url', 'expires_at',
    'vehicle_body_type', 'vehicle_brand', 'vehicle_model', 'vehicle_brand_norm',
    'vehicle_model_norm', 'vehicle_year', 'vehicle_km', 'vehicle_transmission',
    'precio_veredicto', 'precio_mediana', 'precio_n', 'precio_delta_pct',
    'precio_rango_min', 'precio_rango_max', 'precio_metodo',
  ].join(',');
  query.push(`select=${select}`);
  query.push('order=captured_at.desc.nullslast');
  query.push(`limit=${Math.min(Math.max(limit * 3, 300), 1000)}`);
  return `aggregated_listings?${query.join('&')}`;
}

async function logNoResult(q) {
  if (!q) return;
  await sb('agg_busquedas_sin_resultado', {
    method: 'POST',
    prefer: 'return=minimal',
    body: JSON.stringify({ query: q })
  }).catch(() => null);
}

function scoreSuggestion(row, tokens) {
  const title = norm(`${row.title} ${row.source} ${row.city} ${row.state}`);
  let score = 0;
  for (const token of tokens) {
    if (title.includes(token)) score += 3;
    if (title.startsWith(token)) score += 2;
  }
  if (row.image_url || row.main_image_url) score += 1;
  return score;
}

// Regla de diversidad de fuentes (spec de Lalo): en los primeros `windowSize`
// resultados agregados, máx `maxPerSource` por fuente, intercalados round-robin.
// El resto (extras de una fuente dominante) se agrega después, no antes.
function diversifyBySource(rows, maxPerSource, windowSize) {
  const bySource = new Map();
  const sourceOrder = [];
  for (const row of rows) {
    const src = row.source || row.source_name || 'Fuente externa';
    if (!bySource.has(src)) { bySource.set(src, []); sourceOrder.push(src); }
    bySource.get(src).push(row);
  }
  const interleaved = [];
  const counts = new Map(sourceOrder.map(s => [s, 0]));
  let progressed = true;
  while (progressed && interleaved.length < windowSize) {
    progressed = false;
    for (const src of sourceOrder) {
      if (interleaved.length >= windowSize) break;
      if (counts.get(src) >= maxPerSource) continue;
      const bucket = bySource.get(src);
      if (bucket.length) {
        interleaved.push(bucket.shift());
        counts.set(src, counts.get(src) + 1);
        progressed = true;
      }
    }
  }
  const leftover = [];
  for (const src of sourceOrder) leftover.push(...bySource.get(src));
  return [...interleaved, ...leftover];
}

exports.handler = async (event = {}) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  const q = String(event.queryStringParameters?.q || '').trim();
  const limit = Math.min(Number(event.queryStringParameters?.limit || 40) || 40, 100);
  const filters = structuredFilters(event.queryStringParameters);
  const hasStructuredFilter = Boolean(filters.bodyType || filters.priceMin || filters.priceMax);
  const started = Date.now();

  const ownAll = await fetchPublicListings(100).catch(() => []);
  const own = (filters.bodyType ? [] : ownAll)
    .filter(row => matches(`${row.make} ${row.model} ${row.year} ${row.location} ${row.description}`, q))
    .filter(row => !filters.priceMin || Number(row.price || 0) >= filters.priceMin)
    .filter(row => !filters.priceMax || Number(row.price || 0) <= filters.priceMax)
    .slice(0, Math.min(12, limit))
    .map(ownToResult);

  const aggRes = await sb(buildAggregatedPath(filters, limit, new Date(), q));
  let allAgg = (aggRes.ok && Array.isArray(aggRes.data)) ? aggRes.data : [];
  if (q && allAgg.length === 0) {
    const respaldo = await sb(buildAggregatedPath(filters, 1000, new Date(), ''));
    allAgg = (respaldo.ok && Array.isArray(respaldo.data)) ? respaldo.data : [];
  }
  const matchedAgg = allAgg.filter(row => matches(`${row.title} ${row.source} ${row.city} ${row.state}`, q));
  const diversifyWindow = Math.max(0, 12 - own.length);
  const aggregated = diversifyBySource(matchedAgg, 3, diversifyWindow)
    .slice(0, Math.max(0, limit - own.length))
    .map(aggToResult);
  const count = own.length + aggregated.length;
  let suggestions = [];
  if (q && count === 0) {
    await logNoResult(q);
    const tokens = queryTokens(q);
    suggestions = allAgg
      .map(row => ({ row, score: scoreSuggestion(row, tokens) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(item => aggToResult(item.row));
  }

  return json(200, {
    ok: true,
    q,
    count,
    marketplace_count: own.length,
    aggregated_count: aggregated.length,
    results: [...own, ...aggregated],
    zero_results: Boolean((q || hasStructuredFilter) && count === 0),
    filters: {
      body_type: filters.bodyType,
      price_min: filters.priceMin,
      price_max: filters.priceMax,
    },
    suggestions,
    elapsed_ms: Date.now() - started
  });
};

exports._test = { structuredFilters, buildAggregatedPath };
