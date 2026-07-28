const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const paymentScope = 'Pagos de publicaciones procesados con Stripe. Tixuz no recibe ni custodia el pago del vehículo.';
const antifraud = 'No entregues anticipos sin verificar identidad del vendedor, documentos y existencia física del auto.';

test('Stripe scope copy appears only in publishing and plans, not marketplace trust seals', () => {
  const index = read('index.html');
  const app = read('assets/app.js');

  assert.doesNotMatch(index, /Pago seguro con Stripe|Plataforma segura con Stripe|pagos seguros/i);
  assert.match(index, /Pagos de publicaciones procesados con Stripe\.<\/strong> Tixuz no recibe ni custodia el pago del vehículo\./);
  assert.match(app, /Pagos de publicaciones procesados con Stripe\.<\/strong> Tixuz no recibe ni custodia el pago del vehículo\./);
});

test('Basic is hidden during free launch and PRO is a one-time 30-day publication', () => {
  const app = read('assets/app.js');
  const pricing = read('netlify/functions/get-pricing.js');
  const checkout = read('netlify/functions/create-checkout.js');
  const terms = read('legal/terminos.html');

  assert.match(app, /p\.key!==['"]basic['"]/);
  assert.match(pricing, /plan\.key !== ['"]basic['"]/);
  assert.match(app, /key:'pro'.*interval_type:'one_time'.*active_days:30/);
  assert.match(pricing, /key: 'pro'.*interval_type: 'one_time'.*active_days: 30/);
  assert.match(checkout, /key: 'pro'.*interval_type: 'one_time'.*active_days: 30/);
  assert.match(checkout, /params\.set\('mode', DEFAULT_PLANS\[planKey\]\?\.interval_type === 'recurring' \? 'subscription' : 'payment'\)/);
  assert.match(terms, /No son suscripciones y no se renuevan automáticamente\./);
  assert.match(terms, new RegExp(paymentScope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('every interactive and indexed listing template includes the antifraud warning', () => {
  const app = read('assets/app.js');
  const seo = read('netlify/functions/seo-listing.js');

  assert.ok(app.split(antifraud).length - 1 >= 2, 'normal and fallback detail templates must both warn');
  assert.match(seo, new RegExp(antifraud.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
