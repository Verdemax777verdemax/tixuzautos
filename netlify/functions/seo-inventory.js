const { SITE_NAME, SITE_URL, fetchPublicListings, listingDescription, response } = require('./seo-utils.cjs');

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://rbiuoljoduekajivffzh.supabase.co').replace(/\/$/, '');
// Llave anon publica (misma que usa seo-utils.cjs); el feed es informacion publica.
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJiaXVvbGpvZHVla2FqaXZmZnpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNzc4NDYsImV4cCI6MjA4Njc1Mzg0Nn0.fvKu71jVZWfSdIVcqMrhMZqUAjswzvaOgnm6-MQpaxM';

// Comportamiento anterior: solo anuncios propios. Se conserva como respaldo
// para que inventory.json nunca quede roto aunque falle el RPC.
async function feedSoloPropios() {
  const listings = await fetchPublicListings(500);
  return {
    schemaVersion: '2026-05-29',
    generatedAt: new Date().toISOString(),
    provider: {
      name: SITE_NAME,
      url: SITE_URL,
      country: 'MX',
      language: 'es-MX',
    },
    counts: {
      listings: listings.length,
    },
    listings: listings.map((listing) => ({
      id: listing.id,
      url: listing.url,
      title: listing.title,
      make: listing.make,
      model: listing.model,
      year: listing.year,
      price: listing.price,
      priceCurrency: listing.priceCurrency,
      mileage: listing.mileage,
      transmission: listing.transmission,
      fuelType: listing.fuelType,
      color: listing.color,
      location: listing.location,
      description: listingDescription(listing),
      sellerType: listing.sellerType,
      images: listing.images,
      createdAt: listing.createdAt,
      updatedAt: listing.updatedAt,
      status: listing.status,
    })),
  };
}

exports.handler = async function () {
  try {
    // Catalogo completo para IA: propios + agregados de todos los portales,
    // con veredicto_precio y como_se_calculo (el "revisar" interno sale null).
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/tixuz_feed_ia`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_limit: 4000 }),
    });
    const feed = await r.json();
    if (!r.ok || !feed || typeof feed !== 'object' || Array.isArray(feed) || !Array.isArray(feed.anuncios)) {
      throw new Error(`RPC tixuz_feed_ia respondio ${r.status}`);
    }
    return response(200, feed);
  } catch (err) {
    // Respaldo: lo que declaraba hoy (los propios). El feed nunca queda en 500.
    try {
      return response(200, await feedSoloPropios());
    } catch (err2) {
      return response(502, {
        ok: false,
        error: 'No pude leer el inventario publico en este momento.',
        detail: err2.message,
      });
    }
  }
};
