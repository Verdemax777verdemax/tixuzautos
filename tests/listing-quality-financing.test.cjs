const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { normalizeListingQuality } = require('../netlify/functions/lib/listing-normalize.cjs');

test('rejects an AutoCosmos down payment presented as the vehicle price', () => {
  const result = normalizeListingQuality(
    { price: 109000, year: 2026, mileage: 7703 },
    {
      source: 'AutoCosmos',
      priceContext: 'Volkswagen Taos Trendline financiado en mensualidades enganche $109,000 mensualidades desde $8,335'
    }
  );

  assert.equal(result.price, null);
  assert.equal(result.rejections.some(item => item.reason === 'financing_amount_not_total_price'), true);
});

test('rejects a financed Jetta down payment above the old 100k cutoff', () => {
  const result = normalizeListingQuality(
    { price: 103795, year: 2024, mileage: 24700 },
    {
      source: 'AutoCosmos',
      priceContext: 'Volkswagen Jetta Comfortline financiado en mensualidades enganche $103,795 mensualidades desde $7,940'
    }
  );

  assert.equal(result.price, null);
});

test('keeps an explicit cash total even when financing is also mentioned', () => {
  const result = normalizeListingQuality(
    { price: 370000, year: 2024, mileage: 24700 },
    {
      source: 'AutoCosmos',
      priceContext: 'Precio de contado $370,000. Financiamiento disponible con enganche.'
    }
  );

  assert.equal(result.price, 370000);
});

test('invalidates the old search cache and keeps partial coverage honest', () => {
  const root = path.join(__dirname, '..');
  const searchSource = fs.readFileSync(path.join(root, 'netlify/functions/buscar-externos.js'), 'utf8');
  const appSource = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');

  assert.match(searchSource, /direct-v13:/);
  assert.doesNotMatch(searchSource, /direct-v12:/);
  assert.doesNotMatch(searchSource, /serper-v11-quality:/);
  assert.doesNotMatch(searchSource, /serper-v10:/);
  assert.match(appSource, /externalPartial=Boolean\(payload\.partial\);/);
  assert.doesNotMatch(appSource, /externalPartial=Boolean\(payload\.partial\)&&externalCars\.length<5/);
});
