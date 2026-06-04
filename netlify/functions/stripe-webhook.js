// Tixuz Autos v58 · Stripe webhook sin SDK externo.
// Al pagar, NO activa público: deja el anuncio en revisión manual de fotos.
const crypto = require('crypto');
const { patchListingWithFallback, notifyReviewCreated } = require('./_review-utils.cjs');

const DEFAULT_PLANS = {
  basic:    { active_days: 30, featured: false },
  featured: { active_days: 60, featured: true  },
  pro:      { active_days: 30, featured: true  },
};
function timingSafeEqualHex(a, b) {
  const ba = Buffer.from(a || '', 'hex');
  const bb = Buffer.from(b || '', 'hex');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
function verifyStripeSignature(rawBody, header, secret) {
  if (!header || !secret) throw new Error('Missing Stripe signature or secret');
  const parts = Object.fromEntries(header.split(',').map(p => {
    const i = p.indexOf('=');
    return [p.slice(0, i), p.slice(i + 1)];
  }));
  const timestamp = parts.t;
  const signatures = header.split(',').filter(p => p.startsWith('v1=')).map(p => p.slice(3));
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
  if (!signatures.some(sig => timingSafeEqualHex(sig, expected))) throw new Error('Invalid Stripe signature');
}
function addDays(days) { return new Date(Date.now() + (Number(days || 30) * 86400000)).toISOString(); }
async function fetchWithTimeout(url, options, ms = 10000) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}
async function getListingPaymentState({ supabaseUrl, serviceKey, listingId }) {
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/marketplace_listings?select=id,payment_status,stripe_session_id&limit=1&id=eq.${encodeURIComponent(listingId)}`;
  const res = await fetchWithTimeout(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  }, 8000);
  if (!res.ok) return null;
  const arr = await res.json().catch(() => []);
  return Array.isArray(arr) ? arr[0] : null;
}
async function queuePaidListingForReview({ supabaseUrl, serviceKey, listingId, eventId, session }) {
  const planKey = session?.metadata?.plan || 'basic';
  const plan = DEFAULT_PLANS[planKey] || DEFAULT_PLANS.basic;
  const payload = {
    status: 'pending_payment',
    manual_review: true,
    payment_status: 'paid',
    featured: !!plan.featured,
    verification_badge: false,
    stripe_session_id: session.id,
    stripe_subscription_id: session.subscription || null,
    expires_at: addDays(plan.active_days),
  };
  await patchListingWithFallback({ endpoint: supabaseUrl, key: serviceKey, listingId, payload });
}


exports.handler = async function(event) {
  const WEBHOOK_SEC = process.env.STRIPE_WEBHOOK_SECRET;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!WEBHOOK_SEC || !SUPABASE_URL || !SERVICE_KEY) return { statusCode: 500, body: 'Missing webhook env vars' };

  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : (event.body || '');
  try { verifyStripeSignature(rawBody, sig, WEBHOOK_SEC); }
  catch (err) { console.error('Webhook signature error:', err.message); return { statusCode: 400, body: `Webhook Error: ${err.message}` }; }

  let stripeEvent;
  try { stripeEvent = JSON.parse(rawBody); } catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data && stripeEvent.data.object;
    const listingId = session && (session.client_reference_id || (session.metadata && session.metadata.listing_id));
    if (!listingId) return { statusCode: 200, body: 'No listing_id' };
    try {
      const existing = await getListingPaymentState({ supabaseUrl: SUPABASE_URL, serviceKey: SERVICE_KEY, listingId });
      if (existing?.payment_status === 'paid' && existing?.stripe_session_id === session.id) {
        return { statusCode: 200, body: 'Already processed' };
      }
      await queuePaidListingForReview({ supabaseUrl: SUPABASE_URL, serviceKey: SERVICE_KEY, listingId, eventId: stripeEvent.id, session });
      await notifyReviewCreated({ endpoint: SUPABASE_URL, key: SERVICE_KEY, listingId, event, source: 'stripe-webhook' }).catch(err => console.warn('review notify failed:', err.message));
    } catch (err) {
      console.error('Supabase webhook call failed:', err);
      return { statusCode: 500, body: 'Supabase error' };
    }
  }
  return { statusCode: 200, body: 'OK' };
};
