const assert = require('node:assert/strict');
const seminuevos = require('../netlify/functions/seminuevos-discover.cjs');
const autocosmos = require('../netlify/functions/autocosmos-discover.cjs');
const kavak = require('../netlify/functions/kavak-discover.cjs');
const normalize = require('../netlify/functions/lib/listing-normalize.cjs');
const nightly = require('../netlify/functions/lib/nightly-ingest.cjs');

const semiUrl = 'https://www.seminuevos.com/vehicle/nissan-versa-monterrey-2022/4785387';
const semiHtml = `
  <title>Nissan Versa 2022 | Seminuevos.com</title>
  <meta name="description" content="Conoce el Nissan Versa 2022 en Nuevo Leon. Precio: $229,000.">
  <span>Marca</span></div><p>Nissan</p>
  <span>Modelo</span></div><p>Versa</p>
  <span>Version</span></div><p>1.6 Sense TM</p>
  <span>Transmision</span></div><p>Manual</p>
  <span>Ciudad</span></div><p>Monterrey</p>
  <span>Recorrido</span></div><p>77,000 Kms.</p>
  <span>Precio contado</span></div><p>$229,000</p>
  <a href="/dealers-profile/roga-motors/8770"><h3>ROGA MOTORS</h3></a>
  <img src="https://images.latamautos.com/thumbs/w/lg/a/9999999/o_o/pt_9999999_other.jpeg">
  <img src="https://images.latamautos.com/thumbs/w/lg/a/4785387/o_o/pt_4785387_original.jpeg">
`;
const semi = seminuevos.parseListingHtml(semiHtml, semiUrl, {});
assert.equal(semi.km, 77000);
assert.equal(semi.city, 'Monterrey');
assert.equal(semi.version, '1.6 Sense TM');
assert.equal(semi.transmission, 'Manual');
assert.equal(semi.seller_name, 'ROGA MOTORS');
assert.match(semi.image_url, /4785387/);
assert.doesNotMatch(semi.image_url, /9999999/);

const noOwnPhoto = seminuevos.parseListingHtml(
  semiHtml.replace(/<img src="https:\/\/images\.latamautos\.com\/thumbs\/w\/lg\/a\/4785387[^>]+>/, ''),
  semiUrl,
  {}
);
assert.equal(noOwnPhoto.image_url, null);

const autoUrl = 'https://www.autocosmos.com.mx/auto/usado/nissan/versa/sense/18f15b06baba42288876827c8def9d15';
const autoHtml = `
  <meta property="og:title" content="Nissan Versa Sense usado (2024) precio $295,000">
  <meta property="og:description" content="Nissan Versa usado en Coacalco Estado de Mexico. En venta por Go-On">
  <meta property="og:image" content="https://acroadtrip.blob.core.windows.net/publicaciones-imagenes/Large/nissan/versa/mx/own.webp">
  <meta name="dfp_marca" content="nissan"><meta name="dfp_modelo" content="versa">
  <meta name="dfp_version" content="sense aut"><meta name="dfp_anio" content="2024">
  <meta name="dfp_privado" content="empresa">
  <span itemprop="addressLocality">Coacalco</span><span itemprop="addressRegion">Estado de Mexico</span>
  <span itemprop="mileageFromOdometer" content="KMT 8208">8208 km</span>
  <div class="seller-name-container"><strong>Go-On</strong></div>
`;
const auto = autocosmos.parseDetail(autoHtml, autoUrl, {});
assert.equal(auto.km, 8208);
assert.equal(auto.city, 'Coacalco');
assert.equal(auto.state, 'Estado de Mexico');
assert.equal(auto.transmission, 'Automatica');
assert.equal(auto.seller_name, 'Go-On');
assert.equal(auto.seller_type, 'dealer');
assert.equal(auto.image_verified, true);

const kavakUrl = 'https://www.kavak.com/mx/usado/nissan-versa-16_drive_auto-sedan-2018';
const kavakCar = kavak.parseCar({
  '@type': 'Car',
  name: 'Nissan Versa 2018',
  brand: { name: 'Nissan' },
  model: 'Versa',
  vehicleConfiguration: 'EXCLUSIVE AUTO',
  vehicleTransmission: 'Automatico',
  vehicleModelDate: '2018',
  mileageFromOdometer: { value: 133478 },
  offers: { price: 155999 },
  image: ['https://images.prd.kavak.io/images/526214/original.jpeg']
}, kavakUrl);
assert.equal(kavakCar.city, null);
assert.equal(kavakCar.transmission, 'Automatica');
assert.equal(kavakCar.seller_name, 'Kavak');
assert.equal(kavakCar.image_verified, true);

assert.equal(normalize.normalizeCity('Mexico'), null);
assert.equal(normalize.isoDateOrNull('Hoy'), null);
assert.equal(normalize.isoDateOrNull('2026-07-01'), '2026-07-01T00:00:00.000Z');

const canonical = nightly.canonicalListing(auto, nightly.SOURCE_DEFS.find(source => source.key === 'autocosmos'));
assert.equal(canonical.city, 'Coacalco');
assert.equal(canonical.image_verified, true);
assert.equal(canonical.published_at, null);

console.log('Bloque 1 parser tests: OK');
