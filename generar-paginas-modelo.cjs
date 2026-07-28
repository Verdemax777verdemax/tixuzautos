/**
 * TIXUZ AUTOS — F4: Generador estático de páginas /autos/{marca-modelo}
 * Versión corregida por Claude (2026-07-15) sobre el borrador de Gemini.
 * Cambios clave vs borrador:
 *  - Agrupacion canonica por vehicle_brand_norm / vehicle_model_norm de aggregated_listings
 *  - Manejo de precios NULL (anuncios financiados) en estadísticas y cards
 *  - Liga de atribución a la fuente (source_url) en cada card — regla de agregador
 *  - Inyección real de Veredicto desde tabla `veredictos` (si existe para el modelo)
 *  - Credenciales del proyecto rbiuoljoduekajivffzh por default (override con env vars)
 * Correr: node generar-paginas-modelo.cjs   →  genera /autos/*.html + sitemap-modelos.xml
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rbiuoljoduekajivffzh.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJiaXVvbGpvZHVla2FqaXZmZnpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNzc4NDYsImV4cCI6MjA4Njc1Mzg0Nn0.fvKu71jVZWfSdIVcqMrhMZqUAjswzvaOgnm6-MQpaxM';
const OUTPUT_DIR = path.join(__dirname, 'autos');
const BASE_URL = 'https://tixuzautos.com/autos';

const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  Accept: 'application/json',
};

const slugify = (text) => text.toString().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
  .replace(/\s+/g, '-')
  .replace(/[^\w\-]+/g, '')
  .replace(/\-\-+/g, '-')
  .replace(/^-+|-+$/g, '');

const formatMoney = (amount) => (amount == null || isNaN(amount))
  ? 'Consultar'
  : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(amount);

const formatKm = (km) => (km == null || isNaN(km))
  ? 's/d'
  : `${new Intl.NumberFormat('es-MX').format(km)} km`;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function fetchJSON(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${res.statusText} — ${url}`);
  return res.json();
}

// Inventario externo activo — COLUMNAS REALES
async function fetchInventory() {
  const cols = 'id,vehicle_brand_norm,vehicle_model_norm,vehicle_year,price_amount,vehicle_km,city,state,image_url,main_image_url,source_url,title,seller_name,source,source_name';
  const rows = await fetchJSON(`${SUPABASE_URL}/rest/v1/aggregated_listings?active=eq.true&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=${cols}&limit=2000`);
  return rows.map((row) => ({
    ...row,
    make: row.vehicle_brand_norm,
    model: row.vehicle_model_norm,
    year: row.vehicle_year,
    price_mxn: row.price_amount,
    mileage_km: row.vehicle_km,
    image_url: row.image_url || row.main_image_url,
    seller_type: row.seller_name || row.source_name || row.source || 'Fuente externa',
  }));
}

// Videos del canal por modelo
async function fetchVideos() {
  try {
    return await fetchJSON(`${SUPABASE_URL}/rest/v1/videos_modelo?select=slug,youtube_id,titulo`);
  } catch (e) { return []; }
}

// Veredictos existentes (tabla veredictos usa columna `model`)
async function fetchVeredictos() {
  try {
    return await fetchJSON(`${SUPABASE_URL}/rest/v1/veredictos?select=*`);
  } catch (e) {
    console.warn('⚠️ No se pudieron leer veredictos (RLS o tabla vacía):', e.message);
    return [];
  }
}

function processData(autos) {
  const agrupado = {};

  autos.forEach((auto) => {
    const make = (auto.make || '').trim();
    const model = (auto.model || '').trim();
    if (!make || !model) return;

    const key = `${make} ${model}`;
    const slug = slugify(key);

    if (!agrupado[slug]) {
      agrupado[slug] = { marca: make, modelo: model, slug, autos: [], precios: [], anos: new Set(), ciudades: {} };
    }

    agrupado[slug].autos.push(auto);
    if (auto.price_mxn != null && Number(auto.price_mxn) > 0) {
      agrupado[slug].precios.push(Number(auto.price_mxn));
    }
    if (auto.year) agrupado[slug].anos.add(auto.year);
    if (auto.city) agrupado[slug].ciudades[auto.city] = (agrupado[slug].ciudades[auto.city] || 0) + 1;
  });

  return Object.values(agrupado)
    .filter((g) => g.autos.length >= 2) // páginas solo para modelos con 2+ anuncios (evita thin content)
    .map((grupo) => {
      const precios = grupo.precios.sort((a, b) => a - b);
      const anos = Array.from(grupo.anos).sort();
      const topCiudades = Object.entries(grupo.ciudades)
        .sort((a, b) => b[1] - a[1]).slice(0, 3).map((c) => c[0]);

      return {
        ...grupo,
        stats: {
          minPrecio: precios[0] ?? null,
          maxPrecio: precios[precios.length - 1] ?? null,
          avgPrecio: precios.length ? Math.round(precios.reduce((a, b) => a + b, 0) / precios.length) : null,
          minAno: anos[0] ?? 's/d',
          maxAno: anos[anos.length - 1] ?? 's/d',
          topCiudades,
        },
      };
    });
}

function buscarVeredicto(veredictos, marca, modelo) {
  const m = modelo.toLowerCase();
  const mk = marca.toLowerCase();
  return veredictos.find((v) => {
    const vm = String(v.model || '').toLowerCase();
    const vmk = String(v.make || '').toLowerCase();
    return vm === m || (vmk === mk && vm.includes(m));
  }) || null;
}

function generateHTML(modeloData, interlinks, veredicto, video) {
  const { marca, modelo, slug, autos, stats } = modeloData;
  const canonical = `${BASE_URL}/${slug}`;
  const title = `${marca} ${modelo} seminuevo en México — precios, análisis y anuncios | Tixuz Autos`;
  const rangoPrecio = stats.minPrecio != null
    ? `Precios desde ${formatMoney(stats.minPrecio)} hasta ${formatMoney(stats.maxPrecio)}.`
    : 'Consulta precios con cada vendedor.';
  const description = `Encuentra ${marca} ${modelo} seminuevos en México. ${rangoPrecio} Con el Veredicto IA de Tixuz Autos.`;

  const faqData = [
    {
      q: `¿Cuánto cuesta un ${marca} ${modelo} usado en México?`,
      a: stats.avgPrecio != null
        ? `El precio promedio de un ${marca} ${modelo} seminuevo en nuestro inventario es de ${formatMoney(stats.avgPrecio)}, con opciones desde ${formatMoney(stats.minPrecio)} hasta ${formatMoney(stats.maxPrecio)} según año y kilometraje.`
        : `Los precios del ${marca} ${modelo} varían según año, versión y kilometraje. Revisa los anuncios activos en esta página para cotizaciones reales.`,
    },
    {
      q: `¿Qué años del ${marca} ${modelo} hay disponibles?`,
      a: `Actualmente hay ${autos.length} anuncios activos con modelos del ${stats.minAno} al ${stats.maxAno}.`,
    },
    {
      q: `¿En qué ciudades hay más ${marca} ${modelo}?`,
      a: stats.topCiudades.length
        ? `Las ciudades con más unidades disponibles ahora mismo son: ${stats.topCiudades.join(', ')}.`
        : 'Hay unidades en varias ciudades de México; revisa cada anuncio para la ubicación exacta.',
    },
    {
      q: `¿Es buena compra un ${marca} ${modelo} seminuevo?`,
      a: `En Tixuz Autos analizamos cada modelo con datos reales del mercado y la experiencia del canal de YouTube. Revisa la sección "Veredicto Tixuz" en esta página para el análisis completo.`,
    },
    {
      q: `¿Cómo contacto al vendedor de un ${marca} ${modelo}?`,
      a: `Cada anuncio tiene una liga directa al sitio del vendedor o agencia. Tixuz no cobra comisión: el trato es directo entre tú y el vendedor.`,
    },
  ];

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqData.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: { '@type': 'Answer', text: faq.a },
    })),
  };

  const listHTML = (arr) => Array.isArray(arr) ? `<ul style="margin:.5rem 0;padding-left:1.25rem">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  const veredictoHTML = veredicto
    ? `<div class="veredicto-box" style="white-space:normal">
        <h3 style="margin-top:0">${esc(veredicto.title || '')} <span style="color:var(--xenon)">★ ${esc(veredicto.rating || '')}/10</span></h3>
        <p style="color:var(--muted)">${esc(veredicto.subtitle || '')}</p>
        <p><strong>${esc(veredicto.veredicto_corto || '')}</strong></p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem">
          <div><strong style="color:#4ade80">✔ A favor</strong>${listHTML(veredicto.pros)}</div>
          <div><strong style="color:#f87171">✘ En contra</strong>${listHTML(veredicto.contras)}</div>
        </div>
        <p>${esc(veredicto.analisis || '')}</p>
        <p><strong>Para quién sí:</strong> ${esc(veredicto.para_quien_si || '')}</p>
        <p><strong>Para quién no:</strong> ${esc(veredicto.para_quien_no || '')}</p>
      </div>`
    : `<div id="veredicto" class="placeholder-box">Veredicto Tixuz en preparación para el ${esc(marca)} ${esc(modelo)}. Mientras tanto, revisa los datos reales de mercado arriba.</div>`;

  const ogImage = autos.find((a) => a.image_url)?.image_url || 'https://tixuzautos.com/assets/og-cover.jpg';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="website">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:locale" content="es_MX">
<meta property="og:site_name" content="Tixuz Autos">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Poppins:wght@600;700&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>
<style>
:root{--bg:#0f172a;--surface:#1e293b;--text:#f8fafc;--muted:#94a3b8;--xenon:#3B82F6;--border:#334155}
body{margin:0;background:var(--bg);color:var(--text);font-family:'Inter',sans-serif;line-height:1.6}
h1,h2,h3{font-family:'Poppins',sans-serif}
.container{max-width:1200px;margin:0 auto;padding:2rem 1rem}
header{border-bottom:1px solid var(--border);padding-bottom:1.5rem;margin-bottom:2rem}
h1{color:var(--xenon);font-size:2rem;margin-bottom:.5rem}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-bottom:3rem}
.stat-card{background:var(--surface);padding:1.25rem;border-radius:8px;border:1px solid var(--border);text-align:center}
.stat-value{font-size:1.4rem;font-weight:700;color:var(--xenon);font-family:'Poppins',sans-serif}
.stat-label{font-size:.8rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
.inventory-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.5rem;margin-bottom:3rem}
.car-card{background:var(--surface);border-radius:8px;overflow:hidden;border:1px solid var(--border);transition:transform .2s;display:flex;flex-direction:column}
.car-card:hover{transform:translateY(-4px);border-color:var(--xenon)}
.car-img{width:100%;height:180px;object-fit:cover;background:#000}
.car-content{padding:1.25rem;flex:1;display:flex;flex-direction:column}
.car-title{font-weight:600;margin-bottom:.25rem}
.car-price{font-size:1.2rem;font-weight:700}
.car-details{color:var(--muted);font-size:.85rem;margin:.5rem 0 1rem}
.car-source{margin-top:auto;display:inline-block;background:var(--xenon);color:#fff;text-decoration:none;text-align:center;padding:.5rem;border-radius:6px;font-size:.9rem}
.car-source:hover{background:#2563eb}
.fuente-tag{font-size:.7rem;color:var(--muted)}
section{margin-bottom:3.5rem}
h2{font-size:1.5rem;margin-bottom:1.25rem;border-left:4px solid var(--xenon);padding-left:1rem}
.faq-item{margin-bottom:1rem;background:var(--surface);padding:1.25rem;border-radius:8px}
.faq-item h3{margin:0 0 .5rem;font-size:1.05rem}
.faq-item p{margin:0;color:var(--muted)}
.links-grid{display:flex;flex-wrap:wrap;gap:.75rem}
.link-chip{background:var(--surface);border:1px solid var(--border);color:var(--text);text-decoration:none;padding:.45rem 1rem;border-radius:99px;font-size:.85rem}
.link-chip:hover{background:var(--xenon);border-color:var(--xenon)}
.placeholder-box{background:rgba(59,130,246,.08);border:1px dashed var(--xenon);padding:2rem;border-radius:8px;text-align:center;color:var(--muted)}
.veredicto-box{background:var(--surface);border:1px solid var(--xenon);padding:1.5rem;border-radius:8px;white-space:pre-line}
footer{border-top:1px solid var(--border);padding:2rem 1rem;text-align:center;color:var(--muted);font-size:.85rem}
footer a{color:var(--xenon);text-decoration:none}
</style>
</head>
<body>
<main class="container">
  <header>
    <h1>${esc(marca)} ${esc(modelo)} seminuevo en México — precios, análisis y anuncios</h1>
    <p style="color:var(--muted);font-size:1.05rem">Datos actualizados del mercado real. Anuncios agregados de todo México con liga directa al vendedor.</p>
  </header>

  <div class="stats-grid">
    <div class="stat-card"><div class="stat-value">${formatMoney(stats.minPrecio)}</div><div class="stat-label">Desde</div></div>
    <div class="stat-card"><div class="stat-value">${formatMoney(stats.avgPrecio)}</div><div class="stat-label">Promedio</div></div>
    <div class="stat-card"><div class="stat-value">${esc(stats.minAno)}–${esc(stats.maxAno)}</div><div class="stat-label">Años disponibles</div></div>
    <div class="stat-card"><div class="stat-value">${autos.length}</div><div class="stat-label">Anuncios activos</div></div>
  </div>

  <section id="inventario">
    <h2>Anuncios activos de ${esc(marca)} ${esc(modelo)}</h2>
    <div class="inventory-grid">
      ${autos.map((auto) => {
        const agencia = auto.raw_payload && auto.raw_payload.agencia ? esc(auto.raw_payload.agencia) : (auto.seller_type === 'dealer' ? 'Agencia' : 'Particular');
        return `
      <article class="car-card">
        ${auto.image_url ? `<img src="${esc(auto.image_url)}" alt="${esc(auto.title || `${marca} ${modelo} ${auto.year}`)}" class="car-img" loading="lazy">` : ''}
        <div class="car-content">
          <div class="car-title">${esc(auto.title || `${marca} ${modelo} ${auto.year || ''}`)}</div>
          <div class="car-price">${formatMoney(auto.price_mxn)}</div>
          <div class="car-details">${esc(auto.year || 's/d')} · ${formatKm(auto.mileage_km)}<br>📍 ${esc(auto.city || '')}${auto.state ? ', ' + esc(auto.state) : ''}<br><span class="fuente-tag">Vendedor: ${agencia}</span></div>
          ${auto.source_url ? `<a href="${esc(auto.source_url)}" class="car-source" rel="nofollow noopener" target="_blank">Ver anuncio original →</a>` : ''}
        </div>
      </article>`;
      }).join('')}
    </div>
  </section>

  <section>
    <h2>Veredicto Tixuz</h2>
    ${veredictoHTML}
  </section>

  <section>
    <h2>Análisis en video</h2>
    ${video
      ? `<div style="aspect-ratio:16/9;border-radius:8px;overflow:hidden;border:1px solid var(--border)"><iframe width="100%" height="100%" src="https://www.youtube-nocookie.com/embed/${esc(video.youtube_id)}" title="${esc(video.titulo || `${marca} ${modelo} — Tixuz Autos`)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
      : `<div id="video-tixuz" class="placeholder-box" style="aspect-ratio:16/9;display:flex;align-items:center;justify-content:center">Video del canal Tixuz Autos para ${esc(marca)} ${esc(modelo)} — próximamente aquí.</div>`}
  </section>

  <section>
    <h2>Preguntas frecuentes</h2>
    ${faqData.map((faq) => `<div class="faq-item"><h3>${esc(faq.q)}</h3><p>${esc(faq.a)}</p></div>`).join('')}
  </section>

  <section>
    <h2>Explora otros modelos</h2>
    <div class="links-grid">
      ${interlinks.map((l) => `<a href="${BASE_URL}/${l.slug}" class="link-chip">${esc(l.marca)} ${esc(l.modelo)}</a>`).join('')}
    </div>
  </section>
</main>
<footer>
  <a href="https://tixuzautos.com">Tixuz Autos</a> · Agregador de seminuevos en México · Anuncios con liga directa al vendedor original · <a href="https://tixuzautos.com/bot">TixuzBot</a>
</footer>
</body>
</html>`;
}

function generateSitemap(modelos) {
  const currentDate = new Date().toISOString().split('T')[0];
  const urls = modelos.map((m) => `  <url><loc>${BASE_URL}/${m.slug}</loc><lastmod>${currentDate}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

async function main() {
  try {
    console.log('1. Obteniendo inventario de Supabase...');
    const data = await fetchInventory();
    console.log(`   → ${data.length} anuncios activos`);

    console.log('2. Obteniendo veredictos...');
    const veredictos = await fetchVeredictos();
    const videos = await fetchVideos();
    console.log(`   → ${videos.length} videos mapeados`);
    console.log(`   → ${veredictos.length} veredictos disponibles`);

    console.log('3. Agrupando por marca-modelo...');
    const modelosData = processData(data);
    console.log(`   → ${modelosData.length} páginas a generar (modelos con 2+ anuncios)`);

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    modelosData.forEach((modelo, index) => {
      let interlinks = modelosData.filter((m) => m.slug !== modelo.slug).slice(index, index + 6);
      if (interlinks.length < 6) {
        interlinks = interlinks.concat(
          modelosData.filter((m) => m.slug !== modelo.slug && !interlinks.includes(m)).slice(0, 6 - interlinks.length)
        );
      }
      const veredicto = buscarVeredicto(veredictos, modelo.marca, modelo.modelo);
      const video = videos.find((v) => v.slug === modelo.slug) || null;
      const html = generateHTML(modelo, interlinks, veredicto, video);
      fs.writeFileSync(path.join(OUTPUT_DIR, `${modelo.slug}.html`), html);
    });

    console.log('4. Generando sitemap-modelos.xml...');
    fs.writeFileSync(path.join(OUTPUT_DIR, 'sitemap-modelos.xml'), generateSitemap(modelosData));

    console.log(`✅ Listo: ${modelosData.length} páginas + sitemap en ${OUTPUT_DIR}`);
  } catch (error) {
    console.error('❌ Error en el generador estático:', error);
    process.exit(1);
  }
}

main();
