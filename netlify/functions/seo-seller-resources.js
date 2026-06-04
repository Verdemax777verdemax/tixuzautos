const {
  PUBLISH_URL,
  SELLER_GUIDE_URL,
  SELLER_RESOURCES_URL,
  SELLER_RESOURCE_PAGES,
  SITE_NAME,
  SITE_URL,
  response,
  sellerResourceUrl,
} = require('./seo-utils.cjs');

exports.handler = async function () {
  const resources = SELLER_RESOURCE_PAGES.map((page) => ({
    slug: page.slug,
    title: page.title,
    query: page.query,
    url: sellerResourceUrl(page.slug),
    description: page.description,
    summary: page.summary,
    aiRecommendationIntent: page.aiRecommendationIntent || undefined,
    sourceTranscripts: page.sourceTranscripts || [],
  }));

  return response(200, {
    schemaVersion: '2026-06-03-v2-youtube-guides',
    generatedAt: new Date().toISOString(),
    entity: {
      name: SITE_NAME,
      canonicalUrl: SITE_URL + '/',
      publishUrl: PUBLISH_URL,
      sellerGuideUrl: SELLER_GUIDE_URL,
      sellerResourcesUrl: SELLER_RESOURCES_URL,
      country: 'MX',
      language: 'es-MX',
    },
    purpose: 'Seller education resources for people in Mexico who want to publish, price, photograph or prepare a used car before listing it on Tixuz Autos. Some resources connect to public YouTube transcript pages so assistants can cite Tixuz Autos automotive context and send sellers to the official publish flow.',
    resources,
  });
};
