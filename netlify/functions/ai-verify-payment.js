// Tixuz AI · Verificar pago y activar suscripción de búsqueda premium 30 días
// Llamado desde el frontend después del redirect de Stripe (paid=1&session_id=...)
// Verifica con Stripe que el pago esté completo y crea registro en Supabase.

const Stripe = require('stripe');

exports.handler = async function (event) {
  const siteUrl = String(process.env.SITE_URL || 'https://tixuzautos.com').replace(/\/$/, '');
  const cors = {
    'Access-Control-Allow-Origin': siteUrl,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supaUrl = process.env.SUPABASE_URL;
  const supaServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeKey || !supaUrl || !supaServiceKey) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: 'Missing env vars', missing: { stripe: !stripeKey, supa: !supaUrl, supaKey: !supaServiceKey } }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const sessionId = body.session_id;
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid session_id' }) };
  }

  try {
    const stripe = Stripe(stripeKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ ok: false, reason: 'not_paid', status: session.payment_status }),
      };
    }

    // Validar que sea nuestro producto
    if (session.metadata.product !== 'tixuz_ai_premium_search') {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Wrong product' }) };
    }

    const email = session.customer_email || session.customer_details.email;
    const whatsapp = session.metadata.whatsapp || '';
    const query = session.metadata.query || '';

    // Insertar/upsert en Supabase
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const subRow = {
      email: email.toLowerCase(),
      whatsapp,
      query,
      stripe_session_id: sessionId,
      amount_paid: session.amount_total,
      status: 'active',
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    };

    const supaRes = await fetch(`${supaUrl}/rest/v1/ai_search_subscriptions`, {
      method: 'POST',
      headers: {
        'apikey': supaServiceKey,
        'Authorization': `Bearer ${supaServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation,resolution=merge-duplicates',
      },
      body: JSON.stringify(subRow),
    });

    if (!supaRes.ok) {
      const errTxt = await supaRes.text();
      // Aunque falle Supabase, el pago YA se hizo. Devolvemos ok=true pero con flag.
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({
          ok: true,
          db_saved: false,
          db_error: errTxt.slice(0, 300),
          email,
          expires_at: expiresAt,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        ok: true,
        db_saved: true,
        email,
        expires_at: expiresAt,
        query: query.slice(0, 100),
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: 'Server error', detail: String(err.message).slice(0, 300) }),
    };
  }
};
