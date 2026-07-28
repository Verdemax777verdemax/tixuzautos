import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { runFastSearch } = require('./buscar-externos.js');

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function resultFromCar(car, query) {
  const originalUrl = String(car.url || '').trim();
  const source = String(car.portal || 'Portal externo').trim();
  const clickout = new URLSearchParams({
    to: originalUrl,
    source,
    q: query
  });

  return {
    type: 'aggregated',
    title: car.title || [car.anio, car.marca, car.modelo].filter(Boolean).join(' ') || car.modelo || 'Auto usado',
    make: car.marca || null,
    model: car.modelo || null,
    year: Number(car.anio || 0) || null,
    price_mxn: Number(car.precio || 0) || null,
    mileage_km: Number(car.km || 0) || null,
    location: car.ubicacion || null,
    city: car.city || null,
    state: car.state || null,
    version: car.version || null,
    transmission: car.transmission || null,
    seller_name: car.seller_name || null,
    seller_type: car.seller_type || null,
    published_at: car.published_at || null,
    source,
    domain: new URL(originalUrl).hostname.replace(/^www\./, ''),
    url: originalUrl,
    clickout_url: `/api/ir?${clickout.toString()}`,
    image_url: car.thumbnail_url || null,
    image_kind: car.imagen_tipo || (car.thumbnail_url ? 'real_source' : 'placeholder')
  };
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (req.method !== 'GET') return json({ error: 'Metodo no permitido' }, 405);

  const requestUrl = new URL(req.url);
  const q = String(requestUrl.searchParams.get('q') || '').trim();
  const ciudad = String(requestUrl.searchParams.get('ciudad') || '').trim();
  const debug = requestUrl.searchParams.get('debug') === '1';
  const nocache = requestUrl.searchParams.get('nocache') === '1';

  if (q.length < 3) return json({ error: 'Query muy corta', results: [] }, 400);

  try {
    const payload = await runFastSearch(q, ciudad, debug, nocache);
    const results = (payload.cars || [])
      .filter(car => car?.url && car?.portal && !/tixuzautos\.com/i.test(car.url))
      .map(car => resultFromCar(car, q));
    const domains = [...new Set(results.map(item => item.domain))];

    return json({
      results,
      count: results.length,
      domains,
      cached: Boolean(payload.cached),
      partial: Boolean(payload.partial),
      source: 'hybrid_direct',
      failed_portals: payload.failed_portals || [],
      ...(debug ? { debug: payload.debug || null } : {})
    });
  } catch (error) {
    console.error('buscar-serper failed', error);
    return json({ error: 'Busqueda no disponible ahora.', results: [] }, 502);
  }
};
