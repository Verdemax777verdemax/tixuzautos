const {
  SITE_NAME,
  SITE_URL,
  fetchPublicListing,
  html,
  listingDescription,
  listingJsonLd,
  money,
  response,
} = require('./seo-utils.cjs');

function page(listing) {
  const title = `${listing.title} en venta | ${SITE_NAME}`;
  const description = listingDescription(listing).slice(0, 300);
  const image = listing.images[0] || `${SITE_URL}/assets/og-cover.jpg`;
  const jsonLd = JSON.stringify(listingJsonLd(listing));
  const specs = [
    ['Precio', money(listing.price)],
    ['Kilometraje', listing.mileage ? `${Number(listing.mileage).toLocaleString('es-MX')} km` : 'No especificado'],
    ['Transmision', listing.transmission || 'No especificada'],
    ['Combustible', listing.fuelType || 'No especificado'],
    ['Color', listing.color || 'No especificado'],
    ['Ubicacion', listing.location || 'Mexico'],
    ['Vendedor', listing.sellerType || 'Verificado por Tixuz'],
  ];

  return `<!doctype html>
<html lang="es-MX">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${html(title)}</title>
  <meta name="description" content="${html(description)}">
  <link rel="canonical" href="${html(listing.url)}">
  <meta property="og:type" content="product">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${html(title)}">
  <meta property="og:description" content="${html(description)}">
  <meta property="og:url" content="${html(listing.url)}">
  <meta property="og:image" content="${html(image)}">
  <meta property="og:locale" content="es_MX">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${html(title)}">
  <meta name="twitter:description" content="${html(description)}">
  <meta name="twitter:image" content="${html(image)}">
  <script type="application/ld+json">${jsonLd.replace(/</g, '\\u003c')}</script>
  <style>
    *{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;background:#0f1623;color:#f0f4ff}a{color:inherit}.wrap{max-width:1040px;margin:0 auto;padding:28px 18px 48px}.top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:24px}.brand{font-weight:800;letter-spacing:.02em}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 16px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none;font-weight:750}.hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(280px,.95fr);gap:28px;align-items:start}.photo{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;background:#1e2a3d}.thumbs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px}.thumbs img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px;background:#1e2a3d}.panel{border:1px solid #2a3750;border-radius:8px;background:#161e2e;padding:20px}h1{font-size:clamp(1.7rem,4vw,2.7rem);line-height:1.08;margin:0 0 12px}.price{font-size:2rem;color:#60a5fa;font-weight:850;margin:0 0 18px}.specs{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0}.spec{border:1px solid #2a3750;border-radius:8px;padding:10px 12px;background:#0f1623}.label{display:block;font-size:.72rem;color:#8fa3c0;text-transform:uppercase;margin-bottom:4px}.value{font-weight:700}.desc{color:#c7d2e6;line-height:1.6}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.ghost{background:#263248}.note{margin-top:20px;color:#8fa3c0;font-size:.9rem;line-height:1.5}@media(max-width:760px){.hero{grid-template-columns:1fr}.top{align-items:flex-start}.specs{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main class="wrap">
    <div class="top">
      <a class="brand" href="${SITE_URL}/">Tixuz Autos</a>
      <a class="btn ghost" href="${SITE_URL}/">Ver mas autos</a>
    </div>
    <section class="hero">
      <div>
        ${listing.images[0] ? `<img class="photo" src="${html(listing.images[0])}" alt="${html(listing.title)}" loading="eager">` : `<div class="photo"></div>`}
        ${listing.images.length > 1 ? `<div class="thumbs">${listing.images.slice(1, 9).map((src) => `<img src="${html(src)}" alt="${html(listing.title)} foto" loading="lazy">`).join('')}</div>` : ''}
      </div>
      <article class="panel">
        <h1>${html(listing.title)}</h1>
        <p class="price">${html(money(listing.price))}</p>
        <div class="specs">
          ${specs.map(([label, value]) => `<div class="spec"><span class="label">${html(label)}</span><span class="value">${html(value)}</span></div>`).join('')}
        </div>
        <p class="desc">${html(listingDescription(listing))}</p>
        <div class="actions">
          <a class="btn" href="${SITE_URL}/?auto=${encodeURIComponent(listing.id)}">Abrir ficha en Tixuz</a>
          <a class="btn ghost" href="${SITE_URL}/inventory.json">Inventario JSON</a>
        </div>
        <p class="note">Disponibilidad y datos sujetos a confirmacion del vendedor. Tixuz Autos muestra inventario publico revisado y contacto dentro del marketplace.</p>
      </article>
    </section>
  </main>
</body>
</html>`;
}

exports.handler = async function (event) {
  const id =
    (event.queryStringParameters && event.queryStringParameters.id) ||
    decodeURIComponent(String(event.path || '').split('/seo-listing/')[1] || '') ||
    decodeURIComponent(String(event.rawUrl || '').match(/\/autos\/([^/?#]+)/)?.[1] || '');
  try {
    const listing = await fetchPublicListing(id);
    if (!listing) {
      return response(404, `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><title>Auto no encontrado | ${SITE_NAME}</title><meta name="robots" content="noindex"></head><body><p>Auto no encontrado.</p><p><a href="${SITE_URL}/">Volver a Tixuz Autos</a></p></body></html>`, 'html');
    }
    return response(200, page(listing), 'html');
  } catch (err) {
    return response(502, `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><title>Error temporal | ${SITE_NAME}</title><meta name="robots" content="noindex"></head><body><p>No pude cargar esta ficha en este momento.</p><p>${html(err.message)}</p></body></html>`, 'html');
  }
};
