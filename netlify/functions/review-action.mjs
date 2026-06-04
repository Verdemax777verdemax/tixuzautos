// Tixuz Autos v62 · Aprobación/rechazo rápido desde email/WhatsApp.
import utils from './_review-utils.cjs';
const { patchListingWithFallback, reviewSecret } = utils;
const SUPABASE_URL = Netlify.env.get('SUPABASE_URL');
const SERVICE_KEY  = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');
const REVIEW_SECRET = reviewSecret();

function html(status, title, msg){
  return new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui;background:#07111f;color:#e5edf7;display:grid;place-items:center;min-height:100vh;margin:0"><div style="max-width:420px;padding:24px;border:1px solid rgba(255,255,255,.14);border-radius:18px;background:#101b2d;text-align:center"><h1 style="margin:0 0 10px;font-size:24px">${title}</h1><p style="color:#9aa8bd;line-height:1.45">${msg}</p><a href="/?admin=1" style="display:inline-block;margin-top:12px;background:#2563eb;color:white;padding:12px 16px;border-radius:12px;text-decoration:none;font-weight:700">Abrir Admin</a></div></body></html>`, { status, headers:{'Content-Type':'text/html; charset=utf-8'} });
}

export default async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') || '';
  const action = url.searchParams.get('action') || '';
  const token = url.searchParams.get('token') || '';
  if (!REVIEW_SECRET) return html(500, 'Falta REVIEW_SECRET', 'Configura REVIEW_SECRET en Netlify para aprobar desde WhatsApp.');
  if (token !== REVIEW_SECRET) return html(401, 'No autorizado', 'El enlace de autorización no es válido.');
  if (!id || !['approve','reject'].includes(action)) return html(400, 'Link inválido', 'Falta id o acción.');

  const updates = action === 'approve'
    ? { status: 'active', manual_review: false, verification_badge: true }
    : { status: 'deleted', manual_review: false, verification_badge: false };

  try {
    await patchListingWithFallback({ endpoint: SUPABASE_URL, key: SERVICE_KEY, listingId: id, payload: updates });
  } catch (err) {
    return html(500, 'No se pudo actualizar', err.message || 'Error en Supabase.');
  }
  return html(200, action === 'approve' ? 'Auto autorizado' : 'Auto rechazado', action === 'approve' ? 'El anuncio ya puede aparecer públicamente en Tixuz Autos.' : 'El anuncio fue rechazado y no aparecerá públicamente.');
};
