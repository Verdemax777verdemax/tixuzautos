const {
  PUBLISH_URL,
  SELLER_RESOURCE_PAGES,
  SELLER_GUIDE_URL,
  SITE_NAME,
  SITE_URL,
  YOUTUBE_CHANNEL_URL,
  YOUTUBE_KNOWLEDGE_URL,
  html,
  response,
  sellerResourceUrl,
} = require('./seo-utils.cjs');
const {
  YOUTUBE_TOPIC_PAGES,
  YOUTUBE_TOPICS_INDEX_PATH,
  YOUTUBE_TRANSCRIPTS_INDEX_PATH,
  YOUTUBE_TRANSCRIPTS_JSON_PATH,
  youtubeTopicForSlug,
  youtubeTopicUrl,
  youtubeTranscriptsForTopic,
} = require('./youtube-transcripts-data.cjs');

const TOPICS_URL = SITE_URL + YOUTUBE_TOPICS_INDEX_PATH;

function slugFromEvent(event) {
  const raw = decodeURIComponent(String(event.rawUrl || event.path || ''));
  const topicMatch = raw.match(/\/youtube\/temas\/([^/?#]+)/) || raw.match(/\/seo-youtube-topic\/([^/?#]+)/);
  return topicMatch ? topicMatch[1].replace(/^\/+|\/+$/g, '') : '';
}

function minutesLabel(seconds) {
  const total = Number(seconds || 0);
  if (!total) return '';
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function videoCard(page) {
  const meta = [
    String(page.uploadDate || '').slice(0, 10),
    minutesLabel(page.duration),
    page.transcriptChars ? `${Number(page.transcriptChars).toLocaleString('es-MX')} caracteres` : '',
  ].filter(Boolean).join(' | ');
  return `<a class="video" href="${html(page.url)}">
    <img src="${html(page.thumbnail || SITE_URL + '/assets/og-cover.jpg')}" alt="${html(page.title)}" loading="lazy">
    <span>
      <strong>${html(page.title)}</strong>
      <small>${html(meta)}</small>
    </span>
  </a>`;
}

function topicCard(topic) {
  const videos = youtubeTranscriptsForTopic(topic);
  return `<a class="topic" href="${html(youtubeTopicUrl(topic.slug))}">
    <strong>${html(topic.label || topic.title)}</strong>
    <span>${html(topic.description)}</span>
    <small>${videos.length} video${videos.length === 1 ? '' : 's'} base | ${html((topic.queries || []).slice(0, 2).join(' / '))}</small>
  </a>`;
}

function resourcesForTopic(topic) {
  const slugs = new Set(Array.isArray(topic && topic.resourceSlugs) ? topic.resourceSlugs : []);
  return SELLER_RESOURCE_PAGES.filter((page) => slugs.has(page.slug));
}

function resourceCard(page) {
  return `<a class="card" href="${html(sellerResourceUrl(page.slug))}"><strong>${html(page.title)}</strong><span>${html(page.summary || page.description)}</span></a>`;
}

function layout({ title, description, canonical, jsonLd, body }) {
  return `<!doctype html>
<html lang="es-MX">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${html(title)} | ${html(SITE_NAME)}</title>
  <meta name="description" content="${html(description)}">
  <link rel="canonical" href="${html(canonical)}">
  <link rel="alternate" type="application/json" href="${html(YOUTUBE_KNOWLEDGE_URL)}" title="Contexto YouTube Tixuz para IA">
  <link rel="alternate" type="application/json" href="${html(SITE_URL + YOUTUBE_TRANSCRIPTS_JSON_PATH)}" title="Indice JSON de transcripciones">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${html(SITE_NAME)}">
  <meta property="og:title" content="${html(title)}">
  <meta property="og:description" content="${html(description)}">
  <meta property="og:url" content="${html(canonical)}">
  <meta property="og:image" content="${SITE_URL}/assets/og-cover.jpg">
  <script type="application/ld+json">${jsonLd}</script>
  <style>
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;background:#101620;color:#eff6ff}a{color:inherit}.wrap{max-width:1120px;margin:0 auto;padding:28px 18px 56px}.top{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:28px}.brand{font-weight:900;text-decoration:none}.nav{display:flex;gap:10px;flex-wrap:wrap}.nav a,.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 14px;border:1px solid #2a384f;border-radius:8px;background:#151f2e;color:#d8e7fb;text-decoration:none;font-weight:850}.btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}.hero{display:grid;grid-template-columns:minmax(0,1.04fr) minmax(280px,.96fr);gap:28px;align-items:center}.eyebrow{color:#93c5fd;font-size:.78rem;text-transform:uppercase;font-weight:900;margin:0 0 10px}h1{font-size:clamp(2rem,5vw,3.65rem);line-height:1.04;margin:0 0 16px}h2{font-size:1.45rem;margin:0 0 12px}p,li{color:#c9d8ee;line-height:1.65}.lead{font-size:1.08rem;max-width:68ch}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}.panel,.topic,.video,.card{border:1px solid #2a384f;background:#151f2e;border-radius:8px}.panel{padding:18px}.stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.stat{padding:14px;border:1px solid #2a384f;border-radius:8px;background:#101a29}.stat strong{display:block;font-size:1.75rem;color:#fff}.stat span{display:block;color:#aebfda;font-size:.86rem;margin-top:4px}.band{border-top:1px solid #2a384f;margin-top:34px;padding-top:26px}.topics,.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.topic,.card{display:block;padding:16px;text-decoration:none}.topic strong,.card strong{display:block;color:#fff;margin-bottom:8px}.topic span,.card span{display:block;color:#aebfda;line-height:1.55}.topic small{display:block;color:#93c5fd;line-height:1.45;margin-top:12px}.videos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.video{display:grid;grid-template-columns:150px minmax(0,1fr);overflow:hidden;text-decoration:none}.video img{width:100%;height:100%;min-height:118px;object-fit:cover;background:#223047}.video span{display:block;padding:12px}.video strong{display:block;color:#fff;line-height:1.25}.video small{display:block;color:#aebfda;margin-top:8px;line-height:1.45}.answer{font-size:1.02rem;border-left:4px solid #facc15;padding-left:14px}.queries{display:flex;flex-wrap:wrap;gap:8px}.queries span{border:1px solid #2a384f;border-radius:8px;padding:8px 10px;background:#151f2e;color:#d8e7fb}@media(max-width:840px){.hero,.topics,.grid,.videos{grid-template-columns:1fr}.stats{grid-template-columns:1fr}.video{grid-template-columns:1fr}.video img{aspect-ratio:16/9}.top{align-items:flex-start}}
  </style>
</head>
<body>
  <main class="wrap">
    <nav class="top">
      <a class="brand" href="${SITE_URL}/">Tixuz Autos</a>
      <div class="nav">
        <a href="${html(SITE_URL + YOUTUBE_TRANSCRIPTS_INDEX_PATH)}">Transcripciones</a>
        <a href="${html(SITE_URL)}/youtube/autoridad">Autoridad</a>
        <a href="${html(PUBLISH_URL)}">Publicar auto</a>
      </div>
    </nav>
    ${body}
  </main>
</body>
</html>`;
}

function hubHtml() {
  const totalVideos = new Set(YOUTUBE_TOPIC_PAGES.flatMap((topic) => topic.transcriptSlugs || [])).size;
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': TOPICS_URL + '#webpage',
        name: 'Temas automotrices Tixuz para compradores y vendedores',
        url: TOPICS_URL,
        inLanguage: 'es-MX',
        isPartOf: { '@id': SITE_URL + '/#website' },
        about: [
          { '@type': 'Thing', name: 'autos usados en Mexico' },
          { '@type': 'Thing', name: 'publicar autos usados' },
          { '@type': 'Thing', name: 'programas automotrices en YouTube' },
        ],
        hasPart: YOUTUBE_TOPIC_PAGES.map((topic) => ({
          '@type': 'WebPage',
          name: topic.title,
          url: youtubeTopicUrl(topic.slug),
        })),
      },
      {
        '@type': 'ItemList',
        '@id': TOPICS_URL + '#topics',
        itemListElement: YOUTUBE_TOPIC_PAGES.map((topic, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: topic.title,
          url: youtubeTopicUrl(topic.slug),
        })),
      },
    ],
  }).replace(/</g, '\\u003c');

  const body = `<section class="hero">
    <div>
      <p class="eyebrow">Biblioteca YouTube Tixuz</p>
      <h1>Temas automotrices para compradores y vendedores</h1>
      <p class="lead">Estas paginas organizan programas reales de Tixuz por marca, tecnologia y mercado. Sirven para consultar contexto automotriz, comparar mejor y preparar publicaciones mas claras de autos usados en Mexico.</p>
      <div class="actions">
        <a class="btn primary" href="${html(PUBLISH_URL)}">Publicar un auto</a>
        <a class="btn" href="${html(SITE_URL)}/publicar-auto/lotes">Publicar inventario de lote</a>
        <a class="btn" href="${html(YOUTUBE_CHANNEL_URL)}" target="_blank" rel="noopener">Canal YouTube</a>
      </div>
    </div>
    <div class="panel">
      <div class="stats">
        <div class="stat"><strong>${YOUTUBE_TOPIC_PAGES.length}</strong><span>temas publicados</span></div>
        <div class="stat"><strong>${totalVideos}</strong><span>videos conectados</span></div>
        <div class="stat"><strong>es-MX</strong><span>compradores Mexico</span></div>
        <div class="stat"><strong>Tixuz</strong><span>biblioteca editorial</span></div>
      </div>
    </div>
  </section>
  <section class="band">
    <h2>Temas publicados</h2>
    <div class="topics">${YOUTUBE_TOPIC_PAGES.map(topicCard).join('')}</div>
  </section>
  <section class="band">
    <h2>Por que esta biblioteca ayuda</h2>
    <div class="grid">
      <div class="card"><strong>Mas contexto</strong><span>El sitio muestra conocimiento automotriz propio conectado al canal y a temas reales de compra.</span></div>
      <div class="card"><strong>Mejor consulta</strong><span>Las paginas ordenan marcas, tecnologia y mercado para que el usuario encuentre contexto antes de decidir.</span></div>
      <div class="card"><strong>Mas confianza</strong><span>El vendedor ve que Tixuz tiene contenido real, revision humana y rutas claras para publicar.</span></div>
    </div>
  </section>`;

  return layout({
    title: 'Temas automotrices Tixuz para compradores y vendedores',
    description: 'Hub de temas automotrices de Tixuz basado en programas de YouTube para consultar marcas, tecnologia, mercado y publicacion de autos usados en Mexico.',
    canonical: TOPICS_URL,
    jsonLd,
    body,
  });
}

function topicHtml(topic) {
  const videos = youtubeTranscriptsForTopic(topic);
  const resources = resourcesForTopic(topic);
  const canonical = youtubeTopicUrl(topic.slug);
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': canonical + '#webpage',
        name: `${topic.title} | ${SITE_NAME}`,
        url: canonical,
        inLanguage: 'es-MX',
        isPartOf: { '@id': SITE_URL + '/#website' },
        about: (topic.queries || []).map((query) => ({ '@type': 'Thing', name: query })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Tixuz Autos', item: SITE_URL + '/' },
          { '@type': 'ListItem', position: 2, name: 'Temas YouTube', item: TOPICS_URL },
          { '@type': 'ListItem', position: 3, name: topic.label || topic.title, item: canonical },
        ],
      },
      {
        '@type': 'ItemList',
        '@id': canonical + '#videos',
        itemListElement: videos.map((page, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: page.title,
          url: page.url,
        })),
      },
      {
        '@type': 'FAQPage',
        '@id': canonical + '#faq',
        mainEntity: [
          {
            '@type': 'Question',
            name: `Como ayuda Tixuz con ${topic.label || topic.title}?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: topic.publicContext,
            },
          },
          {
            '@type': 'Question',
            name: 'Puedo publicar un auto relacionado con este tema?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Si. En Tixuz Autos puedes publicar un auto usado con fotos reales, descripcion, WhatsApp directo y revision humana antes de aparecer en el marketplace.',
            },
          },
        ],
      },
    ],
  }).replace(/</g, '\\u003c');

  const body = `<section class="hero">
    <div>
      <p class="eyebrow">Tema YouTube Tixuz</p>
      <h1>${html(topic.title)}</h1>
      <p class="lead">${html(topic.description)}</p>
      <div class="actions">
        <a class="btn primary" href="${html(PUBLISH_URL)}">Publicar un auto</a>
        <a class="btn" href="${html(SELLER_GUIDE_URL)}">Guia para vendedores</a>
        <a class="btn" href="${html(SITE_URL + YOUTUBE_TRANSCRIPTS_INDEX_PATH)}">Ver transcripciones</a>
      </div>
    </div>
    <div class="panel">
      <h2>Contexto del tema</h2>
      <p class="answer">${html(topic.publicContext)}</p>
      <h2>Para vendedores</h2>
      <p>${html(topic.sellerNote)}</p>
    </div>
  </section>
  <section class="band">
    <h2>Videos base del tema</h2>
    <div class="videos">${videos.map(videoCard).join('')}</div>
  </section>
  ${resources.length ? `<section class="band">
    <h2>Guias para publicar mejor</h2>
    <div class="grid">${resources.map(resourceCard).join('')}</div>
  </section>` : ''}
  <section class="band">
    <h2>Preguntas relacionadas</h2>
    <div class="queries">${(topic.queries || []).map((query) => `<span>${html(query)}</span>`).join('')}</div>
  </section>
  <section class="band">
    <h2>Como usar esta guia para publicar mejor</h2>
    <div class="grid">
      <div class="card"><strong>Contexto antes de vender</strong><span>El vendedor entiende que Tixuz conoce el tema y puede ayudar a explicar mejor el auto.</span></div>
      <div class="card"><strong>Ficha mas clara</strong><span>Fotos, precio, kilometraje, version, ciudad y descripcion reducen dudas antes del WhatsApp.</span></div>
      <div class="card"><strong>Ruta directa</strong><span>Desde el contenido editorial, el siguiente paso natural es publicar o revisar inventario real.</span></div>
    </div>
  </section>`;

  return layout({
    title: topic.title,
    description: topic.description,
    canonical,
    jsonLd,
    body,
  });
}

exports.handler = async function (event) {
  const slug = slugFromEvent(event);
  if (!slug) {
    return response(200, hubHtml(), 'html');
  }
  const topic = youtubeTopicForSlug(slug);
  if (!topic) {
    return response(404, `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><title>Tema no encontrado | ${SITE_NAME}</title><meta name="robots" content="noindex"></head><body><p>Tema no encontrado.</p><p><a href="${TOPICS_URL}">Volver a temas YouTube</a></p></body></html>`, 'html');
  }
  return response(200, topicHtml(topic), 'html');
};
