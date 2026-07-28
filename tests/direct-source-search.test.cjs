const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const seminuevos = require('../netlify/functions/seminuevos-discover.cjs');

test('Seminuevos search cards provide price, mileage, transmission and owned image', () => {
  const html = `
    <div class="group block">
      <a aria-label="Ver Volkswagen Jetta 2023" href="/vehicle/autos-volkswagen-jetta-leon-2023/4812352">
        <img src="https://images.latamautos.com/thumbs/w/300x177xC/cars/4812352/o_o/4812352_1.jpg" alt="Volkswagen Jetta 2023" />
      </a>
      <span class="truncate">León</span>
      <p>2023</p>
      <span>32,500 km</span><span>·</span><span>Automática</span>
      <span>$389,900</span>
    </div>`;

  const cars = seminuevos.candidatesFromSearchHtml(html, 'Volkswagen', 'Jetta', 5);
  assert.equal(cars.length, 1);
  assert.equal(cars[0].precio, 389900);
  assert.equal(cars[0].km, 32500);
  assert.equal(cars[0].transmission, 'Automatica');
  assert.equal(cars[0].city, 'León');
  assert.equal(cars[0].image_verified, true);
});

test('live text search activates direct sources instead of Serper', () => {
  const source = fs.readFileSync(path.join(__dirname, '../netlify/functions/lib/fuentes-externas.cjs'), 'utf8');
  const start = source.indexOf('const directTask =');
  const activeTaskBlock = source.slice(start, source.indexOf('const settled =', start));
  assert.match(activeTaskBlock, /buscarFuentesExternas/);
  assert.match(activeTaskBlock, /\[mlTask\(\), directTask\(\)\]/);
  assert.doesNotMatch(activeTaskBlock, /SERPER|serperApiKey|sourceTask/);
});

test('PII guard checks visible listing text instead of numeric image URLs', () => {
  const source = fs.readFileSync(path.join(__dirname, '../netlify/functions/lib/fuentes-externas.cjs'), 'utf8');
  assert.match(source, /seller_name:\s*car\.seller_name/);
  assert.doesNotMatch(source, /filter\(car\s*=>\s*!hasPII\(car\)\)/);
});
