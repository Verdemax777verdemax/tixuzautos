const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { appListingUrl, page } = require('../netlify/functions/seo-listing.js');

test('appListingUrl puts the listing id in the auto query parameter', () => {
  assert.equal(
    appListingUrl('e4cce00a-1234'),
    'https://tixuzautos.com/?auto=e4cce00a-1234',
  );
});

test('SEO listing CTA uses /?auto=ID and never /auto=ID', () => {
  const rendered = page({
    id: 'listing-id-123',
    title: 'Auto de prueba',
    description: 'Auto de prueba',
    images: [],
    price: 250000,
    mileage: 10000,
    transmission: 'Automatica',
    fuelType: 'Gasolina',
    color: 'Azul',
    location: 'Mexico',
    sellerType: 'Agencia',
    url: 'https://tixuzautos.com/autos/listing-id-123',
  });

  assert.match(rendered, /href="https:\/\/tixuzautos\.com\/\?auto=listing-id-123">Abrir ficha en Tixuz<\/a>/);
  assert.doesNotMatch(rendered, /\/auto(?:%3D|=)listing-id-123/i);
});

test('netlify.toml rescues encoded and unencoded legacy paths with 301 redirects', () => {
  const toml = fs.readFileSync(path.join(__dirname, '..', 'netlify.toml'), 'utf8');
  assert.match(toml, /from = "\/auto%3D\*"[\s\S]*?to = "\/\?auto=:splat"[\s\S]*?status = 301/);
  assert.match(toml, /from = "\/auto=\*"[\s\S]*?to = "\/\?auto=:splat"[\s\S]*?status = 301/);
});
