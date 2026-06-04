// Tixuz AI · Cron diario de alertas premium
// Schedule: corre todos los días a las 9am hora MX (15:00 UTC)
// Configurado en netlify.toml como scheduled function.
//
// Para cada suscripción activa: ejecuta la búsqueda, compara contra los
// resultados ya enviados, y manda un email vía Resend con los autos nuevos.

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-4-7';

const SYSTEM_PROMPT_DAILY = `Eres "Tixuz IA". Te van a dar una búsqueda de auto guardada por un cliente. Usa web_search para encontrar los autos disponibles HOY en MercadoLibre México, Kavak, Seminuevos y AutoCosmos. Devuelve SOLO el bloque <resultados> con JSON, sin texto adicional. Máximo 6 listings.

Formato:
<resultados>
[{"titulo":"...","precio":"...","ubicacion":"...","kilometraje":"...","portal":"...","url":"...","imagen":"..."}]
</resultados>`;

exports.handler = async function (event) {
  const log = [];
  const env = {
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
  };
  if (Object.values(env).some(v => !v)) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing env vars', env }) };
  }

  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // 1. Traer suscripciones activas no expiradas
  const subsRes = await fetch(
    `${supaUrl}/rest/v1/ai_search_subscriptions?status=eq.active&expires_at=gt.${new Date().toISOString()}&select=*`,
    { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } }
  );

  if (!subsRes.ok) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase fetch failed', detail: await subsRes.text() }) };
  }

  const subs = await subsRes.json();
  log.push(`Found ${subs.length} active subscriptions`);

  let sent = 0;
  let errors = 0;

  for (const sub of subs) {
    try {
      // 2. Ejecutar la búsqueda con Claude
      const aiRes = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 3000,
          system: SYSTEM_PROMPT_DAILY,
          tools: [{
            type: 'web_search_20260209',
            name: 'web_search',
            max_uses: 3,
            user_location: { type: 'approximate', country: 'MX' },
          }],
          messages: [{ role: 'user', content: sub.query }],
        }),
      });

      if (!aiRes.ok) {
        log.push(`AI error for ${sub.email}: ${aiRes.status}`);
        errors++;
        continue;
      }

      const aiData = await aiRes.json();
      const text = (aiData.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      const match = text.match(/<resultados>([\s\S]*?)<\/resultados>/);
      let listings = [];
      if (match) {
        try { listings = JSON.parse(match[1].trim()); } catch (e) { listings = []; }
      }

      if (!Array.isArray(listings) || listings.length === 0) {
        log.push(`No listings for ${sub.email}`);
        continue;
      }

      // 3. Filtrar contra URLs ya enviadas (sub.sent_urls es jsonb array)
      const sentUrls = new Set(Array.isArray(sub.sent_urls) ? sub.sent_urls : []);
      const newOnes = listings.filter(l => l.url && !sentUrls.has(l.url));

      if (newOnes.length === 0) {
        log.push(`No new listings for ${sub.email}`);
        continue;
      }

      // 4. Enviar email vía Resend
      const html = buildEmailHtml(sub.query, newOnes, sub.email);
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Tixuz IA <onboarding@resend.dev>',
          to: [sub.email],
          subject: `${newOnes.length} ${newOnes.length === 1 ? 'auto nuevo' : 'autos nuevos'} para tu búsqueda`,
          html,
        }),
      });

      if (!resendRes.ok) {
        log.push(`Resend error for ${sub.email}: ${await resendRes.text()}`);
        errors++;
        continue;
      }

      // 5. Actualizar sent_urls en Supabase (concatenar nuevos)
      const updatedUrls = [...sentUrls, ...newOnes.map(l => l.url)].slice(-200);
      await fetch(`${supaUrl}/rest/v1/ai_search_subscriptions?id=eq.${sub.id}`, {
        method: 'PATCH',
        headers: {
          apikey: supaKey,
          Authorization: `Bearer ${supaKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          sent_urls: updatedUrls,
          last_alert_at: new Date().toISOString(),
        }),
      });

      sent++;
      log.push(`Sent ${newOnes.length} to ${sub.email}`);
    } catch (err) {
      errors++;
      log.push(`Error for ${sub.email}: ${String(err).slice(0, 100)}`);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ subs: subs.length, sent, errors, log }),
  };
};

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildEmailHtml(query, listings, email) {
  const items = listings.map(l => `
    <tr>
      <td style="padding:16px;border-bottom:1px solid #2a2a2a;">
        <div style="font-size:16px;font-weight:600;color:#f5f5f5;margin-bottom:4px;">${escapeHtml(l.titulo)}</div>
        <div style="font-size:18px;color:#f59e0b;font-weight:700;margin-bottom:6px;">${escapeHtml(l.precio || 'Consultar')}</div>
        <div style="font-size:13px;color:#a3a3a3;margin-bottom:10px;">
          ${escapeHtml(l.ubicacion || '')} ${l.kilometraje ? '· ' + escapeHtml(l.kilometraje) : ''} · ${escapeHtml(l.portal || '')}
        </div>
        <a href="${escapeHtml(l.url)}" style="display:inline-block;background:#f59e0b;color:#000;padding:8px 16px;text-decoration:none;border-radius:6px;font-weight:600;font-size:13px;">Ver en ${escapeHtml(l.portal || 'portal')} →</a>
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#141414;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:24px;border-bottom:1px solid #2a2a2a;">
          <div style="font-size:11px;letter-spacing:2px;color:#f59e0b;text-transform:uppercase;margin-bottom:4px;">TIXUZ IA · Alerta diaria</div>
          <div style="font-size:22px;color:#f5f5f5;font-weight:700;">${listings.length} ${listings.length === 1 ? 'auto nuevo' : 'autos nuevos'}</div>
          <div style="font-size:13px;color:#a3a3a3;margin-top:6px;">Búsqueda: <em>${escapeHtml(query)}</em></div>
        </td></tr>
        ${items}
        <tr><td style="padding:20px 24px;background:#0f0f0f;font-size:11px;color:#737373;text-align:center;">
          Te llegan estas alertas porque activaste Tixuz IA Premium. <br>
          Tu suscripción dura 30 días desde el pago.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
