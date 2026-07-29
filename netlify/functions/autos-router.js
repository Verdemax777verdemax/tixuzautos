const seoListing = require('./seo-listing.js');

const MODELO_ORIGIN = 'https://rbiuoljoduekajivffzh.supabase.co/functions/v1/modelo/';
const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';
const SITEMAP_CONTENT_TYPE = 'application/xml; charset=utf-8';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function slugFromEvent(event = {}) {
  const fromQuery = event.queryStringParameters?.slug;
  const paths = [event.path, event.rawUrl].filter(Boolean).map(String);
  const candidate = fromQuery || paths
    .map(value => value.match(/\/autos-router\/([^/?#]+)/)?.[1] || value.match(/\/autos\/([^/?#]+)/)?.[1])
    .find(Boolean);

  try {
    return decodeURIComponent(String(candidate || '')).trim();
  } catch {
    return '';
  }
}

function response(statusCode, body, contentType = HTML_CONTENT_TYPE) {
  return {
    statusCode,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=600',
    },
    body,
  };
}

function notFound() {
  return response(
    404,
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Modelo no encontrado | Tixuz Autos</title></head><body><p>Modelo no encontrado.</p></body></html>',
  );
}

exports.handler = async function handler(event = {}) {
  const slug = slugFromEvent(event);

  if (!slug || /[\\/]/.test(slug)) return notFound();

  // Las fichas propias por UUID siguen atendidas por la función existente.
  if (UUID_PATTERN.test(slug)) {
    return seoListing.handler({
      ...event,
      queryStringParameters: { ...(event.queryStringParameters || {}), id: slug },
    });
  }

  const isSitemap = slug === 'sitemap-modelos.xml';
  const originPath = isSitemap ? 'sitemap.xml' : encodeURIComponent(slug);

  try {
    const upstream = await fetch(`${MODELO_ORIGIN}${originPath}`, {
      headers: { Accept: isSitemap ? 'application/xml,text/xml;q=0.9' : 'text/html,application/xhtml+xml' },
    });
    const body = await upstream.text();

    // Supabase puede declarar text/plain: el router define el tipo público por ruta.
    return response(upstream.status, body, isSitemap ? SITEMAP_CONTENT_TYPE : HTML_CONTENT_TYPE);
  } catch {
    return response(
      502,
      '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Error temporal | Tixuz Autos</title></head><body><p>No pudimos cargar este modelo en este momento.</p></body></html>',
    );
  }
};

exports._test = { slugFromEvent, UUID_PATTERN, HTML_CONTENT_TYPE, SITEMAP_CONTENT_TYPE };
