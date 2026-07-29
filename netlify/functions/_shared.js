// ============================================================
// _shared.js - utilidades comunes para todas las functions
// ============================================================
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rbiuoljoduekajivffzh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireEnv(name, value) {
  if (!value) {
    const err = new Error(`Missing required environment variable: ${name}`);
    err.statusCode = 500;
    throw err;
  }
  return value;
}

// Llamada REST a Supabase con service_role (bypassa RLS)
async function sb(path, opts = {}) {
  requireEnv('SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY', SERVICE_KEY);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
      ...(opts.headers || {})
    }
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  return { ok: res.ok, status: res.status, data };
}

function hash(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function clientIp(event) {
  const headers = event?.headers || {};
  return headers['x-nf-client-connection-ip']
    || headers['x-forwarded-for']?.split(',')[0]?.trim()
    || 'unknown';
}

function requestHeader(event, name) {
  const wanted = String(name || '').toLowerCase();
  const headers = event?.headers || {};
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === wanted) return String(value || '');
  }
  return '';
}

function limitedText(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

function deviceFromUserAgent(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (/ipad|tablet|kindle|silk\//.test(ua)) return 'tablet';
  if (/mobi|android|iphone|ipod|windows phone/.test(ua)) return 'mobile';
  return 'desktop';
}

// Attribution values are advisory analytics fields. Device and referrer are
// derived from the request so a browser cannot accidentally report a stale one.
function trackingFields(event = {}, input = {}) {
  const query = event.queryStringParameters || {};
  const pick = (key, max) => limitedText(input[key] ?? query[key], max);
  const userAgent = requestHeader(event, 'user-agent');
  return {
    utm_source: pick('utm_source', 120),
    utm_medium: pick('utm_medium', 120),
    utm_campaign: pick('utm_campaign', 180),
    utm_content: pick('utm_content', 180),
    referrer: limitedText(requestHeader(event, 'referer') || requestHeader(event, 'referrer') || input.referrer, 500),
    session_id: pick('session_id', 120),
    device: deviceFromUserAgent(userAgent),
    user_agent: limitedText(userAgent, 400),
  };
}

async function tixuzTrack(payload) {
  return sb('rpc/tixuz_track', {
    method: 'POST',
    prefer: 'return=representation',
    body: JSON.stringify({ p: payload }),
  });
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...cors, ...extraHeaders },
    body: JSON.stringify(body)
  };
}

// Rate limit: max N requests por ventana de M minutos por IP
async function checkRateLimit(event, maxReq = 20, windowMin = 10) {
  const ipHash = hash(clientIp(event));
  const since = new Date(Date.now() - windowMin * 60000).toISOString();

  const { data } = await sb(
    `agg_rate_limits?ip_hash=eq.${ipHash}&window_start=gte.${since}&select=id,request_count`
  );

  const total = (data || []).reduce((s, r) => s + (r.request_count || 1), 0);
  if (total >= maxReq) return { allowed: false, retryAfter: windowMin * 60 };

  await sb('agg_rate_limits', {
    method: 'POST',
    body: JSON.stringify({ ip_hash: ipHash }),
    prefer: 'return=minimal'
  });
  return { allowed: true };
}

// Filtro anti-PII: descarta fichas con telefono MX o email
function hasPII(obj) {
  const s = JSON.stringify(obj);
  const tel = /(\+?52\s?1?\s?)?(\d{2,3}[\s-]?\d{3,4}[\s-]?\d{4})/;
  const email = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  return tel.test(s) || email.test(s);
}

module.exports = {
  sb,
  hash,
  clientIp,
  requestHeader,
  limitedText,
  deviceFromUserAgent,
  trackingFields,
  tixuzTrack,
  cors,
  json,
  checkRateLimit,
  hasPII,
  requireEnv,
  SUPABASE_URL,
  SERVICE_KEY,
};
