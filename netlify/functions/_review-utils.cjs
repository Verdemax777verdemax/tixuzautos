// Tixuz Autos v62 · utilidades revisión humana interna.
// No toca Stripe ni diseño. Soporta email real con Resend si existe RESEND_API_KEY.

const DEFAULT_ADMIN_EMAIL = 'mp4mexico@gmail.com';
const DEFAULT_ADMIN_WHATSAPP = '523330573809';

function digits(v) { return String(v || '').replace(/\D/g, ''); }
function siteUrl(event) {
  return String(process.env.SITE_URL || event?.headers?.origin || process.env.URL || 'https://cool-kataifi-78a65b.netlify.app').replace(/\/$/, '');
}
async function fetchWithTimeout(url, options, ms = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}
function money(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) && n ? `$${n.toLocaleString('es-MX')} MXN` : 'Precio no informado';
}
function reviewSecret() {
  return process.env.REVIEW_SECRET || process.env.ADMIN_REVIEW_TOKEN || process.env.ADMIN_JWT_SECRET || '';
}
function adminEmail() {
  return process.env.ADMIN_REVIEW_EMAIL || process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
}
function approveRejectLinks({ base, listingId }) {
  const token = reviewSecret();
  return {
    approve: `${base}/.netlify/functions/review-action?id=${encodeURIComponent(listingId)}&action=approve&token=${encodeURIComponent(token)}`,
    reject: `${base}/.netlify/functions/review-action?id=${encodeURIComponent(listingId)}&action=reject&token=${encodeURIComponent(token)}`,
  };
}
async function patchListingWithFallback({ endpoint, key, listingId, payload }) {
  const url = `${endpoint.replace(/\/$/, '')}/rest/v1/marketplace_listings?id=eq.${encodeURIComponent(listingId)}`;
  async function patch(body) {
    const res = await fetchWithTimeout(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=representation' },
      body: JSON.stringify(body),
    }, 10000);
    const txt = await res.text();
    let data = txt;
    try { data = txt ? JSON.parse(txt) : []; } catch {}
    return { res, txt, data };
  }
  let out = await patch(payload);
  if (out.res.ok) return out.data;

  // Si alguna columna opcional no existe, reintenta sin ella.
  const msg = String(out.txt || out.data?.message || '').toLowerCase();
  const retry = { ...payload };
  if (msg.includes('manual_review')) delete retry.manual_review;
  if (msg.includes('verification_badge')) delete retry.verification_badge;
  if (JSON.stringify(retry) !== JSON.stringify(payload)) {
    out = await patch(retry);
    if (out.res.ok) return out.data;
  }
  throw new Error(out.data?.message || out.data?.error || out.txt || `Supabase HTTP ${out.res.status}`);
}
async function getListing({ endpoint, key, listingId }) {
  const select = 'id,make,model,year,price,location,seller_name,seller_whatsapp,images,payment_status,plan,status,created_at';
  const res = await fetchWithTimeout(`${endpoint.replace(/\/$/, '')}/rest/v1/marketplace_listings?select=${select}&limit=1&id=eq.${encodeURIComponent(listingId)}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  }, 8000);
  if (!res.ok) return null;
  const arr = await res.json().catch(() => []);
  return Array.isArray(arr) ? arr[0] : null;
}
function buildReviewMessage({ listing, listingId, base }) {
  const title = listing ? `${listing.year || ''} ${listing.make || ''} ${listing.model || ''}`.trim() : `Anuncio ${listingId}`;
  const links = approveRejectLinks({ base, listingId });
  const photos = Array.isArray(listing?.images) ? listing.images.filter(Boolean).slice(0, 8) : [];
  const photosText = photos.length ? photos.map((u, i) => `${i + 1}. ${u}`).join('\n') : 'Sin fotos detectadas en el aviso';
  const subject = `Tixuz: revisar anuncio ${title || listingId}`;
  const text = `Nuevo anuncio en revisión humana\n\nAuto: ${title}\nPrecio: ${money(listing?.price)}\nUbicación: ${listing?.location || 'México'}\nVendedor: ${listing?.seller_name || ''}\nWhatsApp vendedor: ${listing?.seller_whatsapp || ''}\nPlan: ${listing?.plan || 'basic'}\nID: ${listingId}\n\nFotos:\n${photosText}\n\nACEPTAR:\n${links.approve}\n\nRECHAZAR:\n${links.reject}\n\nNo tienes que hablar con el cliente. Solo toca aceptar o rechazar.`;

  // Galería de fotos como imágenes embebidas (no solo enlaces). Se muestran grandes y centradas.
  const photoHtml = photos.length
    ? photos.map((u, i) => `<tr><td style="padding:6px 0"><img src="${u}" alt="Foto ${i + 1}" style="display:block;width:100%;max-width:560px;height:auto;border-radius:12px;border:1px solid #e5e7eb"></td></tr>`).join('')
    : `<tr><td style="padding:12px;background:#fef3c7;border-radius:8px;color:#92400e;font-size:14px">⚠️ Este anuncio no tiene fotos.</td></tr>`;

  // Datos del auto en formato tabla con letra grande y bien legible en celular.
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f3f4f6;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:20px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">

      <!-- HEADER -->
      <tr><td style="background:#0f172a;padding:22px 24px">
        <div style="color:#ffffff;font-size:13px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;opacity:.7">Tixuz Autos · Revisión humana</div>
        <div style="color:#ffffff;font-size:22px;font-weight:800;margin-top:6px">🚗 Nuevo anuncio para autorizar</div>
      </td></tr>

      <!-- TÍTULO DEL AUTO -->
      <tr><td style="padding:24px 24px 8px 24px">
        <div style="font-size:24px;font-weight:800;color:#0f172a;line-height:1.2">${title || 'Anuncio sin título'}</div>
        <div style="font-size:28px;font-weight:800;color:#2563eb;margin-top:6px">${money(listing?.price)}</div>
      </td></tr>

      <!-- DATOS DEL VENDEDOR -->
      <tr><td style="padding:8px 24px 16px 24px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0">
          <tr><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0">
            <div style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:600;letter-spacing:.5px">Ubicación</div>
            <div style="font-size:16px;color:#0f172a;font-weight:600;margin-top:2px">${listing?.location || 'México'}</div>
          </td></tr>
          <tr><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0">
            <div style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:600;letter-spacing:.5px">Vendedor</div>
            <div style="font-size:16px;color:#0f172a;font-weight:600;margin-top:2px">${listing?.seller_name || '—'}</div>
          </td></tr>
          <tr><td style="padding:14px 16px;border-bottom:1px solid #e2e8f0">
            <div style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:600;letter-spacing:.5px">WhatsApp del vendedor</div>
            <div style="font-size:16px;color:#0f172a;font-weight:600;margin-top:2px">${listing?.seller_whatsapp || '—'}</div>
          </td></tr>
          <tr><td style="padding:14px 16px">
            <div style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:600;letter-spacing:.5px">Plan</div>
            <div style="font-size:16px;color:#0f172a;font-weight:600;margin-top:2px">${listing?.plan || 'basic'}</div>
          </td></tr>
        </table>
      </td></tr>

      <!-- BOTONES (PRIMERO ARRIBA, antes de fotos, para decisión rápida) -->
      <tr><td style="padding:8px 24px 4px 24px">
        <div style="font-size:13px;color:#64748b;text-align:center;margin-bottom:10px">Decide desde aquí · un solo toque</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="50%" style="padding-right:6px">
              <a href="${links.approve}" style="display:block;background:#16a34a;color:#ffffff;padding:18px 8px;border-radius:12px;text-decoration:none;font-weight:800;font-size:17px;text-align:center;box-shadow:0 2px 8px rgba(22,163,74,.3)">✅ APROBAR</a>
            </td>
            <td width="50%" style="padding-left:6px">
              <a href="${links.reject}" style="display:block;background:#dc2626;color:#ffffff;padding:18px 8px;border-radius:12px;text-decoration:none;font-weight:800;font-size:17px;text-align:center;box-shadow:0 2px 8px rgba(220,38,38,.3)">❌ RECHAZAR</a>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- FOTOS -->
      <tr><td style="padding:18px 24px 8px 24px">
        <div style="font-size:14px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">📸 Fotos del auto (${photos.length})</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${photoHtml}</table>
      </td></tr>

      <!-- BOTONES DE NUEVO ABAJO -->
      <tr><td style="padding:12px 24px 24px 24px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="50%" style="padding-right:6px">
              <a href="${links.approve}" style="display:block;background:#16a34a;color:#ffffff;padding:18px 8px;border-radius:12px;text-decoration:none;font-weight:800;font-size:17px;text-align:center">✅ APROBAR</a>
            </td>
            <td width="50%" style="padding-left:6px">
              <a href="${links.reject}" style="display:block;background:#dc2626;color:#ffffff;padding:18px 8px;border-radius:12px;text-decoration:none;font-weight:800;font-size:17px;text-align:center">❌ RECHAZAR</a>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- FOOTER -->
      <tr><td style="padding:16px 24px 22px 24px;background:#f8fafc;border-top:1px solid #e2e8f0">
        <div style="font-size:12px;color:#64748b;line-height:1.5">
          <b>ID del anuncio:</b> ${listingId}<br>
          No tienes que contactar al vendedor. Solo aprueba o rechaza desde los botones de arriba.
        </div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
  return { subject, text, html, links };
}
async function sendReviewEmail({ to, subject, text, html }) {
  const resendKey = process.env.RESEND_API_KEY || '';
  const from = process.env.REVIEW_EMAIL_FROM || process.env.EMAIL_FROM || 'Tixuz Autos <onboarding@resend.dev>';
  if (!resendKey) {
    console.log('review email skipped: missing RESEND_API_KEY', { subject });
    return { sent: false, channel: 'email', reason: 'missing_RESEND_API_KEY' };
  }
  const res = await fetchWithTimeout('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text, html }),
  }, 10000);
  const txt = await res.text();
  if (!res.ok) {
    console.warn('review email failed:', txt);
    return { sent: false, channel: 'email', reason: txt };
  }
  return { sent: true, channel: 'email', response: txt };
}
async function sendReviewWhatsApp({ body }) {
  const waToken = process.env.WHATSAPP_CLOUD_TOKEN || '';
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const to = digits(process.env.ADMIN_REVIEW_WHATSAPP || process.env.ADMIN_WHATSAPP || DEFAULT_ADMIN_WHATSAPP);
  if (!waToken || !phoneId || !to) {
    console.log('review whatsapp skipped: missing env');
    return { sent: false, channel: 'whatsapp', reason: 'missing_whatsapp_env' };
  }
  const res = await fetchWithTimeout(`https://graph.facebook.com/v20.0/${encodeURIComponent(phoneId)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { preview_url: true, body } }),
  }, 10000);
  const txt = await res.text();
  if (!res.ok) {
    console.warn('review whatsapp failed:', txt);
    return { sent: false, channel: 'whatsapp', reason: txt };
  }
  return { sent: true, channel: 'whatsapp', response: txt };
}
async function notifyReviewCreated({ endpoint, key, listingId, event, source = 'review' }) {
  const listing = await getListing({ endpoint, key, listingId });
  const base = siteUrl(event);
  const msg = buildReviewMessage({ listing, listingId, base });
  console.log('review notification attempted', { listingId, source, admin: adminEmail() });
  const email = await sendReviewEmail({ to: adminEmail(), subject: msg.subject, text: msg.text, html: msg.html }).catch(err => ({ sent: false, channel: 'email', reason: err.message }));
  const whatsapp = await sendReviewWhatsApp({ body: msg.text }).catch(err => ({ sent: false, channel: 'whatsapp', reason: err.message }));
  return { attempted: true, email, whatsapp, approve: msg.links.approve, reject: msg.links.reject };
}
module.exports = {
  fetchWithTimeout,
  patchListingWithFallback,
  notifyReviewCreated,
  reviewSecret,
};
