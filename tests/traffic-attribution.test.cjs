const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

async function withTrackingEnv(run) {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousFetch = global.fetch;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  try {
    return await run();
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    global.fetch = previousFetch;
  }
}

function reload(name) {
  const target = path.join(root, 'netlify', 'functions', name);
  delete require.cache[require.resolve(path.join(root, 'netlify', 'functions', '_shared.js'))];
  delete require.cache[require.resolve(target)];
  return require(target);
}

test('listing views reach tixuz_track with server-derived device and attribution', async () => {
  await withTrackingEnv(async () => {
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
    };
    const listingView = reload('listing-view.js');
    const response = await listingView.handler({
      httpMethod: 'POST',
      headers: {
        'x-nf-client-connection-ip': '203.0.113.42',
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
        referer: 'https://tixuzautos.com/?utm_source=facebook',
      },
      body: JSON.stringify({
        listing_id: '123e4567-e89b-42d3-a456-426614174000',
        source: 'seo_listing',
        tracking: { utm_source: 'facebook', utm_medium: 'social', utm_campaign: 'julio', session_id: 'session-123' },
      }),
    });
    assert.equal(response.statusCode, 202);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/rest\/v1\/rpc\/tixuz_track$/);
    const payload = JSON.parse(calls[0].options.body).p;
    assert.equal(payload.event, 'view');
    assert.equal(payload.utm_source, 'facebook');
    assert.equal(payload.utm_medium, 'social');
    assert.equal(payload.session_id, 'session-123');
    assert.equal(payload.device, 'mobile');
    assert.equal(payload.visitor_hash.includes('203.0.113.42'), false);
  });
});

test('clickout redirects while recording UTM, session and device through tixuz_track', async () => {
  await withTrackingEnv(async () => {
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
    };
    const ir = reload('ir.js');
    const response = await ir.handler({
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0)', referer: 'https://tixuzautos.com/' },
      queryStringParameters: {
        to: 'https://example.com/auto/1', source: 'Kavak', q: 'Mazda 3',
        utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'marca', session_id: 'session-456', listing_id: 'ext-123',
      },
    });
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.Location, 'https://example.com/auto/1');
    const payload = JSON.parse(calls[0].options.body).p;
    assert.equal(payload.event, 'clickout');
    assert.equal(payload.fuente_portal, 'Kavak');
    assert.equal(payload.utm_campaign, 'marca');
    assert.equal(payload.session_id, 'session-456');
    assert.equal(payload.device, 'desktop');
  });
});
