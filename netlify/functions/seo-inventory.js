const { SITE_NAME, SITE_URL, fetchPublicListings, listingDescription, response } = require('./seo-utils.cjs');

exports.handler = async function () {
  try {
    const listings = await fetchPublicListings(500);
    return response(200, {
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
    });
  } catch (err) {
    return response(502, {
      ok: false,
      error: 'No pude leer el inventario publico en este momento.',
      detail: err.message,
    });
  }
};
