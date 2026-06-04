import jwt from 'jsonwebtoken';

const ADMIN_PASSWORD = Netlify.env.get('ADMIN_PASSWORD');
const JWT_SECRET     = Netlify.env.get('ADMIN_JWT_SECRET') || Netlify.env.get('STRIPE_WEBHOOK_SECRET');

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  if (!ADMIN_PASSWORD || !JWT_SECRET) {
    return json(500, { error: 'Admin no configurado. Faltan ADMIN_PASSWORD o ADMIN_JWT_SECRET/STRIPE_WEBHOOK_SECRET en Netlify.' });
  }
  let body;
  try { body = await req.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }

  if (body.password !== ADMIN_PASSWORD) {
    return json(401, { error: 'Contraseña incorrecta' });
  }

  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '4h' });
  return json(200, { token });
};
