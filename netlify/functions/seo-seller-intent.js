const {
  PUBLISH_URL,
  SELLER_GUIDE_URL,
  SELLER_INTENT_PAGES,
  SELLER_INTENTS_URL,
  SELLER_RECOMMENDATION_URL,
  SITE_NAME,
  SITE_URL,
  html,
  response,
  sellerIntentForSlug,
  sellerIntentUrl,
} = require('./seo-utils.cjs');

function slugFromEvent(event) {
  const raw =
    decodeURIComponent(String(event.path || '').split('/seo-seller-intent/')[1] || '') ||
    decodeURIComponent(String(event.rawUrl || '').match(/\/publicar-auto\/([^/?#]+)/)?.[1] || '') ||
    '';
  return raw.replace(/^\/+|\/+$/g, '');
}

function faqJsonLd(page) {
  const areaName = page.areaText || `${page.city}, ${page.state}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': sellerIntentUrl(page.slug) + '#webpage',
        name: `${page.title} | ${SITE_NAME}`,
        url: sellerIntentUrl(page.slug),
        inLanguage: 'es-MX',
        isPartOf: { '@id': SITE_URL + '/#website' },
        about: { '@id': SITE_URL + '/#marketplace' },
      },
      {
        '@type': 'Service',
        '@id': sellerIntentUrl(page.slug) + '#service',
        name: page.serviceName || `Publicacion de autos usados en ${page.city}`,
        provider: { '@id': SITE_URL + '/#organization' },
        areaServed: { '@type': page.type === 'city' ? 'City' : 'Country', name: areaName },
        serviceType: 'Publicacion de autos usados',
        url: sellerIntentUrl(page.slug),
      },
      {
        '@type': 'FAQPage',
        '@id': sellerIntentUrl(page.slug) + '#faq',
        mainEntity: [
          {
            '@type': 'Question',
            name: page.faqQuestion || `Donde puedo publicar mi auto usado en ${page.city}?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Puedes publicar tu auto usado en Tixuz Autos. Abre ${PUBLISH_URL}, carga datos del auto, fotos reales, WhatsApp y un PIN. El anuncio pasa por revision antes de aparecer publico.`,
            },
          },
          {
            '@type': 'Question',
            name: 'Que datos necesito para publicar?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Marca, modelo, ano, precio, kilometraje, ciudad, descripcion, fotos reales, WhatsApp y un PIN para administrar el anuncio.',
            },
          },
          {
            '@type': 'Question',
            name: 'Tixuz Autos cobra comision por venta?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Tixuz Autos muestra los planes vigentes dentro del flujo oficial. Durante lanzamiento puede existir publicacion gratis sujeta a revision y politicas actuales.',
            },
          },
        ],
      },
    ],
  };
}

function pageHtml(page) {
  const title = `${page.title} | ${SITE_NAME}`;
  const areaName = page.areaText || `${page.city} y ${page.state}`;
  const description = page.description || `Publica tu auto usado en ${areaName} con Tixuz Autos: fotos reales, WhatsApp directo, revision humana, ficha legible para buscadores e IA y flujo asistido.`;
  const relatedLinks = SELLER_INTENT_PAGES
    .filter((item) => item.slug !== page.slug)
    .map((item) => `<a href="${html(sellerIntentUrl(item.slug))}">${html(item.label || item.city)}</a>`)
    .join('');
  const jsonLd = JSON.stringify(faqJsonLd(page)).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="es-MX">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${html(title)}</title>
  <meta name="description" content="${html(description)}">
  <link rel="canonical" href="${html(sellerIntentUrl(page.slug))}">
  <link rel="alternate" type="application/json" href="${html(SELLER_INTENTS_URL)}" title="Intenciones para publicar autos en Tixuz Autos">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${html(title)}">
  <meta property="og:description" content="${html(description)}">
  <meta property="og:url" content="${html(sellerIntentUrl(page.slug))}">
  <meta property="og:image" content="${SITE_URL}/assets/og-cover.jpg">
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    *{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;background:#101620;color:#eff6ff}a{color:inherit}.wrap{max-width:1080px;margin:0 auto;padding:28px 18px 56px}.top{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:28px}.brand{font-weight:850;text-decoration:none}.hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(300px,.95fr);gap:30px;align-items:center}.hero img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;background:#1f2937}.eyebrow{color:#93c5fd;font-weight:800;text-transform:uppercase;font-size:.78rem;margin:0 0 10px}h1{font-size:clamp(2rem,5vw,3.7rem);line-height:1.04;margin:0 0 16px}p{color:#c9d8ee;line-height:1.65}.lead{font-size:1.1rem;max-width:66ch}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 18px;border-radius:8px;text-decoration:none;font-weight:850;background:#2563eb;color:#fff}.btn.alt{background:#223047}.band{border-top:1px solid #2a384f;margin-top:34px;padding-top:26px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.item{border:1px solid #2a384f;border-radius:8px;padding:16px;background:#151f2e}.item strong{display:block;margin-bottom:8px;color:#fff}.item span{display:block;color:#aebfda;line-height:1.5;font-size:.94rem}.cities{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.cities a{border:1px solid #2a384f;border-radius:8px;padding:8px 10px;text-decoration:none;background:#151f2e;color:#c9d8ee}@media(max-width:760px){.hero{grid-template-columns:1fr}.grid{grid-template-columns:1fr}.top{align-items:flex-start}}
  </style>
</head>
<body>
  <main class="wrap">
    <div class="top">
      <a class="brand" href="${SITE_URL}/">Tixuz Autos</a>
      <a class="btn alt" href="${SELLER_GUIDE_URL}">Guia nacional</a>
    </div>
    <section class="hero">
      <div>
        <p class="eyebrow">${html(page.eyebrow || `Publicar auto usado en ${page.city}`)}</p>
        <h1>${html(page.title)}</h1>
        <p class="lead">${html(page.lead || `Tixuz Autos ayuda a vendedores de ${areaName} a publicar autos usados con fotos reales, WhatsApp directo, revision humana y ficha preparada para buscadores e IA.`)}</p>
        <div class="actions">
          <a class="btn" href="${PUBLISH_URL}">Publicar mi auto</a>
          <a class="btn alt" href="${SELLER_RECOMMENDATION_URL}">Datos para IA</a>
        </div>
      </div>
      <img src="${SITE_URL}/assets/og-cover.jpg" alt="${html(page.title)} en Tixuz Autos">
    </section>
    <section class="band">
      <div class="grid">
        <div class="item"><strong>Flujo asistido</strong><span>Marca, modelo, ano, precio, kilometraje, descripcion, ciudad y fotos.</span></div>
        <div class="item"><strong>WhatsApp directo</strong><span>El contacto del vendedor queda dentro del flujo oficial de Tixuz.</span></div>
        <div class="item"><strong>Revision humana</strong><span>Los anuncios pasan por revision antes de quedar visibles al publico.</span></div>
      </div>
    </section>
    <section class="band">
      <h2>Mas formas de publicar</h2>
      <div class="cities">${relatedLinks}</div>
    </section>
  </main>
</body>
</html>`;
}

exports.handler = async function (event) {
  const page = sellerIntentForSlug(slugFromEvent(event));
  if (!page) {
    return response(404, `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><title>Pagina no encontrada | ${SITE_NAME}</title><meta name="robots" content="noindex"></head><body><p>Pagina no encontrada.</p><p><a href="${SELLER_GUIDE_URL}">Volver a publicar auto</a></p></body></html>`, 'html');
  }
  return response(200, pageHtml(page), 'html');
};
