const test = require('node:test');
const assert = require('node:assert/strict');

const automarket = require('../netlify/functions/bbva-automarket-discover.cjs');

function attribute(code, value, option = false) {
  return {
    attribute_metadata: { code },
    entered_attribute_value: { value: option ? null : value },
    selected_attribute_options: {
      attribute_option: option ? [{ label: value, value: '1' }] : null
    }
  };
}

test('mapea una ficha Venia completa de BBVA AutoMarket', () => {
  const listing = automarket.mapProduct({
    id: 123,
    sku: 'SKU-123',
    name: 'CHEVROLET TRACKER 2023',
    url_key: 'chevrolet-tracker-2023-123-456',
    vehicle_verified: true,
    stock_status: 'IN_STOCK',
    small_image: { url: 'https://automarket.bbva.mx/media/catalog/product/tracker.jpg' },
    price_range: { maximum_price: { final_price: { value: 263500, currency: 'MXN' } } },
    showroom_details: { name: 'Satélite', state: 'Edo de México' },
    custom_attributes: [
      attribute('brand', 'CHEVROLET', true),
      attribute('model', 'TRACKER', true),
      attribute('version', 'LT AUTOMATICA', true),
      attribute('transmission', 'AUTOMATICO', true),
      attribute('year', '2023'),
      attribute('km', '109000')
    ]
  }, { verified: true, title: 'Chevrolet Tracker | AutoMarket' });

  assert.equal(listing.id, 'SKU-123');
  assert.equal(listing.price_mxn, 263500);
  assert.equal(listing.mileage_km, 109000);
  assert.equal(listing.city, 'Naucalpan de Juárez');
  assert.equal(listing.state, 'Estado de México');
  assert.equal(listing.image_verified, true);
  assert.equal(listing.detail_verified, true);
  assert.equal(automarket.isAutomarketVehicleUrl(listing.url), true);
});

test('normaliza showrooms conocidos a ciudad', () => {
  assert.equal(automarket.cityForShowroom('Gran Sur', 'Ciudad de México'), 'Ciudad de México');
  assert.equal(automarket.cityForShowroom('Patriotismo', 'Ciudad de México'), 'Ciudad de México');
  assert.equal(automarket.cityForShowroom('Satélite', 'Edo de México'), 'Naucalpan de Juárez');
});
