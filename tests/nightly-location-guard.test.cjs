const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertRowsHaveCompleteLocation,
  hasCompleteLocation,
  partitionListingsByLocation
} = require('../netlify/functions/lib/nightly-ingest.cjs');

test('solo acepta fichas con ciudad y estado', () => {
  const complete = { source_url: 'https://example.test/ok', city: 'Puebla', state: 'Puebla' };
  const missingCity = { source_url: 'https://example.test/no-city', city: null, state: 'Puebla' };
  const missingState = { source_url: 'https://example.test/no-state', city: 'Morelia', state: null };

  assert.equal(hasCompleteLocation(complete), true);
  assert.equal(hasCompleteLocation(missingCity), false);
  assert.equal(hasCompleteLocation(missingState), false);

  const result = partitionListingsByLocation([complete, missingCity, missingState]);
  assert.deepEqual(result.accepted, [complete]);
  assert.deepEqual(result.rejected, [missingCity, missingState]);
});

test('la barrera final impide cualquier upsert incompleto', () => {
  assert.doesNotThrow(() => assertRowsHaveCompleteLocation([
    { source_url: 'https://example.test/ok', city: 'Guadalajara', state: 'Jalisco' }
  ]));

  assert.throws(
    () => assertRowsHaveCompleteLocation([
      { source_url: 'https://example.test/bad', city: 'Guadalajara', state: null }
    ]),
    /upsert_rejected_missing_location:1/
  );
});
