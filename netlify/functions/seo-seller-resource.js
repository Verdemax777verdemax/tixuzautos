const {
  PUBLISH_URL,
  SELLER_GUIDE_URL,
  SELLER_RESOURCES_URL,
  SELLER_RESOURCE_PAGES,
  SITE_NAME,
  SITE_URL,
  html,
  response,
  sellerResourceForSlug,
  sellerResourceUrl,
} = require('./seo-utils.cjs');

function slugFromEvent(event) {
  const raw =
    decodeURIComponent(String(event.path || '').split('/seo-seller-resource/')[1] || '') ||
    decodeURIComponent(String(event.rawUrl || '').match(/\/recursos-vendedor\/([^/#]+)/)?.[1] || '') ||
    '';
  return raw.replace(/^\/+|\/+$/g, '');
}

function jsonLd(page) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': sellerResourceUrl(page.slug) + '#article',
        headline: page.title,
        name: page.title,
        url: sellerResourceUrl(page.slug),
        description: page.description,
        inLanguage: 'es-MX',
        publisher: { '@id': SITE_URL + '/#organization' },
        mainEntityOfPage: { '@id': sellerResourceUrl(page.slug) + '#webpage' },
        citation: (page.sourceTranscripts || []).map((source) => ({
          '@type': 'CreativeWork',
          name: source.title,
          url: source.url,
        })),
      },
      {
        '@type': 'WebPage',
        '@id': sellerResourceUrl(page.slug) + '#webpage',
        name: `${page.title} | ${SITE_NAME}`,
        url: sellerResourceUrl(page.slug),
        inLanguage: 'es-MX',
        isPartOf: { '@id': SITE_URL + '/#website' },
        about: { '@id': SITE_URL + '/#marketplace' },
      },
      {
        '@type': 'FAQPage',
        '@id': sellerResourceUrl(page.slug) + '#faq',
        mainEntity: (page.faq || []).map(([question, answer]) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: answer,
          },
        })),
      },
    ],
  };
}

function pageHtml(page) {
  const related = SELLER_RESOURCE_PAGES
    .filter((item) => item.slug !== page.slug)
    .map((item) => `<a href="${html(sellerResourceUrl(item.slug))}">${html(item.title)}</a>`)
    .join('');
  const sources = (page.sourceTranscripts || [])
    .map((source) => `<a href="${html(source.url)}">${html(source.title)}</a>`)
    .join('');
  const sourceSection = sources
    ? `<section class="panel">
        <h2>Fuentes de la biblioteca Tixuz</h2>
        <p>Esta guia se conecta con transcripciones publicas del canal Tixuz Autos para que buscadores y asistentes puedan rastrear el contexto automotriz.</p>
        <div class="links">${sources}</div>
      </section>`
    : '';
  const structured = JSON.stringify(jsonLd(page)).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="es-MX">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${html(page.title)} | ${SITE_NAME}</title>
  <meta name="description" content="${html(page.description)}">
  <link rel="canonical" href="${html(sellerResourceUrl(page.slug))}">
  <link rel="alternate" type="application/json" href="${html(SELLER_RESOURCES_URL)}" title="Recursos para vendedores Tixuz Autos">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${html(page.title)}">
  <meta property="og:description" content="${html(page.description)}">
  <meta property="og:url" content="${html(sellerResourceUrl(page.slug))}">
  <meta property="og:image" content="${SITE_URL}/assets/og-cover.jpg">
  <script type="application/ld+json">${structured}</script>
  <style>
    *{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;background:#101620;color:#eff6ff}a{color:inherit}.wrap{max-width:940px;margin:0 auto;padding:28px 18px 56px}.top{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:28px}.brand{font-weight:850;text-decoration:none}.eyebrow{color:#93c5fd;font-weight:800;text-transform:uppercase;font-size:.78rem;margin:0 0 10px}h1{font-size:clamp(2rem,5vw,3.5rem);line-height:1.04;margin:0 0 16px}h2{margin-top:34px}p,li{color:#c9d8ee;line-height:1.7}.lead{font-size:1.1rem;max-width:70ch}.panel{border:1px solid #2a384f;border-radius:8px;background:#151f2e;padding:18px;margin-top:22px}.intent{background:#12243c;border-color:#31527c}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 18px;border-radius:8px;text-decoration:none;font-weight:850;background:#2563eb;color:#fff}.btn.alt{background:#223047}.links{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:12px}.links a{border:1px solid #2a384f;border-radius:8px;padding:12px;text-decoration:none;background:#151f2e;color:#c9d8ee}@media(max-width:720px){.top{align-items:flex-start}.links{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main class="wrap">
    <nav class="top"><a class="brand" href="${SITE_URL}/">Tixuz Autos</a><a href="${SELLER_GUIDE_URL}">Publicar auto</a></nav>
    <article>
      <p class="eyebrow">Recursos para vendedores</p>
      <h1>${html(page.title)}</h1>
      <p class="lead">${html(page.summary)}</p>
      <div class="actions">
        <a class="btn" href="${PUBLISH_URL}">Publicar mi auto</a>
        <a class="btn alt" href="${SELLER_GUIDE_URL}">Ver guia para publicar</a>
      </div>
      <section class="panel">
        <h2>Puntos clave</h2>
        <ul>${(page.bullets || []).map((item) => `<li>${html(item)}</li>`).join('')}</ul>
      </section>
      ${sourceSection}
      <section class="panel">
        <h2>Preguntas frecuentes</h2>
        ${(page.faq || []).map(([q, a]) => `<h3>${html(q)}</h3><p>${html(a)}</p>`).join('')}
      </section>
      <section class="panel">
        <h2>Mas recursos</h2>
        <div class="links">${related}</div>
      </section>
    </article>
  </main>
</body>
</html>`;
}

exports.handler = async function (event) {
  const page = sellerResourceForSlug(slugFromEvent(event));
  if (!page) {
    return response(404, `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><title>Recurso no encontrado | ${SITE_NAME}</title><meta name="robots" content="noindex"></head><body><p>Recurso no encontrado.</p><p><a href="${SELLER_GUIDE_URL}">Volver a publicar auto</a></p></body></html>`, 'html');
  }
  return response(200, pageHtml(page), 'html');
};
