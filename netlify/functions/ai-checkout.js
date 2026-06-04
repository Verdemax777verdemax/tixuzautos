// Tixuz AI · Crear sesión de checkout para Premium $49 MXN
// Reusa la STRIPE_SECRET_KEY ya configurada en Netlify por el marketplace.
// Crea sesión, guarda metadata (email, whatsapp, query) y redirige a Stripe.

const Stripe = require('stripe');

function siteBaseUrl() {
  return String(process.env.SITE_URL || 'https://tixuzautos.com').replace(/\/$/, '');
}

function safeReturnBase(origin) {
  const fallback = siteBaseUrl();
  try {
    const allowed = new URL(fallback);
    const incoming = new URL(String(origin || fallback));
    if (incoming.protocol === 'https:' && incoming.hostname === allowed.hostname) {
      return incoming.origin;
    }
  } catch {}
  return fallback;
}

exports.handler = async function (event) {
  const cors = {
    'Access-Control-Allow-Origin': siteBaseUrl(),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: 'STRIPE_SECRET_KEY not configured' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { email, whatsapp, query, origin } = body;

  // Validaciones
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Email inválido' }) };
  }
  if (!query || query.length < 3) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Query muy corta' }) };
  }
  // WhatsApp opcional. Si viene, validar formato MX (10 dígitos o con +52)
  let waClean = '';
  if (whatsapp) {
    waClean = String(whatsapp).replace(/\D/g, '');
    if (waClean.startsWith('52') && waClean.length === 12) waClean = waClean.slice(2);
    if (waClean.length !== 10) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'WhatsApp inválido (10 dígitos México)' }) };
    }
  }

  const baseUrl = safeReturnBase(origin);

  try {
    const stripe = Stripe(stripeKey);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      currency: 'mxn',
      line_items: [
        {
          price_data: {
            currency: 'mxn',
            product_data: {
              name: 'Tixuz IA · Búsqueda Premium 30 días',
              description: 'Alertas diarias por email + WhatsApp con autos nuevos que coincidan con tu búsqueda. Incluye reseña del modelo y comparativa de precios.',
            },
            unit_amount: 4900, // $49.00 MXN en centavos
          },
          quantity: 1,
        },
      ],
      customer_email: email,
      metadata: {
        product: 'tixuz_ai_premium_search',
        whatsapp: waClean || '',
        query: query.slice(0, 480),
      },
      success_url: `${baseUrl}/buscar-con-ia.html?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/buscar-con-ia.html?paid=0`,
    });

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ url: session.url, id: session.id }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: 'Stripe error', detail: String(err.message).slice(0, 300) }),
    };
  }
};
