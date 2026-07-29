const DEFAULT_PLANS = [
  { key: 'featured', name: 'Destacado', price_mxn: 199, interval_type: 'one_time', active_days: 60, max_photos: 20 },
  { key: 'pro', name: 'PRO Lote', price_mxn: 499, interval_type: 'recurring', active_days: 30, max_photos: 20, lot_capacity: 20, featured_slots: 2 },
];
const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=300',
  'Access-Control-Allow-Origin': process.env.SITE_URL || 'https://cool-kataifi-78a65b.netlify.app',
};
function respond(statusCode, body){ return { statusCode, headers, body: JSON.stringify(body) }; }
exports.handler = async function(){
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const ANON_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !ANON_KEY) return respond(200, DEFAULT_PLANS);
  try {
    const res = await fetch(`${SUPABASE_URL.replace(/\/$/,'')}/rest/v1/pricing_plans?is_active=eq.true&order=sort_order.asc`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    if (!res.ok) return respond(200, DEFAULT_PLANS);
    const data = await res.json();
    const visible = Array.isArray(data) ? data.filter((plan) => plan && plan.key !== 'basic') : [];
    return respond(200, visible.length ? visible : DEFAULT_PLANS);
  } catch {
    return respond(200, DEFAULT_PLANS);
  }
};
