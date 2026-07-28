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
  return event.headers['x-nf-client-connection-ip']
    || event.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || 'unknown';
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

module.exports = { sb, hash, clientIp, cors, json, checkRateLimit, hasPII, requireEnv, SUPABASE_URL, SERVICE_KEY };
