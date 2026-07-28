const test = require('node:test');
const assert = require('node:assert/strict');

const { legacyFields } = require('../netlify/functions/sync-aggregated-listings.js');

test('legacy sync mirrors price_mxn into price and price_amount', () => {
  const payload = legacyFields({
    id: 'inventory-1',
    external_id: 'source-1',
    source_url: 'https://example.test/auto/1',
    title: 'Nissan Versa 2022',
    price_mxn: 287500,
    city: 'Puebla',
    state: 'Puebla',
    expires_at: '2026-07-26T00:00:00.000Z',
    agg_source_registry: { source_name: 'Fuente prueba' }
  });

  assert.equal(payload.price, 287500);
  assert.equal(payload.price_amount, payload.price);
  assert.equal(payload.property_type, 'auto');
  assert.equal(payload.source_name, 'Fuente prueba');
});

test('legacy sync also mirrors a missing source price as zero', () => {
  const payload = legacyFields({
    id: 'inventory-2',
    source_url: 'https://example.test/auto/2',
    title: 'Auto sin precio publicado',
    price_mxn: null,
    expires_at: '2026-07-26T00:00:00.000Z'
  });

  assert.equal(payload.price, 0);
  assert.equal(payload.price_amount, 0);
});
