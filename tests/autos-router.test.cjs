const assert = require('node:assert/strict');
const test = require('node:test');

const { handler, _test } = require('../netlify/functions/autos-router.js');

function withFetch(mock, run) {
  const originalFetch = global.fetch;
  global.fetch = mock;
  return Promise.resolve(run()).finally(() => {
    global.fetch = originalFetch;
  });
}

test('autos router extracts one slug and recognizes listing UUIDs', () => {
  assert.equal(_test.slugFromEvent({ path: '/.netlify/functions/autos-router/chevrolet-tracker' }), 'chevrolet-tracker');
  assert.equal(_test.slugFromEvent({ rawUrl: 'https://tixuzautos.com/autos/nissan-versa?utm_source=test' }), 'nissan-versa');
  assert.equal(_test.UUID_PATTERN.test('e1b45ebb-651c-4873-8f60-cd1dcf238639'), true);
  assert.equal(_test.UUID_PATTERN.test('chevrolet-tracker'), false);
});

test('autos router forces HTML content type instead of forwarding Supabase text/plain', async () => {
  await withFetch(
    async () => ({ status: 200, headers: { get: () => 'text/plain; charset=utf-8' }, text: async () => '<html>modelo</html>' }),
    async () => {
      const result = await handler({ path: '/.netlify/functions/autos-router/chevrolet-tracker' });
      assert.equal(result.statusCode, 200);
      assert.equal(result.headers['Content-Type'], _test.HTML_CONTENT_TYPE);
      assert.equal(result.body, '<html>modelo</html>');
    },
  );
});

test('autos router forces XML content type for the model sitemap', async () => {
  await withFetch(
    async url => ({ status: 200, headers: { get: () => 'text/plain' }, text: async () => `<urlset source="${url}"/>` }),
    async () => {
      const result = await handler({ path: '/.netlify/functions/autos-router/sitemap-modelos.xml' });
      assert.equal(result.statusCode, 200);
      assert.equal(result.headers['Content-Type'], _test.SITEMAP_CONTENT_TYPE);
      assert.match(result.body, /modelo\/sitemap\.xml/);
    },
  );
});
