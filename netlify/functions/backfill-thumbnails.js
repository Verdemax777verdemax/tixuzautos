const { sb, json } = require('./_shared');
const seminuevos = require('./seminuevos-discover.cjs');
const autocosmos = require('./autocosmos-discover.cjs');

function sourceName(row) {
  return String(row.agg_source_registry?.source_name || row.agg_source_registry?.name || row.agg_source_registry?.label || row.source || '').toLowerCase();
}

function listingId(row) {
  const source = sourceName(row);
  if (source.includes('seminuevo')) return seminuevos.vehicleIdFromUrl(row.source_url);
  if (source.includes('autocosmos')) return autocosmos.autocosmosIdFromUrl(row.source_url);
  return null;
}

function imageFromDetail(row, detail) {
  const expectedId = listingId(row);
  if (!expectedId || detail?.id !== expectedId || detail?.image_verified !== true) return null;
  return detail?.images?.[0]?.url || detail?.thumbnail_url || detail?.image_url || null;
}

async function extract(row) {
  const source = sourceName(row);
  const fallback = {
    marca: row.make,
    modelo: row.model,
    title: row.title,
    anio: row.year,
    precio: row.price_mxn,
    km: row.mileage_km,
    ubicacion: row.location
  };
  if (source.includes('seminuevo')) {
    return seminuevos.extractListing(row.source_url, { timeoutMs: 14000, fallback });
  }
  if (source.includes('autocosmos')) {
    return autocosmos.extractListing(row.source_url, { timeoutMs: 12000, fallback });
  }
  return null;
}

async function updateImage(row, imageUrl, imageKind) {
  const patch = {
    thumbnail_url: imageUrl || null,
    image_url: imageUrl || null,
    image_kind: imageKind,
    raw_payload: {
      ...(row.raw_payload || {}),
      image_url: imageUrl || null,
      thumbnail_url: imageUrl || null,
      image_verified: Boolean(imageUrl),
      image_kind: imageKind,
      image_backfilled_at: new Date().toISOString()
    }
  };
  const res = await sb(`agg_autos_inventory?id=eq.${encodeURIComponent(row.id)}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify(patch)
  });
  if (!res.ok) throw new Error(`patch_${res.status}:${JSON.stringify(res.data).slice(0, 200)}`);
}

exports.handler = async (event = {}) => {
  const qs = event.queryStringParameters || {};
  const limit = Math.min(Math.max(Number(qs.limit || 25) || 25, 1), 50);
  const filters = ['status=eq.active', 'thumbnail_url=is.null'];
  if (qs.make) filters.push(`make=ilike.${encodeURIComponent(`*${String(qs.make).trim()}*`)}`);
  if (qs.model) filters.push(`model=ilike.${encodeURIComponent(`*${String(qs.model).trim()}*`)}`);
  if (qs.source) {
    const registry = await sb('agg_source_registry?status=eq.active&select=id,source_name,name,label');
    if (!registry.ok) return json(500, { ok: false, error: registry.data });
    const wanted = String(qs.source).trim().toLowerCase();
    const sourceIds = (registry.data || [])
      .filter(row => `${row.source_name || ''} ${row.name || ''} ${row.label || ''}`.toLowerCase().includes(wanted))
      .map(row => row.id);
    if (!sourceIds.length) return json(404, { ok: false, error: 'source_not_found' });
    filters.push(`source_id=in.(${sourceIds.map(encodeURIComponent).join(',')})`);
  }
  const filterQuery = filters.join('&');
  const beforeRes = await sb(`agg_autos_inventory?${filterQuery}&select=id`, {
    headers: { Prefer: 'count=exact' }
  });
  const before = beforeRes.ok ? (beforeRes.data || []).length : null;
  const select = 'id,source_id,source_url,title,make,model,year,price_mxn,mileage_km,location,thumbnail_url,image_url,raw_payload,agg_source_registry(source_name,name,label)';
  const res = await sb(`agg_autos_inventory?${filterQuery}&select=${encodeURIComponent(select)}&order=last_seen_at.desc&limit=${limit}`);
  if (!res.ok) return json(500, { ok: false, error: res.data });
  const rows = Array.isArray(res.data) ? res.data : [];
  const usedRes = await sb('agg_autos_inventory?status=eq.active&thumbnail_url=not.is.null&select=id,thumbnail_url&limit=5000');
  if (!usedRes.ok) return json(500, { ok: false, error: usedRes.data });
  const imageOwners = new Map((usedRes.data || []).map(row => [row.thumbnail_url, row.id]));
  const results = [];
  for (const row of rows) {
    if (!row.source_url) {
      results.push({ id: row.id, ok: false, error: 'missing_source_url' });
      continue;
    }
    try {
      const detail = await extract(row);
      let realImage = imageFromDetail(row, detail);
      const existingOwner = realImage ? imageOwners.get(realImage) : null;
      if (existingOwner && existingOwner !== row.id) realImage = null;
      await updateImage(row, realImage, realImage ? 'real_source' : 'missing');
      if (realImage) imageOwners.set(realImage, row.id);
      results.push({
        id: row.id,
        ok: Boolean(realImage),
        image_kind: realImage ? 'real_source' : 'missing',
        image_url: realImage,
        error: realImage ? null : (existingOwner ? 'image_already_used_by_another_listing' : (detail?.error || 'original_image_not_verified'))
      });
    } catch (err) {
      try {
        await updateImage(row, null, 'missing');
      } catch (_) {}
      results.push({ id: row.id, ok: false, image_kind: 'missing', image_url: null, error: String(err.message || err) });
    }
  }
  const afterRes = await sb(`agg_autos_inventory?${filterQuery}&select=id`, {
    headers: { Prefer: 'count=exact' }
  });
  return json(200, {
    ok: true,
    before_null_thumbnails: before,
    processed: rows.length,
    real_images: results.filter(r => r.image_kind === 'real_source').length,
    missing_images: results.filter(r => r.image_kind === 'missing').length,
    after_null_thumbnails: afterRes.ok ? (afterRes.data || []).length : null,
    results
  });
};
