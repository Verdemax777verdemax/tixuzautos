const test = require('node:test');
const assert = require('node:assert/strict');

const autocosmos = require('../netlify/functions/autocosmos-discover.cjs');

const VEHICLE_ID = '0123456789abcdef0123456789abcdef';

function card(city = 'Guadalajara |', state = 'Jalisco') {
  return `
    <article class="listing-card">
      <a itemprop="url"
         href="/auto/usado/chevrolet/tracker/lt/${VEHICLE_ID}"
         title="Chevrolet Tracker 2023"></a>
      <span class="listing-card__brand">Chevrolet</span>
      <span class="listing-card__model">Tracker</span>
      <span class="listing-card__version">LT Automática</span>
      <span class="listing-card__year">2023</span>
      <span itemprop="price" content="389000"></span>
      <span class="listing-card__km" content="24500">24,500 km</span>
      <span class="listing-card__city">${city}</span>
      <span class="listing-card__province">${state}</span>
    </article>`;
}

test('AutoCosmos nacional toma Ciudad, Estado directamente del card', () => {
  const listing = autocosmos.parseCard(
    card(),
    'https://www.autocosmos.com.mx/auto/usado/chevrolet/tracker',
    { marca: 'Chevrolet', modelo: 'Tracker' }
  );

  assert.equal(listing.city, 'Guadalajara');
  assert.equal(listing.state, 'Jalisco');
  assert.equal(listing.ubicacion, 'Guadalajara, Jalisco');
});

test('el contexto estatal no sustituye la ubicación real del card', () => {
  const listing = autocosmos.parseCard(
    card('Monterrey |', 'Nuevo León'),
    'https://www.autocosmos.com.mx/auto/usado/chevrolet/tracker?pr=252',
    { marca: 'Chevrolet', modelo: 'Tracker', estado: 'Puebla' }
  );

  assert.equal(listing.city, 'Monterrey');
  assert.equal(listing.state, 'Nuevo León');
});
