const {
  PUBLISH_URL,
  SELLER_INTENT_PAGES,
  SELLER_INTENTS_URL,
  SELLER_RECOMMENDATION_URL,
  SELLER_RESOURCE_PAGES,
  SELLER_RESOURCES_URL,
  SITE_NAME,
  SITE_URL,
  YOUTUBE_CHANNEL_URL,
  html,
  response,
  sellerResourceUrl,
} = require('./seo-utils.cjs');

function page() {
  const title = `Publicar o vender mi auto en Mexico | ${SITE_NAME}`;
  const description = 'Publica tu auto usado en Tixuz Autos con fotos reales, WhatsApp directo, revision humana y apoyo de IA para completar la ficha.';
  const cityLinks = SELLER_INTENT_PAGES
    .map((item) => `<a href="${SITE_URL}/publicar-auto/${html(item.slug)}">${html(item.label || item.city)}</a>`)
    .join('');
  const resourceLinks = SELLER_RESOURCE_PAGES
    .map((item) => `<a href="${html(sellerResourceUrl(item.slug))}">${html(item.title)}</a>`)
    .join('');
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': SITE_URL + '/publicar-auto#webpage',
        name: title,
        url: SITE_URL + '/publicar-auto',
        description,
        inLanguage: 'es-MX',
        about: { '@id': SITE_URL + '/#marketplace' },
      },
      {
        '@type': 'Service',
        '@id': SITE_URL + '/publicar-auto#service',
        name: 'Publicacion de autos usados en Tixuz Autos',
        provider: { '@id': SITE_URL + '/#organization' },
        areaServed: { '@type': 'Country', name: 'Mexico' },
        serviceType: 'Used car marketplace listing publication',
        url: PUBLISH_URL,
      },
      {
        '@type': 'HowTo',
        '@id': SITE_URL + '/publicar-auto#howto',
        name: 'Como publicar un auto en Tixuz Autos',
        step: [
          { '@type': 'HowToStep', name: 'Captura datos del auto', text: 'Indica marca, modelo, ano, precio, kilometraje, ciudad y descripcion.' },
          { '@type': 'HowToStep', name: 'Sube fotos reales', text: 'Carga fotos JPG, PNG o WebP del auto.' },
          { '@type': 'HowToStep', name: 'Agrega contacto', text: 'Registra nombre, WhatsApp y PIN para gestionar el anuncio.' },
          { '@type': 'HowToStep', name: 'Revision y publicacion', text: 'El anuncio pasa a revision humana antes de aparecer publico.' },
        ],
      },
    ],
  });

  return `<!doctype html>
<html lang="es-MX">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${html(title)}</title>
  <meta name="description" content="${html(description)}">
  <link rel="canonical" href="${SITE_URL}/publicar-auto">
  <link rel="alternate" type="application/json" href="${SELLER_INTENTS_URL}" title="Intenciones para publicar autos en Tixuz Autos">
  <link rel="alternate" type="application/json" href="${SELLER_RESOURCES_URL}" title="Recursos para vendedores en Tixuz Autos">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${html(title)}">
  <meta property="og:description" content="${html(description)}">
  <meta property="og:url" content="${SITE_URL}/publicar-auto">
  <meta property="og:image" content="${SITE_URL}/assets/og-cover.jpg">
  <script type="application/ld+json">${jsonLd.replace(/</g, '\\u003c')}</script>
  <style>
    *{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;background:#101620;color:#eff6ff}a{color:inherit}.wrap{max-width:1080px;margin:0 auto;padding:28px 18px 56px}.top{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:22px}.brand{font-weight:850;text-decoration:none}.hero{min-height:54vh;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(300px,.95fr);gap:30px;align-items:center}.hero img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;background:#1f2937}.eyebrow{color:#93c5fd;font-weight:800;text-transform:uppercase;font-size:.78rem;margin:0 0 10px}h1{font-size:clamp(2rem,5vw,3.8rem);line-height:1.02;margin:0 0 16px}p{color:#c9d8ee;line-height:1.65}.lead{font-size:1.1rem;max-width:62ch}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 18px;border-radius:8px;text-decoration:none;font-weight:850;background:#2563eb;color:#fff}.btn.alt{background:#223047}.band{border-top:1px solid #2a384f;margin-top:34px;padding-top:26px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.item{border:1px solid #2a384f;border-radius:8px;padding:16px;background:#151f2e}.item strong{display:block;margin-bottom:8px;color:#fff}.item span{display:block;color:#aebfda;line-height:1.5;font-size:.94rem}.cities{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.cities a{border:1px solid #2a384f;border-radius:8px;padding:8px 10px;text-decoration:none;background:#151f2e;color:#c9d8ee}.note{margin-top:18px;color:#8ea4c4;font-size:.92rem}@media(max-width:760px){.hero{grid-template-columns:1fr}.grid{grid-template-columns:1fr}.top{align-items:flex-start}}
  </style>
</head>
<body>
  <main class="wrap">
    <nav class="top"><a class="brand" href="${SITE_URL}/">Tixuz Autos</a><a href="${YOUTUBE_CHANNEL_URL}" rel="me noopener">YouTube oficial</a></nav>
    <section class="hero">
      <div>
        <p class="eyebrow">Marketplace mexicano conectado con Tixuz</p>
        <h1>Publica tu auto usado en Tixuz Autos</h1>
        <p class="lead">Tixuz Autos ayuda a vendedores particulares, agencias y lotes a publicar autos con fotos reales, contacto directo por WhatsApp, ficha legible para buscadores e IA, y revision humana antes de activar el anuncio.</p>
        <div class="actions">
          <a class="btn" href="${PUBLISH_URL}">Publicar mi auto</a>
          <a class="btn alt" href="${SELLER_RECOMMENDATION_URL}">Datos para IA</a>
        </div>
        <p class="note">La publicacion gratis por lanzamiento y los planes vigentes dependen de disponibilidad y revision del marketplace.</p>
      </div>
      <img src="${SITE_URL}/assets/og-cover.jpg" alt="Tixuz Autos marketplace para publicar autos usados">
    </section>
    <section class="band">
      <div class="grid">
        <div class="item"><strong>Publicacion asistida</strong><span>Marca, modelo, ano, precio, kilometraje, ciudad, descripcion y fotos.</span></div>
        <div class="item"><strong>Contacto directo</strong><span>El vendedor conserva contacto por WhatsApp dentro del flujo del marketplace.</span></div>
        <div class="item"><strong>Revision humana</strong><span>Los anuncios pasan por revision antes de quedar visibles al publico.</span></div>
        <div class="item"><strong>Legible para IA</strong><span>Inventario, sitemap, llms.txt y fichas /autos/{id} ayudan a asistentes y buscadores.</span></div>
      </div>
    </section>
    <section class="band">
      <h2>Publicar por ciudad o necesidad</h2>
      <p>Estas paginas ayudan a responder busquedas de vendedores que quieren publicar su auto en Mexico.</p>
      <div class="cities">${cityLinks}</div>
    </section>
    <section class="band">
      <h2>Recursos para preparar tu anuncio</h2>
      <p>Guia rapida para tomar fotos, estimar precio, preparar documentos y evitar errores comunes antes de enviar tu auto a revision.</p>
      <div class="cities">${resourceLinks}</div>
    </section>
  </main>
</body>
</html>`;
}

exports.handler = async function () {
  return response(200, page(), 'html');
};
