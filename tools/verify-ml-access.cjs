const ml = require('../netlify/functions/lib/fuentes/mercadolibre-api.js');

async function request(url, token) {
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}`, Accept: 'application/json' } : { Accept: 'application/json' } });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch (_) { data = { message: text.slice(0, 200) }; }
  return { status: response.status, error: data.error || null, message: data.message || null, count: Array.isArray(data.results) ? data.results.length : null };
}

(async () => {
  const config = await ml.readTokenConfig();
  const token = await ml.getAccessToken();
  const identity = await ml.apiJson('/users/me');
  const searchUrl = 'https://api.mercadolibre.com/sites/MLM/search?category=MLM1744&q=suzuki%20swift&condition=used&limit=10';
  const candidates = await ml.discoverWithSerper('Suzuki', 'Swift', 1).catch(() => []);
  const itemUrl = candidates[0]?.id ? `https://api.mercadolibre.com/items/${candidates[0].id}` : null;
  console.log(JSON.stringify({
    token: {
      obtained_at: config.obtainedAt,
      expires_in: config.expiresIn,
      needs_refresh: ml.tokenNeedsRefresh(config),
      has_access_token: Boolean(config.accessToken),
      has_refresh_token: Boolean(config.refreshToken)
    },
    identity: { id: identity.id, site_id: identity.site_id, status: identity.status },
    search_with_token: await request(searchUrl, token),
    search_without_token: await request(searchUrl, null),
    item_with_token: itemUrl ? await request(itemUrl, token) : null
  }, null, 2));
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
