const assert = require('node:assert/strict');
const seminuevos = require('../netlify/functions/seminuevos-discover.cjs');
const autocosmos = require('../netlify/functions/autocosmos-discover.cjs');
const kavak = require('../netlify/functions/kavak-discover.cjs');
const ml = require('../netlify/functions/lib/fuentes/mercadolibre-api.js');
const normalize = require('../netlify/functions/lib/listing-normalize.cjs');
const external = require('../netlify/functions/lib/fuentes-externas.cjs');

const seminuevosUrl = 'https://www.seminuevos.com/vehicle/autos-chevrolet-aveo-puebla-2023/123456';
const seminuevosHtml = `
<script type="application/ld+json">${JSON.stringify({
  '@type': 'Car',
  name: '2023 Chevrolet Aveo LT',
  brand: { '@type': 'Brand', name: 'Chevrolet' },
  model: 'Aveo',
  vehicleModelDate: '2023',
  vehicleConfiguration: 'LT',
  vehicleTransmission: 'Manual',
  mileageFromOdometer: { value: 44123 },
  datePosted: '2026-07-01T15:30:00-06:00',
  image: 'https://images.latamautos.com/123456/photo.jpg',
  offers: {
    price: 219000,
    seller: { '@type': 'Organization', name: 'Agencia Puebla', address: { addressLocality: 'Puebla', addressRegion: 'Puebla' } }
  }
})}</script>
<p>Transmision</p><p>Automatica</p><p>Kilometraje</p><p>999999 km</p>`;
const semi = seminuevos.parseListingHtml(seminuevosHtml, seminuevosUrl, {});
assert.equal(semi.km, 44123);
assert.equal(semi.transmission, 'Manual');
assert.equal(semi.city, 'Puebla');
assert.equal(semi.seller_name, 'Agencia Puebla');
assert.equal(semi.published_at, '2026-07-01T21:30:00.000Z');
assert.equal(semi.image_source, 'listing_jsonld');

const autocosmosUrl = 'https://www.autocosmos.com.mx/auto/usado/chevrolet/aveo/lt/0123456789abcdef0123456789abcdef';
const autocosmosHtml = `
<script type="application/ld+json">${JSON.stringify({
  '@type': 'Vehicle',
  name: 'Chevrolet Aveo LT usado',
  brand: { name: 'Chevrolet' },
  model: { name: 'Aveo' },
  vehicleModelDate: 2024,
  vehicleConfiguration: 'LT Plus',
  vehicleTransmission: 'Automatico',
  mileageFromOdometer: { value: 15200 },
  datePublished: '2026-06-28T10:00:00Z',
  image: 'https://acroadtrip.blob.core.windows.net/publicaciones-imagenes/Large/chevrolet/aveo/mx/unit.webp',
  offers: {
    price: 245000,
    seller: { '@type': 'Organization', name: 'Autos Centro', address: { addressLocality: 'Monterrey', addressRegion: 'Nuevo Leon' } }
  }
})}</script>
<meta property="dfp_city" content="Mexico"><meta property="og:image" content="https://example.com/placeholder.jpg">`;
const auto = autocosmos.parseDetail(autocosmosHtml, autocosmosUrl, {});
assert.equal(auto.km, 15200);
assert.equal(auto.version, 'LT Plus');
assert.equal(auto.transmission, 'Automatica');
assert.equal(auto.city, 'Monterrey');
assert.equal(auto.seller_name, 'Autos Centro');
assert.equal(auto.published_at, '2026-06-28T10:00:00.000Z');
assert.equal(auto.image_source, 'listing_jsonld');

const kavakCar = kavak.parseCar({
  '@type': 'Car',
  name: 'Nissan Versa Advance',
  brand: { name: 'Nissan' },
  model: { name: 'Versa' },
  vehicleModelDate: 2022,
  dateCreated: '2026-06-20T12:00:00Z',
  image: 'https://images.prd.kavak.io/images/versa.webp',
  additionalProperty: [
    { name: 'version', value: 'Advance' },
    { name: 'transmission', value: 'CVT' },
    { name: 'kilometraje', value: '38,500 km' }
  ],
  offers: { price: 280000, seller: { '@type': 'Organization', name: 'Kavak', address: { addressLocality: 'Tlalnepantla', addressRegion: 'Estado de Mexico' } } }
}, 'https://www.kavak.com/mx/usado/nissan-versa-advance-2022', {});
assert.equal(kavakCar.km, 38500);
assert.equal(kavakCar.version, 'Advance');
assert.equal(kavakCar.transmission, 'CVT');
assert.equal(kavakCar.city, 'Tlalnepantla');
assert.equal(kavakCar.published_at, '2026-06-20T12:00:00.000Z');

const mlListing = ml.mapListing({
  id: 'MLM1234567890',
  permalink: 'https://auto.mercadolibre.com.mx/MLM-1234567890-chevrolet-aveo-_JM',
  seller: { nickname: 'AUTOS_PRUEBA' },
  discovery_method: 'official_search_api'
}, {
  id: 'MLM1234567890',
  permalink: 'https://auto.mercadolibre.com.mx/MLM-1234567890-chevrolet-aveo-_JM',
  title: 'Chevrolet Aveo LT 2021',
  price: 199000,
  date_created: '2026-07-02T14:00:00Z',
  location: { city: { name: 'Guadalajara' }, state: { name: 'Jalisco' } },
  attributes: [
    { id: 'BRAND', value_name: 'Chevrolet' },
    { id: 'MODEL', value_name: 'Aveo' },
    { id: 'VEHICLE_YEAR', value_name: '2021' },
    { id: 'KILOMETERS', value_name: '55,000 km' },
    { id: 'TRIM', value_name: 'LT' },
    { id: 'TRANSMISSION', value_name: 'Manual' }
  ],
  pictures: [{ secure_url: 'https://http2.mlstatic.com/D_NQ_NP_example-F.jpg' }]
}, null, {});
assert.equal(mlListing.km, 55000);
assert.equal(mlListing.version, 'LT');
assert.equal(mlListing.transmission, 'Manual');
assert.equal(mlListing.city, 'Guadalajara');
assert.equal(mlListing.seller_name, 'AUTOS_PRUEBA');
assert.equal(mlListing.published_at, '2026-07-02T14:00:00.000Z');
assert.equal(mlListing.image_verified, true);
assert.equal(mlListing.image_source, 'item_pictures');

assert.equal(ml.normalizePicture('https://http2.mlstatic.com/D_NQ_NP_123-I.jpg'), 'https://http2.mlstatic.com/D_NQ_NP_123-O.jpg');

const recentCheap = normalize.normalizeListingQuality({ price: 39999, year: 2024, mileage: 12345 }, { currentYear: 2026, source: 'test' });
assert.equal(recentCheap.price, null);
assert.equal(recentCheap.rejections[0].reason, 'recent_vehicle_price_below_40000');

const financing = normalize.normalizeListingQuality(
  { price: 56196, year: 2019, mileage: 47976 },
  { currentYear: 2026, source: 'AutoCosmos', priceContext: 'Inversion inicial desde $56,196 y comodas mensualidades' }
);
assert.equal(financing.price, null);
assert.equal(financing.rejections[0].reason, 'financing_amount_not_total_price');

const impossible = normalize.normalizeListingQuality({ price: 200000, year: 2028, mileage: 0 }, { currentYear: 2026, source: 'test' });
assert.equal(impossible.year, null);
assert.equal(impossible.rejections[0].reason, 'year_above_current_plus_one');

const impossibleKm = normalize.normalizeListingQuality({ price: 200000, year: 2020, mileage: 500001 }, { currentYear: 2026, source: 'test' });
assert.equal(impossibleKm.mileage, null);
assert.equal(impossibleKm.rejections[0].reason, 'mileage_above_500000');

assert.equal(external.totalPriceFromSearchText('Inversion inicial desde $56,196 y mensualidades comodas'), null);
assert.equal(external.totalPriceFromSearchText('Suzuki Swift precio $229,000. Credito disponible.'), 229000);

const autoTotalPrice = autocosmos.parseDetail(`
  <meta property="og:title" content="Suzuki Swift usado (2019) precio $229,000">
  <meta property="og:description" content="Inversion inicial desde $56,196 y mensualidades">
  <strong itemprop="price" content="229000">$229,000</strong>
  <meta name="dfp_marca" content="suzuki"><meta name="dfp_modelo" content="swift"><meta name="dfp_anio" content="2019">
`, 'https://www.autocosmos.com.mx/auto/usado/suzuki/swift/glx/0123456789abcdef0123456789abcdef', {});
assert.equal(autoTotalPrice.precio, 229000);

const fresh = { accessToken: 'a', refreshToken: 'r', obtainedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), expiresIn: 21600 };
const stale = { ...fresh, obtainedAt: new Date(Date.now() - 5.6 * 60 * 60 * 1000).toISOString() };
assert.equal(ml.tokenNeedsRefresh(fresh), false);
assert.equal(ml.tokenNeedsRefresh(stale), true);

console.log('Bloque ML + datos ricos tests: OK');
