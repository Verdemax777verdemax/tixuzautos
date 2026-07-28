const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync(require.resolve('../assets/app.js'), 'utf8');
const index = fs.readFileSync(require.resolve('../index.html'), 'utf8');

assert.match(app, /function handleListingImageError\(/);
assert.match(app, /Imagen de referencia/);
assert.match(app, /handleListingImageError\(this\)/);
assert.match(app, /hideRecent=.*>0\.5/);
assert.match(app, /hideKm=.*>0\.5/);
assert.match(app, /published_at:item\.published_at/);
assert.match(index, /app\.js\?v=calidad-datos-20260714/);

console.log('Bloque calidad frontend tests: OK');
