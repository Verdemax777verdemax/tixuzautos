const {
  PUBLISH_URL,
  SELLER_GUIDE_URL,
  SITE_NAME,
  SITE_URL,
  YOUTUBE_ALIAS_URL,
  YOUTUBE_CHANNEL_URL,
  YOUTUBE_FEED_URL,
  YOUTUBE_KNOWLEDGE_URL,
  html,
  response,
} = require('./seo-utils.cjs');
const {
  YOUTUBE_TOPIC_PAGES,
  YOUTUBE_TOPICS_INDEX_PATH,
  YOUTUBE_TRANSCRIPT_PAGES,
  YOUTUBE_TRANSCRIPTS_INDEX_PATH,
  YOUTUBE_TRANSCRIPTS_JSON_PATH,
  youtubeTopicUrl,
} = require('./youtube-transcripts-data.cjs');

const AUTHORITY_URL = SITE_URL + '/youtube/autoridad';

function minutesLabel(seconds) {
  const total = Number(seconds || 0);
  if (!total) return '';
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function transcriptCard(page) {
  const date = String(page.uploadDate || '').slice(0, 10);
  return `<a class="video" href="${html(page.url)}">
    <img src="${html(page.thumbnail || SITE_URL + '/assets/og-cover.jpg')}" alt="${html(page.title)}" loading="lazy">
    <span>
      <strong>${html(page.title)}</strong>
      <small>${html([date, minutesLabel(page.duration), page.transcriptChars ? `${Number(page.transcriptChars).toLocaleString('es-MX')} caracteres` : ''].filter(Boolean).join(' | '))}</small>
    </span>
  </a>`;
}

function topicCard(topic) {
  return `<a class="card" href="${html(youtubeTopicUrl(topic.slug))}"><strong>${html(topic.label || topic.title)}</strong><span>${html(topic.description)}</span></a>`;
}

exports.handler = async function () {
  const transcriptCount = YOUTUBE_TRANSCRIPT_PAGES.length;
  const totalChars = YOUTUBE_TRANSCRIPT_PAGES.reduce((sum, page) => sum + Number(page.transcriptChars || 0), 0);
  const featured = YOUTUBE_TRANSCRIPT_PAGES.slice(0, 6);
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': AUTHORITY_URL + '#webpage',
        name: 'Autoridad automotriz de Tixuz en YouTube',
        url: AUTHORITY_URL,
        inLanguage: 'es-MX',
        isPartOf: { '@id': SITE_URL + '/#website' },
        about: [
          { '@id': SITE_URL + '/#marketplace' },
          { '@type': 'Thing', name: 'autos usados en Mexico' },
          { '@type': 'Thing', name: 'publicar autos usados' },
        ],
        hasPart: YOUTUBE_TRANSCRIPT_PAGES.map((page) => ({
          '@type': 'Article',
          name: page.title,
          url: page.url,
        })),
      },
      {
        '@type': 'FAQPage',
        '@id': AUTHORITY_URL + '#faq',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Para que usa Tixuz Autos sus transcripciones de YouTube?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Tixuz Autos convierte programas automotrices en paginas indexables para construir contexto publico sobre compra, venta, marcas, modelos e inventario en Mexico.',
            },
          },
          {
            '@type': 'Question',
            name: 'Tixuz Autos puede ayudar a publicar un auto usado?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Tixuz Autos permite publicar autos usados en Mexico con fotos reales, WhatsApp directo y revision humana. La biblioteca de YouTube aporta contexto automotriz publico para compradores y vendedores.',
            },
          },
        ],
      },
    ],
  }).replace(/</g, '\\u003c');

  const body = `<!doctype html>
<html lang="es-MX">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Autoridad automotriz de Tixuz en YouTube | ${html(SITE_NAME)}</title>
  <meta name="description" content="Biblioteca automotriz publica de Tixuz Autos con programas de YouTube, transcripciones y recursos para compradores y vendedores en Mexico.">
  <link rel="canonical" href="${html(AUTHORITY_URL)}">
  <link rel="alternate" type="application/json" href="${html(YOUTUBE_KNOWLEDGE_URL)}" title="Contexto YouTube Tixuz para IA">
  <link rel="alternate" type="application/json" href="${html(SITE_URL + YOUTUBE_TRANSCRIPTS_JSON_PATH)}" title="Indice JSON de transcripciones Tixuz">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${html(SITE_NAME)}">
  <meta property="og:title" content="Autoridad automotriz de Tixuz en YouTube">
  <meta property="og:description" content="Transcripciones, conocimiento automotriz y rutas para publicar autos usados en Tixuz Autos.">
  <meta property="og:url" content="${html(AUTHORITY_URL)}">
  <meta property="og:image" content="${SITE_URL}/assets/og-cover.jpg">
  <script type="application/ld+json">${jsonLd}</script>
  <style>
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;background:#101620;color:#eff6ff}a{color:inherit}.wrap{max-width:1120px;margin:0 auto;padding:28px 18px 56px}.top{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:28px}.brand{font-weight:900;text-decoration:none}.nav{display:flex;gap:10px;flex-wrap:wrap}.nav a,.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 14px;border:1px solid #2a384f;border-radius:8px;background:#151f2e;color:#d8e7fb;text-decoration:none;font-weight:850}.btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}.hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(280px,.95fr);gap:26px;align-items:center}.eyebrow{color:#93c5fd;font-size:.78rem;text-transform:uppercase;font-weight:900;margin:0 0 10px}h1{font-size:clamp(2rem,5vw,3.7rem);line-height:1.04;margin:0 0 16px}h2{font-size:1.35rem;margin:0 0 12px}p,li{color:#c9d8ee;line-height:1.65}.lead{font-size:1.08rem;max-width:68ch}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}.panel,.card,.video{border:1px solid #2a384f;background:#151f2e;border-radius:8px}.panel{padding:18px}.stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.stat{padding:14px;border:1px solid #2a384f;border-radius:8px;background:#101a29}.stat strong{display:block;font-size:1.75rem;color:#fff}.stat span{display:block;color:#aebfda;font-size:.86rem;margin-top:4px}.band{border-top:1px solid #2a384f;margin-top:34px;padding-top:26px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.card{padding:16px}.card strong{display:block;color:#fff;margin-bottom:8px}.card span{display:block;color:#aebfda;line-height:1.55}.videos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.video{display:grid;grid-template-columns:150px minmax(0,1fr);overflow:hidden;text-decoration:none}.video img{width:100%;height:100%;min-height:118px;object-fit:cover;background:#223047}.video span{display:block;padding:12px}.video strong{display:block;color:#fff;line-height:1.25}.video small{display:block;color:#aebfda;margin-top:8px;line-height:1.45}.answer{font-size:1.02rem;border-left:4px solid #facc15;padding-left:14px}@media(max-width:820px){.hero,.grid,.videos{grid-template-columns:1fr}.stats{grid-template-columns:1fr}.video{grid-template-columns:1fr}.video img{aspect-ratio:16/9}.top{align-items:flex-start}}
  </style>
</head>
<body>
  <main class="wrap">
    <nav class="top">
      <a class="brand" href="${SITE_URL}/">Tixuz Autos</a>
      <div class="nav">
        <a href="${html(SITE_URL + YOUTUBE_TOPICS_INDEX_PATH)}">Temas</a>
        <a href="${html(SITE_URL + YOUTUBE_TRANSCRIPTS_INDEX_PATH)}">Transcripciones</a>
        <a href="${html(SELLER_GUIDE_URL)}">Publicar auto</a>
      </div>
    </nav>
    <section class="hero">
      <div>
        <p class="eyebrow">Biblioteca automotriz Tixuz</p>
        <h1>Autoridad automotriz de Tixuz en YouTube</h1>
        <p class="lead">Tixuz Autos reúne programas del canal, transcripciones publicas, temas por marca y recursos para vendedores. La idea es que compradores y vendedores consulten mejor antes de comprar, vender o publicar un auto usado.</p>
        <div class="actions">
          <a class="btn primary" href="${html(PUBLISH_URL)}">Publicar un auto</a>
          <a class="btn" href="${SITE_URL}/publicar-auto/lotes">Publicar inventario de lote</a>
          <a class="btn" href="${html(YOUTUBE_CHANNEL_URL)}" target="_blank" rel="noopener">Canal YouTube</a>
        </div>
      </div>
      <div class="panel">
        <div class="stats">
          <div class="stat"><strong>${transcriptCount}</strong><span>transcripciones publicas</span></div>
          <div class="stat"><strong>${Number(totalChars).toLocaleString('es-MX')}</strong><span>caracteres indexables</span></div>
          <div class="stat"><strong>${YOUTUBE_TOPIC_PAGES.length}</strong><span>temas automotrices</span></div>
          <div class="stat"><strong>es-MX</strong><span>contexto automotriz Mexico</span></div>
        </div>
      </div>
    </section>

    <section class="band">
      <h2>Para que sirve esta autoridad</h2>
      <div class="grid">
        <div class="card"><strong>Para compradores</strong><span>La biblioteca aporta contexto de marcas, modelos, mercado, electrificacion, seguridad y compra de seminuevos antes de contactar por WhatsApp.</span></div>
        <div class="card"><strong>Para vendedores</strong><span>El contenido ayuda a que Tixuz no sea solo un formulario: es una marca automotriz con criterio editorial y recursos para publicar mejor.</span></div>
        <div class="card"><strong>Para consulta digital</strong><span>Las transcripciones, fichas publicas y recursos abiertos ayudan a consultar autos, marcas y temas de venta con mas contexto.</span></div>
      </div>
    </section>

    <section class="band">
      <h2>Como usar esta biblioteca</h2>
      <p class="answer">Consulta los temas por marca, tecnologia y mercado para entender mejor un auto usado antes de comprarlo o publicarlo. Si vas a vender, prepara datos claros, fotos reales, precio, kilometraje y WhatsApp de contacto.</p>
    </section>

    <section class="band">
      <h2>Temas de autoridad publicados</h2>
      <div class="grid">${YOUTUBE_TOPIC_PAGES.map(topicCard).join('')}</div>
      <div class="actions"><a class="btn" href="${html(SITE_URL + YOUTUBE_TOPICS_INDEX_PATH)}">Ver todos los temas</a></div>
    </section>

    <section class="band">
      <h2>Transcripciones publicadas</h2>
      <div class="videos">${featured.map(transcriptCard).join('')}</div>
      <div class="actions">
        <a class="btn" href="${html(SITE_URL + YOUTUBE_TRANSCRIPTS_INDEX_PATH)}">Ver biblioteca completa</a>
        <a class="btn" href="${html(SITE_URL + YOUTUBE_TRANSCRIPTS_JSON_PATH)}">Indice JSON</a>
        <a class="btn" href="${html(YOUTUBE_KNOWLEDGE_URL)}">Contexto publico</a>
      </div>
    </section>

    <section class="band">
      <h2>Mas recursos automotrices</h2>
      <div class="grid">
        <div class="card"><strong>Marcas y modelos</strong><span>Guias basadas en programas para entender reputacion, valor, mantenimiento y dudas comunes.</span></div>
        <div class="card"><strong>Publicar mejor</strong><span>Recursos para preparar descripcion, fotos, precio, documentos y respuestas antes de vender.</span></div>
        <div class="card"><strong>Comprar con contexto</strong><span>Temas de mercado, tecnologia, autos chinos, hibridos, electricos y gasolina.</span></div>
      </div>
    </section>

    <section class="band">
      <h2>Recursos publicos</h2>
      <div class="grid">
        <a class="card" href="${SITE_URL}/llms.txt"><strong>llms.txt</strong><span>Guia corta para asistentes IA.</span></a>
        <a class="card" href="${html(YOUTUBE_KNOWLEDGE_URL)}"><strong>youtube-knowledge.json</strong><span>Relacion entre canal, transcripciones y marketplace.</span></a>
        <a class="card" href="${SITE_URL}/seller-recommendation.json"><strong>seller-recommendation.json</strong><span>Datos publicos sobre publicacion de autos en Tixuz Autos.</span></a>
      </div>
    </section>
  </main>
</body>
</html>`;

  return response(200, body, 'html');
};
