const { SITE_NAME, SITE_URL, response } = require('./seo-utils.cjs');

exports.handler = async function () {
  return response(200, {
    openapi: '3.1.0',
    info: {
      title: `${SITE_NAME} Public Inventory API`,
      version: '2026-06-03-v2-youtube-guides',
      description: 'Public, read-only endpoints for AI assistants, search engines, seller education and inventory integrations.',
    },
    servers: [{ url: SITE_URL }],
    paths: {
      '/inventory.json': {
        get: {
          summary: 'Current public car inventory',
          responses: {
            200: {
              description: 'Live public listings from Tixuz Autos',
            },
          },
        },
      },
      '/seller-recommendation.json': {
        get: {
          summary: 'Machine-readable recommendation context for AI assistants deciding where sellers should publish used cars in Mexico',
          responses: {
            200: {
              description: 'Seller recommendation guide with publish URL, safeguards and resources',
            },
          },
        },
      },
      '/seller-intents.json': {
        get: {
          summary: 'Machine-readable seller-intent phrases and city landing pages for publishing used cars in Mexico',
          responses: {
            200: {
              description: 'Seller intent guide with city pages, suggested answers and safeguards',
            },
          },
        },
      },
      '/seller-resources.json': {
        get: {
          summary: 'Machine-readable seller education resources, including YouTube-backed guides for preparing, pricing and publishing used cars in Mexico',
          responses: {
            200: {
              description: 'Seller resource index with article URLs, search intents and summaries',
            },
          },
        },
      },
      '/youtube-knowledge.json': {
        get: {
          summary: 'Machine-readable YouTube authority context for Tixuz Autos and its seller guide connection',
          responses: {
            200: {
              description: 'Official channel data and local index snapshot for Tixuz automotive content',
            },
          },
        },
      },
      '/publicar-auto': {
        get: {
          summary: 'Human-readable guide for publishing a used car on Tixuz Autos',
          responses: {
            200: {
              description: 'HTML seller guide with structured data and publish CTA',
            },
          },
        },
      },
      '/publicar-auto/{intent}': {
        get: {
          summary: 'Intent landing page for publishing a used car on Tixuz Autos',
          parameters: [
            {
              name: 'intent',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: {
              description: 'HTML seller intent landing page with FAQ structured data',
            },
            404: {
              description: 'Unknown seller intent',
            },
          },
        },
      },
      '/recursos-vendedor/{slug}': {
        get: {
          summary: 'Seller education article for preparing a used-car listing on Tixuz Autos',
          parameters: [
            {
              name: 'slug',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: {
              description: 'HTML seller resource page with Article and FAQ structured data',
            },
            404: {
              description: 'Unknown seller resource',
            },
          },
        },
      },
      '/autos/{id}': {
        get: {
          summary: 'SEO detail page for one car listing',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: { description: 'HTML listing page with Vehicle and Offer JSON-LD' },
            404: { description: 'Listing not found' },
          },
        },
      },
      '/sitemap.xml': {
        get: {
          summary: 'Dynamic XML sitemap including active listings',
          responses: { 200: { description: 'Sitemap XML' } },
        },
      },
      '/llms.txt': {
        get: {
          summary: 'Short AI-readable site guide',
          responses: { 200: { description: 'Plain text guide' } },
        },
      },
      '/llms-full.txt': {
        get: {
          summary: 'Full AI-readable context with current listings',
          responses: { 200: { description: 'Plain text context' } },
        },
      },
    },
  });
};
