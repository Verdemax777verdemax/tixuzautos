const assert = require('node:assert/strict');
const backfill = require('../backfill-ubicaciones.cjs');
const autocosmos = require('../netlify/functions/autocosmos-discover.cjs');
const nightly = require('../netlify/functions/lib/nightly-ingest.cjs');

const provinceIds = {
  Puebla: '252', Michoacán: '255', Sinaloa: '234', Sonora: '232',
  Oaxaca: '257', Tamaulipas: '243', Aguascalientes: '241', Hidalgo: '248'
};
for (const [state, id] of Object.entries(provinceIds)) {
  assert.equal(autocosmos.provinceIdForState(state), id);
  const url = new URL(autocosmos.buildSearchUrl('Nissan', 'Versa', { estado: state }));
  assert.equal(url.searchParams.get('pr'), id);
}

const national = new URL(autocosmos.buildSearchUrl('Nissan', 'Versa'));
assert.equal(national.searchParams.has('pr'), false);
const page2 = new URL(autocosmos.buildSearchUrl('Toyota', 'Corolla', { estado: 'Puebla', page: 2 }));
assert.equal(page2.searchParams.get('pr'), '252');
assert.equal(page2.searchParams.get('pidx'), '2');

assert.deepEqual(
  backfill.locationFromRaw({ raw_payload: { ubicacion: 'Naucalpan de Juárez, Estado de México' } }),
  { city: 'Naucalpan de Juárez', state: 'Estado de México' }
);
assert.deepEqual(
  backfill.kavakLocationFromHtml('\\"id\\":\\"region\\",\\"title\\":\\"Ciudad\\",\\"description\\":\\"Ciudad de México\\"'),
  { city: 'Ciudad de México', state: 'Ciudad de México' }
);

assert.deepEqual(nightly.sourcesForQuery({ estado: 'Puebla' }).map(source => source.key), ['autocosmos']);
assert.equal(nightly.sourcesForQuery({ estado: null }).length, nightly.SOURCE_DEFS.length);
assert.equal(nightly.canonicalListing({
  id: 'e693fa864a9e42bfa815b3a34c787187',
  url: 'https://www.autocosmos.com.mx/auto/usado/chevrolet/spark/ltz/e693fa864a9e42bfa815b3a34c787187',
  title: 'Chevrolet Spark', city: 'Puebla', image_verified: false
}, nightly.SOURCE_DEFS.find(source => source.key === 'autocosmos'), { estado: 'Puebla' }).state, 'Puebla');

console.log('ubicaciones tests: ok');
