const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const antifraudStart = 'No entregues anticipos sin verificar identidad del vendedor, documentos y existencia';

test('paid-plan copy remains clearly disabled and never becomes a marketplace trust seal', () => {
  const index = read('index.html');
  const app = read('assets/app.js');

  assert.doesNotMatch(index, /Pago seguro con Stripe|Plataforma segura con Stripe|pagos seguros/i);
  assert.match(index, /Destacado y PRO Lote est.n en preparaci.n/i);
  assert.match(app, /no se activa ning.n cobro ni suscripci.n todav.a/i);
  assert.doesNotMatch(app, /Estad.sticas/);
});

test('free launch stays active while Destacado and PRO Lote expose their future terms', () => {
  const app = read('assets/app.js');
  const pricing = read('netlify/functions/get-pricing.js');
  const checkout = read('netlify/functions/create-checkout.js');
  const terms = read('legal/terminos.html');

  assert.match(app, /p\.key!==['"]basic['"]/);
  assert.match(pricing, /plan\.key !== ['"]basic['"]/);
  assert.match(app, /key:'featured'.*price_mxn:199.*active_days:60.*max_photos:20/);
  assert.match(app, /key:'pro'.*name:'PRO Lote'.*interval_type:'recurring'.*max_photos:20/);
  assert.match(pricing, /key: 'pro'.*name: 'PRO Lote'.*interval_type: 'recurring'.*max_photos: 20/);
  assert.match(checkout, /key: 'pro'.*name: 'PRO Lote'.*interval_type: 'recurring'.*max_photos: 20/);
  assert.match(checkout, /params\.set\('mode', DEFAULT_PLANS\[planKey\]\?\.interval_type === 'recurring' \? 'subscription' : 'payment'\)/);
  assert.match(checkout, /PAYMENTS_ENABLED !== 'true'/);
  assert.match(terms, /PRO Lote tendr. una modalidad mensual/i);
  assert.match(terms, /no crea un cobro ni una suscripci.n/i);
});

test('every interactive and indexed listing template includes the antifraud warning', () => {
  const app = read('assets/app.js');
  const seo = read('netlify/functions/seo-listing.js');

  assert.ok(app.split(antifraudStart).length - 1 >= 2, 'normal and fallback detail templates must both warn');
  assert.match(seo, new RegExp(antifraudStart));
});
