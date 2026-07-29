(() => {
  const script = document.currentScript;
  const listingId = String(script?.dataset?.listingId || '').trim();
  if (!listingId) return;

  const key = 'tixuz_attribution_v1';
  const fields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
  const params = new URLSearchParams(location.search);
  let saved = {};
  try { saved = JSON.parse(sessionStorage.getItem(key) || '{}') || {}; } catch (_) {}
  fields.forEach((name) => {
    const value = (params.get(name) || '').trim();
    if (value) saved[name] = value.slice(0, 180);
  });
  const generated = window.crypto?.randomUUID?.() || `s-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  saved.session_id = (params.get('session_id') || saved.session_id || generated).slice(0, 120);
  try { sessionStorage.setItem(key, JSON.stringify(saved)); } catch (_) {}

  fetch('/api/listing-view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({
      listing_id: listingId,
      source: 'seo_listing',
      tracking: { ...saved, referrer: document.referrer || '' },
    }),
  }).catch(() => {});
})();
