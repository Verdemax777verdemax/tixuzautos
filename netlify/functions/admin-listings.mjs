import jwt from 'jsonwebtoken';
import utils from './_review-utils.cjs';
const { patchListingWithFallback } = utils;
const SUPABASE_URL = Netlify.env.get('SUPABASE_URL');
const SERVICE_KEY  = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');
const JWT_SECRET   = Netlify.env.get('ADMIN_JWT_SECRET') || Netlify.env.get('STRIPE_WEBHOOK_SECRET');

function verifyAdmin(req) {
  if (!JWT_SECRET) return false;
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace('Bearer ', '');
  try { jwt.verify(token, JWT_SECRET); return true; } catch { return false; }
}

export default async (req) => {
  if (!SUPABASE_URL || !SERVICE_KEY || !JWT_SECRET) {
    return new Response(JSON.stringify({ ok:false, error:'Admin no configurado. Faltan variables privadas en Netlify.' }), { status: 500, headers:{'Content-Type':'application/json'} });
  }
  if (!verifyAdmin(req)) return new Response(JSON.stringify({ ok:false, error:'No autorizado' }), { status: 401, headers:{'Content-Type':'application/json'} });
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok:false, error:'Method Not Allowed' }), { status: 405, headers:{'Content-Type':'application/json'} });

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ ok:false, error:'Invalid JSON' }), { status: 400, headers:{'Content-Type':'application/json'} }); }

  const { listing_id, action } = body;
  if (!listing_id || !action) return new Response(JSON.stringify({ ok:false, error:'Faltan params' }), { status: 400, headers:{'Content-Type':'application/json'} });

  let updates = {};
  if (action === 'approve' || action === 'activate') updates = { status: 'active', manual_review: false, verification_badge: true };
  else if (action === 'reject' || action === 'delete') updates = { status: 'deleted', manual_review: false, verification_badge: false };
  else if (action === 'pause') updates = { status: 'paused' };
  else if (action === 'sold') updates = { status: 'sold' };
  else return new Response(JSON.stringify({ ok:false, error:'Acción inválida' }), { status: 400, headers:{'Content-Type':'application/json'} });

  Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);

  try {
    await patchListingWithFallback({ endpoint: SUPABASE_URL, key: SERVICE_KEY, listingId: listing_id, payload: updates });
    return new Response(JSON.stringify({ ok: true, error: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'No se pudo actualizar' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
