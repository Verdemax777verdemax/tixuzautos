const { sb } = require('../netlify/functions/_shared');
const seminuevos = require('../netlify/functions/seminuevos-discover.cjs');
const autocosmos = require('../netlify/functions/autocosmos-discover.cjs');
const kavak = require('../netlify/functions/kavak-discover.cjs');

async function rows(path) {
  const response = await sb(path);
  if (!response.ok) throw new Error(`${response.status}:${JSON.stringify(response.data).slice(0, 500)}`);
  return response.data || [];
}

function sourceKey(name) {
  const key = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (key.includes('autocosmos')) return 'autocosmos';
  if (key.includes('kavak')) return 'kavak';
  if (key.includes('seminuevos') && !key.includes('nissan')) return 'seminuevos';
  return key;
}

function imageMatches(source, listing) {
  if (!listing.image_url) return true;
  if (source === 'seminuevos') return seminuevos.isListingImage(listing.source_url, listing.image_url);
  if (source === 'autocosmos') {
    try { return new URL(listing.image_url).hostname === 'acroadtrip.blob.core.windows.net'; } catch (_) { return false; }
  }
  if (source === 'kavak') {
    try { return new URL(listing.image_url).hostname === 'images.prd.kavak.io'; } catch (_) { return false; }
  }
  return false;
}

async function main() {
  const latest = (await rows('agg_ingest_runs?source_name=eq.nightly_semiauto_kavak&select=*&order=started_at.desc&limit=1'))[0];
  if (!latest) throw new Error('No nightly run found');
  const listings = await rows(`agg_autos_inventory?ingest_run_id=eq.${encodeURIComponent(latest.run_id)}&select=source_id,external_id,source_url,title,make,model,year,price_mxn,mileage_km,city,state,seller_type,image_url,image_kind,status,raw_payload`);
  const registry = await rows('agg_source_registry?select=id,source_name');
  const byId = new Map(registry.map(source => [source.id, sourceKey(source.source_name)]));
  const imageCounts = new Map();
  for (const listing of listings) {
    if (!listing.image_url) continue;
    imageCounts.set(listing.image_url, (imageCounts.get(listing.image_url) || 0) + 1);
  }
  const invalidImages = listings.filter(listing => !imageMatches(byId.get(listing.source_id), listing));
  const duplicateImages = [...imageCounts.entries()].filter(([, count]) => count > 1);
  console.log(JSON.stringify({
    run: {
      run_id: latest.run_id,
      started_at: latest.started_at,
      finished_at: latest.finished_at,
      queries_run: latest.queries_run,
      listings_found: latest.listings_found,
      listings_upserted: latest.listings_upserted,
      new: latest.listados_nuevos,
      updated: latest.listados_actualizados,
      errors: latest.errores,
      coverage: latest.detalle?.coverage || null,
      cleanup: latest.detalle?.cleanup || null,
      source_errors: latest.errors || []
    },
    listings: listings.map(listing => ({
      source: byId.get(listing.source_id),
      external_id: listing.external_id,
      source_url: listing.source_url,
      year: listing.year,
      price_mxn: listing.price_mxn,
      mileage_km: listing.mileage_km,
      city: listing.city,
      state: listing.state,
      version: listing.raw_payload?.version || null,
      transmission: listing.raw_payload?.transmission || null,
      seller_name: listing.raw_payload?.seller_name || null,
      seller_type: listing.seller_type,
      published_at: listing.raw_payload?.published_at || null,
      image_url: listing.image_url,
      image_verified: listing.raw_payload?.image_verified === true,
      status: listing.status
    })),
    integrity: {
      duplicate_image_urls: duplicateImages,
      invalid_listing_images: invalidImages.map(listing => listing.source_url),
      all_source_urls_individual: listings.every(listing => {
        const source = byId.get(listing.source_id);
        if (source === 'seminuevos') return seminuevos.isSeminuevosVehicleUrl(listing.source_url);
        if (source === 'autocosmos') return autocosmos.isAutocosmosVehicleUrl(listing.source_url);
        if (source === 'kavak') return kavak.isKavakVehicleUrl(listing.source_url);
        return false;
      })
    }
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
