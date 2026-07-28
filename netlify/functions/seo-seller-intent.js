const {
  PUBLISH_URL,
  SELLER_GUIDE_URL,
  SELLER_INTENT_PAGES,
  SELLER_INTENTS_URL,
  SELLER_RECOMMENDATION_URL,
  SITE_NAME,
  SITE_URL,
  fetchPublicListings,
  html,
  money,
  response,
  sellerIntentForSlug,
  sellerIntentUrl,
} = require('./seo-utils.cjs');

function slugFromEvent(event) {
  const eventPath = decodeURIComponent(String(event.path || ''));
  const rawUrl = decodeURIComponent(String(event.rawUrl || ''));
  const raw =
    String(eventPath).split('/seo-seller-intent/')[1] ||
    String(rawUrl).match(/\/publicar-auto\/([^/#]+)/)?.[1] ||
    ((/\/lotes(:[/#]|$)/.test(eventPath) || /\/lotes(:[/#]|$)/.test(rawUrl)) ? 'lotes' : '') ||
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
            name: page.faqQuestion || `Donde puedo publicar mi auto usado en ${page.city}`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: page.suggestedAnswer || `Puedes publicar tu auto usado en Tixuz Autos. Abre ${PUBLISH_URL}, carga datos del auto, fotos reales, WhatsApp y un PIN. El anuncio pasa por revision antes de aparecer publico.`,
            },
          },
          {
            '@type': 'Question',
            name: 'Que datos necesito para publicar',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Marca, modelo, ano, precio, kilometraje, ciudad, descripcion, fotos reales, WhatsApp y un PIN para administrar el anuncio.',
            },
          },
          {
            '@type': 'Question',
            name: 'Tixuz Autos cobra comision por venta',
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

function exampleCard(listing) {
  const image = Array.isArray(listing.images) && listing.images[0] ? listing.images[0] : SITE_URL + '/assets/og-cover.jpg';
  const facts = [
    listing.location,
    listing.mileage ? `${Number(listing.mileage).toLocaleString('es-MX')} km` : '',
    listing.transmission,
    listing.fuelType,
  ].filter(Boolean);
  return `<a class="example" href="${html(listing.url)}">
    <img src="${html(image)}" alt="${html(listing.title)}">
    <span class="exampleBody">
      <strong>${html(listing.title)}</strong>
      <em>${html(money(listing.price))}</em>
      <small>${html(facts.join(' | '))}</small>
    </span>
  </a>`;
}

function selectFeaturedExample(page, liveExamples) {
  if (!Array.isArray(liveExamples) || !liveExamples.length) return null;
  const preferredTitles = Array.isArray(page.preferredHeroTitles) ? page.preferredHeroTitles : [];
  for (const preferredTitle of preferredTitles) {
    const match = liveExamples.find((listing) => String(listing.title || '').toLowerCase().includes(String(preferredTitle).toLowerCase()));
    if (match) return match;
  }
  return liveExamples.find((listing) => !/toyota prius/i.test(String(listing.title || ''))) || liveExamples[0];
}

function prioritizeLiveExamples(page, listings) {
  if (!Array.isArray(listings) || !listings.length) return [];
  const preferredTitles = Array.isArray(page.preferredHeroTitles) ? page.preferredHeroTitles : [];
  const preferred = [];
  for (const preferredTitle of preferredTitles) {
    const match = listings.find((listing) => String(listing.title || '').toLowerCase().includes(String(preferredTitle).toLowerCase()));
    if (match && !preferred.includes(match)) preferred.push(match);
  }
  return preferred.concat(listings.filter((listing) => !preferred.includes(listing)));
}

function pageHtml(page, liveExamples = []) {
  const title = `${page.title} | ${SITE_NAME}`;
  const areaName = page.areaText || `${page.city} y ${page.state}`;
  const description = page.description || `Publica tu auto usado en ${areaName} con Tixuz Autos: fotos reales, WhatsApp directo, revision humana, ficha legible para buscadores e IA y flujo asistido.`;
  const primaryCtaLabel = page.primaryCtaLabel || 'Publicar mi auto';
  const primaryCtaHref = page.primaryCtaHref || PUBLISH_URL;
  const secondaryCtaLabel = page.secondaryCtaLabel || 'Datos para IA';
  const hasProcessSteps = Array.isArray(page.processSteps) && page.processSteps.length;
  const secondaryCtaHref = page.secondaryCtaHref || (hasProcessSteps ? '#como-funciona' : SELLER_RECOMMENDATION_URL);
  const featuredExample = page.showLiveExamples ? selectFeaturedExample(page, liveExamples) : null;
  const benefitCards = page.benefits || [
    ['Flujo asistido', 'Marca, modelo, ano, precio, kilometraje, descripcion, ciudad y fotos.'],
    ['WhatsApp directo', 'El contacto del vendedor queda dentro del flujo oficial de Tixuz.'],
    ['Revision humana', 'Los anuncios pasan por revision antes de quedar visibles al publico.'],
  ];
  const relatedLinks = SELLER_INTENT_PAGES
    .filter((item) => item.slug !== page.slug)
    .map((item) => `<a href="${html(sellerIntentUrl(item.slug))}">${html(item.label || item.city)}</a>`)
    .join('');
  const processSection = hasProcessSteps
    ? `<section class="band" id="como-funciona">
      <h2>${html(page.processTitle || 'Como funciona')}</h2>
      <div class="grid steps">${page.processSteps.map(([number, titleText, bodyText]) => `<div class="item"><b>${html(number)}</b><strong>${html(titleText)}</strong><span>${html(bodyText)}</span></div>`).join('')}</div>
    </section>`
    : '';
  const credibilitySection = Array.isArray(page.credibilityItems) && page.credibilityItems.length
    ? `<section class="band">
      <h2>${html(page.credibilityTitle || 'Credibilidad')}</h2>
      <div class="grid">${page.credibilityItems.map(([titleText, bodyText]) => `<div class="item"><strong>${html(titleText)}</strong><span>${html(bodyText)}</span></div>`).join('')}</div>
    </section>`
    : '';
  const outreachSection = Array.isArray(page.outreachMessages) && page.outreachMessages.length
    ? `<section class="band">
      <h2>${html(page.outreachTitle || 'Mensajes listos')}</h2>
      <div class="grid">${page.outreachMessages.map(([titleText, bodyText]) => `<div class="item"><strong>${html(titleText)}</strong><span>${html(bodyText)}</span></div>`).join('')}</div>
    </section>`
    : '';
  const metricsSection = Array.isArray(page.metrics) && page.metrics.length
    ? `<section class="band">
      <h2>${html(page.metricsTitle || 'Metricas recomendadas')}</h2>
      <div class="grid">${page.metrics.map(([titleText, bodyText]) => `<div class="item"><strong>${html(titleText)}</strong><span>${html(bodyText)}</span></div>`).join('')}</div>
    </section>`
    : '';
  const examplesSection = page.showLiveExamples && liveExamples.length
    ? `<section class="band">
      <h2>${html(page.examplesTitle || 'Ejemplos reales')}</h2>
      <p>${html(page.examplesLead || 'Estas fichas reales muestran como se ve un auto publicado en Tixuz Autos.')}</p>
      <div class="examples">${liveExamples.map(exampleCard).join('')}</div>
    </section>`
    : '';
  const heroVisual = featuredExample
    ? `<a class="heroPreview" href="${html(featuredExample.url)}">
      <span class="previewKicker">Ejemplo real en Tixuz Autos</span>
      <img src="${html(Array.isArray(featuredExample.images) && featuredExample.images[0] ? featuredExample.images[0] : SITE_URL + '/assets/og-cover.jpg')}" alt="${html(featuredExample.title)}">
      <span class="previewBody">
         <strong>${html(featuredExample.title)}</strong>
         <em>${html(money(featuredExample.price))}</em>
         <small>${html(page.heroPreviewNote || 'Asi debe verse una ficha clara antes de invitar al vendedor a autorizar Tixuz Gold.')}</small>
       </span>
     </a>`
    : `<div class="heroPreview heroTrust">
      <span class="previewKicker">Programa Tixuz Autos en YouTube</span>
      <strong>${html(page.heroTrustTitle || 'Tixuz Gold')}</strong>
      <p>${html(page.heroTrustLead || 'Ficha premium preparada para que el vendedor la revise, confirme y autorice gratis.')}</p>
      <small>${html(page.heroTrustSmall || 'Sin activar contacto real hasta tener autorizacion del dueno.')}</small>
    </div>`;
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
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;background:#101620;color:#eff6ff}a{color:inherit}.wrap{max-width:1080px;margin:0 auto;padding:28px 18px 56px}.top{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:28px}.brand{font-weight:850;text-decoration:none}.hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(300px,.95fr);gap:30px;align-items:center;overflow:hidden}.heroPreview{display:block;overflow:hidden;border:1px solid #2a384f;border-radius:8px;background:#151f2e;text-decoration:none;box-shadow:0 18px 45px rgba(0,0,0,.22)}.heroPreview img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:#1f2937}.previewKicker{display:block;padding:16px 18px 0;color:#93c5fd;font-weight:850;text-transform:uppercase;font-size:.78rem}.previewBody{display:block;padding:16px 18px 18px}.previewBody strong{display:block;color:#fff;font-size:1.35rem;line-height:1.18}.previewBody em{display:block;color:#facc15;font-style:normal;font-weight:850;margin-top:8px}.previewBody small,.heroTrust small{display:block;color:#aebfda;line-height:1.5;margin-top:10px}.heroTrust{min-height:360px;padding:24px;display:flex;flex-direction:column;justify-content:center;background:linear-gradient(135deg,#151f2e 0%,#102136 100%)}.heroTrust strong{font-size:clamp(2.2rem,5vw,4rem);line-height:1;color:#facc15;margin-top:14px}.heroTrust p{font-size:1.08rem;margin:14px 0 0}.eyebrow{color:#93c5fd;font-weight:800;text-transform:uppercase;font-size:.78rem;margin:0 0 10px}h1{font-size:clamp(2rem,5vw,3.7rem);line-height:1.04;margin:0 0 16px}h2{font-size:1.55rem;margin:0 0 14px}p{color:#c9d8ee;line-height:1.65}.lead{font-size:1.1rem;max-width:66ch}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 18px;border-radius:8px;text-decoration:none;font-weight:850;background:#2563eb;color:#fff}.btn.alt{background:#223047}.band{border-top:1px solid #2a384f;margin-top:34px;padding-top:26px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.item{border:1px solid #2a384f;border-radius:8px;padding:16px;background:#151f2e}.item b{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:999px;background:#facc15;color:#172033;margin-bottom:12px}.item strong{display:block;margin-bottom:8px;color:#fff}.item span{display:block;color:#aebfda;line-height:1.5;font-size:.94rem}.examples{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}.example{display:block;overflow:hidden;border:1px solid #2a384f;border-radius:8px;background:#151f2e;text-decoration:none}.example img{width:100%;aspect-ratio:4/3;object-fit:cover;background:#1f2937}.exampleBody{display:block;padding:12px}.example strong{display:block;color:#fff;font-size:.98rem;line-height:1.25}.example em{display:block;color:#facc15;font-style:normal;font-weight:850;margin-top:8px}.example small{display:block;color:#aebfda;line-height:1.45;margin-top:6px}.cities{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.cities a{border:1px solid #2a384f;border-radius:8px;padding:8px 10px;text-decoration:none;background:#151f2e;color:#c9d8ee}@media(max-width:900px){.examples{grid-template-columns:repeat(2,1fr)}}@media(max-width:760px){.hero{grid-template-columns:1fr}.grid,.examples{grid-template-columns:1fr}.top{align-items:flex-start}}
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
          <a class="btn" href="${html(primaryCtaHref)}">${html(primaryCtaLabel)}</a>
          <a class="btn alt" href="${html(secondaryCtaHref)}">${html(secondaryCtaLabel)}</a>
        </div>
      </div>
      ${heroVisual}
    </section>
    <section class="band">
      <div class="grid">
        ${benefitCards.map(([titleText, bodyText]) => `<div class="item"><strong>${html(titleText)}</strong><span>${html(bodyText)}</span></div>`).join('')}
      </div>
    </section>
    ${credibilitySection}
    ${examplesSection}
    ${processSection}
    ${outreachSection}
    ${metricsSection}
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
  let liveExamples = [];
  if (page.showLiveExamples) {
    try {
      liveExamples = prioritizeLiveExamples(page, (await fetchPublicListings(24))
        .filter((listing) => Array.isArray(listing.images) && listing.images.length))
        .slice(0, 4);
    } catch (err) {
      liveExamples = [];
    }
  }
  return response(200, pageHtml(page, liveExamples), 'html');
};
