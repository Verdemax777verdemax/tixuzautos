const { createHmac, randomBytes } = require('crypto');

function env(name) {
  if (globalThis.Netlify?.env?.get) return Netlify.env.get(name);
  return process.env[name];
}

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const opsPin = env('OPS_PIN');
  const secret = env('OPS_JWT_SECRET') || env('ADMIN_JWT_SECRET') || env('STRIPE_WEBHOOK_SECRET');
  if (!opsPin || !secret) {
    return json(500, { error: 'Acceso de operador no configurado. Falta OPS_PIN u OPS_JWT_SECRET en Netlify.' });
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'JSON invalido' }); }

  if (String(body.pin || '').trim() !== String(opsPin).trim()) {
    return json(401, { error: 'PIN incorrecto' });
  }

  const issuedAt = Date.now();
  const nonce = randomBytes(16).toString('hex');
  const payload = `ops.${issuedAt}.${nonce}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return json(200, { ok: true, token: `${payload}.${sig}` });
};
