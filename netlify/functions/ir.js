const { trackingFields, tixuzTrack } = require('./_shared');

exports.handler = async (event = {}) => {
  const qs = event.queryStringParameters || {};
  const destino = String(qs.to || qs.url || '').trim();
  let parsed;
  try { parsed = new URL(destino); } catch (_) { parsed = null; }
  if (!parsed || !/^https?:$/.test(parsed.protocol)) {
    return { statusCode: 400, headers: { 'Content-Type': 'text/plain' }, body: 'URL invalida' };
  }

  await tixuzTrack({
      event_type: 'clickout',
      event: 'clickout',
      fuente_portal: String(qs.source || parsed.hostname).slice(0, 120),
      destino_url: parsed.href,
      query_text: String(qs.q || '').slice(0, 200),
      src_tag: String(qs.src || 'listing_card').slice(0, 80),
      listing_id: String(qs.listing_id || '').slice(0, 120),
      ...trackingFields(event, qs),
  }).catch(() => {});

  return {
    statusCode: 302,
    headers: {
      Location: parsed.href,
      'Cache-Control': 'no-store'
    },
    body: ''
  };
};
