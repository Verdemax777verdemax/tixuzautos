const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'assets', 'app.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const { _test } = require('../netlify/functions/buscar.js');

test('discovery chips use structured body filters and price, never their labels as q', () => {
  assert.match(index, /setDiscoveryFilter\(\{body_type:'suv'\},'SUV'\)/);
  assert.match(index, /setDiscoveryFilter\(\{body_type:'sedan'\},'Sedán'\)/);
  assert.match(index, /setDiscoveryFilter\(\{body_type:'pickup'\},'Pickup'\)/);
  assert.match(index, /setDiscoveryFilter\(\{body_type:'hatchback'\},'Hatchback'\)/);
  assert.match(index, /setDiscoveryFilter\(\{price_max:200000\},'Hasta \$200,000'\)/);
  assert.doesNotMatch(index, /setHeroQuery\('(SUV familiar|Sedán automático|Pickup 4x4|Por marca|autos hasta 200000)'\)/);
  assert.match(app, /fetch\('\/api\/buscar\?'\+params\.toString\(\),/);
});

test('api-buscar builds indexed body and numeric price filters', () => {
  const filters = _test.structuredFilters({
    body_type: 'SUV',
    price_min: '200000',
    price_max: '350000',
  });
  assert.deepEqual(filters, { bodyType: 'suv', priceMin: 200000, priceMax: 350000 });

  const queryPath = _test.buildAggregatedPath(filters, 40, new Date('2026-07-23T00:00:00.000Z'));
  assert.match(queryPath, /vehicle_body_type=eq\.suv/);
  assert.match(queryPath, /price_amount=gte\.200000/);
  assert.match(queryPath, /price_amount=lte\.350000/);
  assert.match(queryPath, /vehicle_brand_norm,vehicle_model_norm/);
});

test('opening a listing posts to the server-side view tracker', () => {
  assert.match(app, /fetch\('\/api\/listing-view'/);
  assert.match(app, /body:JSON\.stringify\(\{listing_id:String\(car\.id\),source:'marketplace_listing',tracking:trackingContext\(\)\}\)/);
  assert.doesNotMatch(app, /client\.rpc\('increment_view'/);
});

test('cards keep publication and verification dates separate and mark direct inventory', () => {
  assert.match(app, /function listingVerificationLabel\(car\)/);
  assert.match(app, /✓ Verificado hoy/);
  assert.match(app, /✓ Tixuz Directo · WhatsApp sin comisión/);
  assert.match(app, /const clickout=trackedClickoutUrl\(c\)/);
});

test('visitor hash combines IP and user agent without retaining the IP', () => {
  const { visitorHash } = require('../netlify/functions/listing-view.js');
  const ip = '203.0.113.42';
  const hash = visitorHash(ip, 'Test Browser', 'server-only-secret');
  assert.equal(hash.length, 64);
  assert.equal(hash, visitorHash(ip, 'Test Browser', 'server-only-secret'));
  assert.notEqual(hash, visitorHash(ip, 'Other Browser', 'server-only-secret'));
  assert.equal(hash.includes(ip), false);
});
