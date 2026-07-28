const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const reviewUtilsPath = path.join(__dirname, '..', 'netlify', 'functions', '_review-utils.cjs');

test('patchListingWithFallback keeps the PostgREST filter in the query string', async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      text: async () => '[]',
    };
  };

  try {
    delete require.cache[require.resolve(reviewUtilsPath)];
    const { patchListingWithFallback } = require(reviewUtilsPath);

    await patchListingWithFallback({
      endpoint: 'https://example.supabase.co',
      key: 'test-key',
      listingId: 'listing 123',
      payload: { status: 'pending_payment' },
    });

    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      'https://example.supabase.co/rest/v1/marketplace_listings?id=eq.listing%20123',
    );
    assert.equal(calls[0].options.method, 'PATCH');
  } finally {
    global.fetch = originalFetch;
  }
});

test('review links keep the listing id in a query string', () => {
  const source = fs.readFileSync(reviewUtilsPath, 'utf8');

  assert.match(source, /review-action\?id=/);
  assert.doesNotMatch(source, /review-actionid=/);
  assert.doesNotMatch(source, /marketplace_listingsid=/);
});
