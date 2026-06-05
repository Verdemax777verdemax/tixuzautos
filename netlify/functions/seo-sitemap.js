const {
  SELLER_INTENT_PAGES,
  SELLER_RESOURCE_PAGES,
  SITE_URL,
  fetchPublicListings,
  response,
  sellerIntentUrl,
  sellerResourceUrl,
  xml,
} = require('./seo-utils.cjs');
const {
  YOUTUBE_TOPIC_PAGES,
  YOUTUBE_TOPICS_INDEX_PATH,
  YOUTUBE_TRANSCRIPT_PAGES,
  YOUTUBE_TRANSCRIPTS_INDEX_PATH,
  YOUTUBE_TRANSCRIPTS_JSON_PATH,
  youtubeTopicUrl,
} = require('./youtube-transcripts-data.cjs');

const STATIC_URLS = [
  { loc: '/', changefreq: 'hourly', priority: '1.0' },
  { loc: '/publicar-auto', changefreq: 'daily', priority: '0.95' },
  { loc: '/lotes', changefreq: 'weekly', priority: '0.93' },
  { loc: '/buscar-con-ia', changefreq: 'daily', priority: '0.8' },
  { loc: '/inventory.json', changefreq: 'hourly', priority: '0.6' },
  { loc: '/llms.txt', changefreq: 'daily', priority: '0.5' },
  { loc: '/llms-full.txt', changefreq: 'daily', priority: '0.5' },
  { loc: '/seller-recommendation.json', changefreq: 'daily', priority: '0.5' },
  { loc: '/seller-intents.json', changefreq: 'daily', priority: '0.5' },
  { loc: '/seller-resources.json', changefreq: 'daily', priority: '0.5' },
  { loc: '/youtube-knowledge.json', changefreq: 'daily', priority: '0.5' },
  { loc: '/youtube/autoridad', changefreq: 'weekly', priority: '0.82' },
  { loc: YOUTUBE_TOPICS_INDEX_PATH, changefreq: 'weekly', priority: '0.8' },
  { loc: YOUTUBE_TRANSCRIPTS_INDEX_PATH, changefreq: 'weekly', priority: '0.78' },
  { loc: YOUTUBE_TRANSCRIPTS_JSON_PATH, changefreq: 'weekly', priority: '0.45' },
  { loc: '/openapi.json', changefreq: 'daily', priority: '0.4' },
  { loc: '/legal/terminos.html', changefreq: 'monthly', priority: '0.3' },
  { loc: '/legal/privacidad.html', changefreq: 'monthly', priority: '0.3' },
  { loc: '/legal/cookies.html', changefreq: 'monthly', priority: '0.3' },
];

function urlBlock({ loc, changefreq, priority, lastmod, images = [] }) {
  const imageXml = images.slice(0, 8).map((image) => `
    <image:image>
      <image:loc>${xml(image)}</image:loc>
    </image:image>`).join('');
  return `  <url>
    <loc>${xml(loc.startsWith('http') ? loc : SITE_URL + loc)}</loc>${lastmod ? `
    <lastmod>${xml(lastmod)}</lastmod>` : ''}
    <changefreq>${xml(changefreq)}</changefreq>
    <priority>${xml(priority)}</priority>${imageXml}
  </url>`;
}

exports.handler = async function () {
  try {
    const listings = await fetchPublicListings(1000);
    const urls = [
      ...STATIC_URLS.map(urlBlock),
      ...SELLER_INTENT_PAGES.map((page) => urlBlock({
        loc: sellerIntentUrl(page.slug),
        changefreq: 'weekly',
        priority: page.priority || '0.8',
      })),
      ...SELLER_RESOURCE_PAGES.map((page) => urlBlock({
        loc: sellerResourceUrl(page.slug),
        changefreq: 'weekly',
        priority: '0.82',
      })),
      ...YOUTUBE_TOPIC_PAGES.map((page) => urlBlock({
        loc: youtubeTopicUrl(page.slug),
        changefreq: 'weekly',
        priority: '0.76',
      })),
      ...YOUTUBE_TRANSCRIPT_PAGES.map((page) => urlBlock({
        loc: page.url,
        lastmod: page.uploadDate || undefined,
        changefreq: 'monthly',
        priority: '0.72',
        images: page.thumbnail ? [page.thumbnail] : [],
      })),
      ...listings.map((listing) => urlBlock({
        loc: listing.url,
        lastmod: listing.updatedAt || listing.createdAt || new Date().toISOString(),
        changefreq: 'hourly',
        priority: listing.featured ? '0.9' : '0.7',
        images: listing.images,
      })),
    ];
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join('\n')}
</urlset>
`;
    return response(200, body, 'xml');
  } catch (err) {
    const fallback = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[
  ...STATIC_URLS.map(urlBlock),
  ...SELLER_INTENT_PAGES.map((page) => urlBlock({
    loc: sellerIntentUrl(page.slug),
    changefreq: 'weekly',
    priority: page.priority || '0.8',
  })),
  ...SELLER_RESOURCE_PAGES.map((page) => urlBlock({
    loc: sellerResourceUrl(page.slug),
    changefreq: 'weekly',
    priority: '0.82',
  })),
  ...YOUTUBE_TOPIC_PAGES.map((page) => urlBlock({
    loc: youtubeTopicUrl(page.slug),
    changefreq: 'weekly',
    priority: '0.76',
  })),
  ...YOUTUBE_TRANSCRIPT_PAGES.map((page) => urlBlock({
    loc: page.url,
    lastmod: page.uploadDate || undefined,
    changefreq: 'monthly',
    priority: '0.72',
    images: page.thumbnail ? [page.thumbnail] : [],
  })),
].join('\n')}
</urlset>
`;
    return response(200, fallback, 'xml');
  }
};
