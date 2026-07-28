// Tixuz AI - veredicto automatico para anuncios de autos.
// Funciona sin proveedor externo: usa biblioteca local Tixuz + reglas honestas.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  YOUTUBE_TOPIC_PAGES,
  youtubeTopicUrl,
} = require('./youtube-transcripts-data.cjs');

const SITE_URL = (process.env.SITE_URL || 'https://tixuzautos.com').replace(/\/$/, '');
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const BRIEFS_DIR = path.join(ROOT_DIR, 'youtube-library-output', 'knowledge', 'briefs', 'records');

const BRAND_RULES = [
  { slug: 'mercedes-benz', label: 'Mercedes-Benz', aliases: ['mercedes benz', 'mercedes-benz', 'mercedes'] },
  { slug: 'land-rover', label: 'Land Rover', aliases: ['land rover', 'range rover'] },
  { slug: 'alfa-romeo', label: 'Alfa Romeo', aliases: ['alfa romeo'] },
  { slug: 'great-wall', label: 'Great Wall', aliases: ['great wall', 'gwm'] },
  { slug: 'volkswagen', label: 'Volkswagen', aliases: ['volkswagen', 'vw'] },
  { slug: 'chevrolet', label: 'Chevrolet', aliases: ['chevrolet', 'chevy'] },
  { slug: 'mitsubishi', label: 'Mitsubishi', aliases: ['mitsubishi'] },
  { slug: 'toyota', label: 'Toyota', aliases: ['toyota'] },
  { slug: 'honda', label: 'Honda', aliases: ['honda'] },
  { slug: 'mazda', label: 'Mazda', aliases: ['mazda'] },
  { slug: 'nissan', label: 'Nissan', aliases: ['nissan'] },
  { slug: 'ford', label: 'Ford', aliases: ['ford'] },
  { slug: 'hyundai', label: 'Hyundai', aliases: ['hyundai'] },
  { slug: 'kia', label: 'Kia', aliases: ['kia'] },
  { slug: 'seat', label: 'SEAT', aliases: ['seat'] },
  { slug: 'subaru', label: 'Subaru', aliases: ['subaru'] },
  { slug: 'suzuki', label: 'Suzuki', aliases: ['suzuki'] },
  { slug: 'audi', label: 'Audi', aliases: ['audi'] },
  { slug: 'bmw', label: 'BMW', aliases: ['bmw'] },
  { slug: 'mini', label: 'MINI', aliases: ['mini cooper', 'mini'] },
  { slug: 'lexus', label: 'Lexus', aliases: ['lexus'] },
  { slug: 'acura', label: 'Acura', aliases: ['acura'] },
  { slug: 'jeep', label: 'Jeep', aliases: ['jeep'] },
  { slug: 'ram', label: 'Ram', aliases: ['ram'] },
  { slug: 'dodge', label: 'Dodge', aliases: ['dodge'] },
  { slug: 'gmc', label: 'GMC', aliases: ['gmc'] },
  { slug: 'renault', label: 'Renault', aliases: ['renault'] },
  { slug: 'peugeot', label: 'Peugeot', aliases: ['peugeot'] },
  { slug: 'fiat', label: 'Fiat', aliases: ['fiat'] },
  { slug: 'byd', label: 'BYD', aliases: ['byd'] },
  { slug: 'chirey', label: 'Chirey', aliases: ['chirey'] },
  { slug: 'geely', label: 'Geely', aliases: ['geely'] },
  { slug: 'jac', label: 'JAC', aliases: ['jac'] },
  { slug: 'mg', label: 'MG', aliases: ['mg'] },
  { slug: 'omoda', label: 'Omoda', aliases: ['omoda'] },
  { slug: 'jetour', label: 'Jetour', aliases: ['jetour'] },
  { slug: 'changan', label: 'Changan', aliases: ['changan'] },
  { slug: 'baic', label: 'BAIC', aliases: ['baic'] },
  { slug: 'gac', label: 'GAC', aliases: ['gac'] },
  { slug: 'volvo', label: 'Volvo', aliases: ['volvo'] },
  { slug: 'tesla', label: 'Tesla', aliases: ['tesla'] },
];

const MODEL_RULES = [
  { family: 'Honda Civic', aliases: ['honda civic', 'civic'] },
  { family: 'Honda Accord', aliases: ['honda accord', 'accord'] },
  { family: 'Honda CR-V', aliases: ['cr v', 'cr-v', 'honda crv', 'honda cr-v'] },
  { family: 'Toyota Prius', aliases: ['toyota prius', 'prius'] },
  { family: 'Toyota Corolla', aliases: ['toyota corolla', 'corolla'] },
  { family: 'Toyota Camry', aliases: ['toyota camry', 'camry'] },
  { family: 'Toyota RAV4', aliases: ['toyota rav4', 'rav4', 'rav 4'] },
  { family: 'Mazda 3', aliases: ['mazda 3', 'mazda3'] },
  { family: 'Mazda CX-30', aliases: ['cx 30', 'cx-30', 'mazda cx30', 'mazda cx-30'] },
  { family: 'Mazda CX-5', aliases: ['cx 5', 'cx-5', 'mazda cx5', 'mazda cx-5'] },
  { family: 'Nissan Versa', aliases: ['nissan versa', 'versa'] },
  { family: 'Nissan Sentra', aliases: ['nissan sentra', 'sentra'] },
  { family: 'Nissan March', aliases: ['nissan march', 'march'] },
  { family: 'Nissan NP300', aliases: ['np300', 'np 300'] },
  { family: 'Volkswagen Jetta', aliases: ['volkswagen jetta', 'vw jetta', 'jetta'] },
  { family: 'Volkswagen Vento', aliases: ['volkswagen vento', 'vw vento', 'vento'] },
  { family: 'Volkswagen Tiguan', aliases: ['tiguan'] },
  { family: 'Chevrolet Aveo', aliases: ['chevrolet aveo', 'aveo'] },
  { family: 'Chevrolet Onix', aliases: ['chevrolet onix', 'onix'] },
  { family: 'Chevrolet Spark', aliases: ['chevrolet spark', 'spark'] },
  { family: 'Ford F-150', aliases: ['f 150', 'f-150', 'ford lobo', 'lobo'] },
  { family: 'Ford Escape', aliases: ['ford escape', 'escape'] },
  { family: 'Kia Rio', aliases: ['kia rio', 'rio'] },
  { family: 'Kia Sportage', aliases: ['kia sportage', 'sportage'] },
  { family: 'Hyundai Tucson', aliases: ['hyundai tucson', 'tucson'] },
  { family: 'SEAT Ibiza', aliases: ['seat ibiza', 'ibiza'] },
  { family: 'Suzuki Swift', aliases: ['suzuki swift', 'swift'] },
  { family: 'MG ZS', aliases: ['mg zs', 'zs'] },
  { family: 'BYD Dolphin', aliases: ['byd dolphin', 'dolphin'] },
];

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=120, s-maxage=300',
    },
    body: JSON.stringify(body),
  };
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function words(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasAlias(textWords, alias) {
  const needle = words(alias);
  if (!needle) return false;
  return ` ${textWords} `.includes(` ${needle} `);
}

function clean(value, max = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function uniqByUrl(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = item && (item.url || item.title || item.label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function safeUrl(url) {
  const raw = String(url || '').trim();
  if (!/^https?:\/\//i.test(raw)) return '';
  return raw;
}

function listingText(listing, query) {
  return [
    query,
    listing && listing.titulo,
    listing && listing.title,
    listing && listing.descripcion,
    listing && listing.description,
    listing && listing.portal,
    listing && listing.ubicacion,
    listing && listing.precio,
  ].filter(Boolean).join(' ');
}

function inferYear(textWords) {
  const match = textWords.match(/\b(19[6-9][0-9]|20[0-2][0-9])\b/);
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 1960 && year <= 2027 ? year : null;
}

function inferBrand(textWords) {
  return BRAND_RULES.find((rule) => rule.aliases.some((alias) => hasAlias(textWords, alias))) || null;
}

function inferModel(textWords) {
  return MODEL_RULES.find((rule) => rule.aliases.some((alias) => hasAlias(textWords, alias))) || null;
}

function readBrief(slug) {
  if (!slug) return null;
  const candidates = [
    path.join(BRIEFS_DIR, `${slug}.json`),
    slug === 'mercedes-benz' ? path.join(BRIEFS_DIR, 'mercedes.json') : '',
  ].filter(Boolean);

  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

function claimIsUsable(claim) {
  const summary = normalize(claim && claim.summary);
  if (!claim || claim.needs_verification) return false;
  if (String(claim.confidence || '').toLowerCase() === 'low') return false;
  if (summary.includes('requiere subtitulo') || summary.includes('requiere revision')) return false;
  return clean(claim.summary, 40).length > 12;
}

function briefStats(brief) {
  const claims = list(brief && brief.selected_claims);
  const usable = claims.filter(claimIsUsable);
  const needsReview = claims.filter((claim) => claim && (claim.needs_verification || String(claim.confidence || '').toLowerCase() === 'low'));
  return {
    claim_count: Number(brief && brief.claim_count) || claims.length || 0,
    selected_claim_count: Number(brief && brief.selected_claim_count) || claims.length || 0,
    usable_claim_count: usable.length,
    review_needed_count: needsReview.length,
    source_count: Number(brief && brief.source_count) || Object.keys((brief && brief.sources) || {}).length,
    owned_tixuz_video_count: Number(brief && brief.owned_tixuz_video_count) || 0,
  };
}

function topicText(topic) {
  return words([
    topic.slug,
    topic.title,
    topic.label,
    topic.description,
    topic.publicContext,
    ...(topic.queries || []),
  ].filter(Boolean).join(' '));
}

function findTopics(textWords, brand) {
  const brandAliases = brand ? brand.aliases : [];
  const matched = [];
  for (const topic of YOUTUBE_TOPIC_PAGES || []) {
    const haystack = topicText(topic);
    const byBrand = brandAliases.some((alias) => hasAlias(haystack, alias));
    const byTopic = (
      (hasAlias(textWords, 'hibrido') || hasAlias(textWords, 'hybrid') || hasAlias(textWords, 'electrico')) &&
      (topic.slug || '').includes('hibridos')
    ) || (
      (hasAlias(textWords, 'mg') || hasAlias(textWords, 'chirey') || hasAlias(textWords, 'jac') || hasAlias(textWords, 'byd') || hasAlias(textWords, 'changan') || hasAlias(textWords, 'omoda') || hasAlias(textWords, 'geely') || hasAlias(textWords, 'baic') || hasAlias(textWords, 'gac')) &&
      (topic.slug || '').includes('chinos')
    );
    if (byBrand || byTopic) matched.push(topic);
  }
  return matched.slice(0, 3);
}

function isOld(year) {
  return year && year <= new Date().getFullYear() - 12;
}

function baseProfile() {
  return {
    family: 'auto usado',
    tone: 'Analisis inicial',
    summary: 'Lo importante no es solo el precio: antes de moverte hay que revisar papeles, historial, kilometraje real, estado mecanico y precio contra mercado.',
    good: [
      'Puede ser candidato si el precio esta dentro de mercado y los documentos estan claros.',
      'Una buena publicacion debe permitir comparar ano, version, kilometraje, ubicacion y estado real.',
      'Si el vendedor acepta revision mecanica y legal, baja mucho el riesgo de sorpresa.',
    ],
    watch: [
      'Factura, adeudos, placas, reporte de robo y coincidencia de NIV/serie.',
      'Golpes estructurales, testigos prendidos, fugas, humo, ruidos y reparaciones recientes.',
      'Kilometraje contra desgaste de volante, pedales, asientos, llantas y discos.',
    ],
    questions: [
      'Factura original, refacturado o aseguradora?',
      'Debe tenencias, multas, verificacion o tiene algun gravamen?',
      'Acepta revision mecanica y escaneo antes de cerrar?',
    ],
  };
}

function specificProfile(textWords, brand, model, year) {
  const profile = baseProfile();

  if (hasAlias(textWords, 'civic') || hasAlias(textWords, 'honda civic')) {
    return {
      family: 'Honda Civic',
      tone: 'Buen candidato para revisar',
      summary: 'Civic suele ser una compra noble por durabilidad, manejo y refacciones, pero en unidades viejas manda mas el mantenimiento que el emblema.',
      good: [
        'Motor eficiente y generalmente durable si no fue maltratado.',
        'Buena reventa y comunidad amplia para piezas y diagnostico.',
        'Manejo ligero, practico para ciudad y suficiente para carretera.',
      ],
      watch: [
        'Suspension, bujes, rotulas, amortiguadores y ruidos en tren delantero.',
        'Sobrecalentamiento, fugas de aceite, estado de radiador y ventiladores.',
        'Caja automatica si patea, tarda en entrar o no tiene historial de servicio.',
      ],
      questions: [
        'Cuando fue el ultimo servicio mayor?',
        'Tiene factura y baja/alta correcta?',
        'Se puede escanear y revisar compresion antes de pagar?',
      ],
    };
  }

  if (hasAlias(textWords, 'prius') || hasAlias(textWords, 'hibrido') || hasAlias(textWords, 'hybrid')) {
    return {
      family: model ? model.family : 'hibrido usado',
      tone: 'Buen candidato con diagnostico',
      summary: 'Un hibrido puede ahorrar mucho en ciudad, pero la decision depende de bateria, diagnostico, enfriamiento y uso previo.',
      good: [
        'Consumo bajo si el sistema hibrido esta sano.',
        'Buena opcion para uso diario cuando hay historial y diagnostico.',
        'La reventa puede ser fuerte si la bateria esta comprobada.',
      ],
      watch: [
        'Estado de bateria hibrida, codigos de alta tension y modulo de enfriamiento.',
        'Historial de servicios y si trabajo en plataforma o flotilla.',
        'Suspension y llantas por uso urbano intenso.',
      ],
      questions: [
        'Tiene diagnostico reciente de bateria hibrida?',
        'Servicios en agencia o taller especializado?',
        'Fue particular, flotilla o plataforma?',
      ],
    };
  }

  if (brand && brand.slug === 'mazda') {
    return {
      family: model ? model.family : 'Mazda usado',
      tone: 'Buen candidato para revisar',
      summary: 'Mazda suele gustar por manejo, interiores y confiabilidad, pero hay que revisar suspension, rines, llantas, servicios y golpes bajos.',
      good: [
        'Buen manejo y sensacion de calidad para el precio.',
        'Motores atmosfericos con buena reputacion si tienen servicios.',
        'Reventa sana en modelos populares.',
      ],
      watch: [
        'Suspension, ruidos en tren delantero, rines reparados y desgaste irregular de llantas.',
        'Historial de servicios y aceite correcto.',
        'Golpes en fascia baja, salpicaderas, cajuela o soportes.',
      ],
      questions: [
        'Tiene servicios comprobables?',
        'Se ha reparado suspension, rines o fascia?',
        'Acepta prueba de manejo en frio?',
      ],
    };
  }

  if (brand && ['mercedes-benz', 'bmw', 'audi', 'mini', 'land-rover', 'lexus', 'acura'].includes(brand.slug)) {
    return {
      family: model ? model.family : 'premium usado',
      tone: 'Compra con cautela',
      summary: 'Puede verse como ganga, pero no se compra como auto barato: se compra con presupuesto real para mantenimiento premium.',
      good: [
        'Mucho equipo, comodidad y desempeno por menos dinero que nuevo.',
        'Puede ser muy disfrutable si trae historial completo.',
        'Una unidad cuidada puede tener mejor valor que una barata sin pruebas.',
      ],
      watch: [
        'Electronica, sensores, modulos, testigos y escaneo especializado.',
        'Servicios caros, llantas, frenos, suspension, turbo y piezas especificas.',
        'Fugas, transmision, historial incompleto y reparaciones improvisadas.',
      ],
      questions: [
        'Tienes historial completo de servicios?',
        'Que reparaciones grandes ya se hicieron?',
        'Acepta escaneo especializado antes de apartar?',
      ],
    };
  }

  if (brand && ['mg', 'chirey', 'jac', 'byd', 'omoda', 'jetour', 'changan', 'great-wall', 'geely', 'baic', 'gac'].includes(brand.slug)) {
    return {
      family: model ? model.family : 'marca nueva / china',
      tone: 'Analizar soporte antes de comprar',
      summary: 'Puede traer mucho equipo por precio atractivo; el punto fino es garantia, refacciones, agencia cercana y valor de reventa.',
      good: [
        'Mucho equipamiento por el dinero.',
        'Modelos recientes pueden conservar garantia.',
        'Interiores y tecnologia atractivos frente a marcas tradicionales.',
      ],
      watch: [
        'Disponibilidad de refacciones y tiempos reales de taller.',
        'Historial de garantia, servicios y campanas pendientes.',
        'Depreciacion, demanda de reventa y agencia cercana.',
      ],
      questions: [
        'Sigue con garantia vigente y transferible?',
        'Donde se han hecho los servicios?',
        'Hay agencia y refacciones en tu ciudad?',
      ],
    };
  }

  if (brand && brand.slug === 'nissan') {
    return {
      family: model ? model.family : 'Nissan usado',
      tone: 'Revisar version y uso previo',
      summary: 'Nissan tiene opciones muy comerciales; separa modelos de batalla confiables de unidades con caja CVT o uso intensivo.',
      good: [
        'Refacciones faciles y mercado amplio.',
        'Buena demanda en modelos populares.',
        'Opciones practicas para ciudad, familia o trabajo.',
      ],
      watch: [
        'Caja CVT en modelos que la equipan: servicio, ruido, patinaje o jaloneos.',
        'Uso de plataforma, flotilla o trabajo y desgaste interior.',
        'Suspension, soportes, frenos e historial de servicios.',
      ],
      questions: [
        'La transmision ha tenido servicio comprobable?',
        'Fue particular, flotilla o plataforma?',
        'Hay facturas de mantenimiento?',
      ],
    };
  }

  if (brand && brand.slug === 'volkswagen') {
    return {
      family: model ? model.family : 'Volkswagen usado',
      tone: 'Revisar caja y mantenimiento',
      summary: 'VW puede ser buena compra por manejo y mercado, pero hay que revisar transmision, sensores y mantenimiento preventivo.',
      good: [
        'Buen manejo y sensacion solida.',
        'Demanda alta en Jetta, Vento y modelos populares.',
        'Refacciones disponibles en muchas ciudades.',
      ],
      watch: [
        'Caja automatica o DSG segun version: servicio, tirones y testigos.',
        'Sensores, fugas, enfriamiento y electrico.',
        'Servicios atrasados y reparaciones baratas que salen caras despues.',
      ],
      questions: [
        'Que caja trae y cuando se le dio servicio?',
        'Tiene testigos prendidos?',
        'Se puede escanear antes de negociar?',
      ],
    };
  }

  if (brand && ['toyota', 'honda'].includes(brand.slug)) {
    profile.family = model ? model.family : `${brand.label} usado`;
    profile.tone = 'Buen candidato para revisar';
    profile.summary = `${brand.label} suele tener buena reputacion de confiabilidad y reventa, pero en un usado manda el historial real, no la fama de la marca.`;
    profile.good = [
      'Marca con demanda fuerte y buena percepcion de durabilidad.',
      'Puede conservar valor si tiene papeles e historial claro.',
      'Hay comunidad, talleres y refacciones para modelos populares.',
    ];
    profile.watch = [
      'Mantenimiento real contra kilometraje anunciado.',
      'Choques, reparaciones estructurales y piezas de desgaste.',
      'Version exacta, transmision y servicios preventivos.',
    ];
    profile.questions = [
      'Tiene servicios comprobables?',
      'Ha tenido choque, aseguradora o reparacion mayor?',
      'Acepta revision mecanica y legal antes de cerrar?',
    ];
  } else if (brand) {
    profile.family = model ? model.family : `${brand.label} usado`;
    profile.summary = `Este ${brand.label} puede convenir si el precio, historial y estado real cuadran; no conviene decidir solo por foto o mensualidad.`;
  } else if (model) {
    profile.family = model.family;
  }

  if (isOld(year)) {
    profile.watch = [
      ...profile.watch,
      'Por edad, revisar hules, mangueras, soportes, enfriamiento, tierra/oxido y disponibilidad de piezas.',
    ].slice(0, 5);
    profile.questions = [
      ...profile.questions,
      'Que reparaciones grandes se le han hecho en los ultimos 24 meses?',
    ].slice(0, 5);
  }

  return profile;
}

function sourceLinksFromBrief(brief) {
  const owned = list(brief && brief.owned_tixuz_videos).map((video) => ({
    label: video.title || 'Video Tixuz',
    url: safeUrl(video.url),
    type: 'tixuz_video',
  }));

  const claimSources = list(brief && brief.selected_claims).map((claim) => ({
    label: claim.source_title || claim.source_channel || 'Fuente registrada',
    url: safeUrl(claim.source_url),
    type: 'registered_source',
  }));

  return uniqByUrl([...owned, ...claimSources]).filter((item) => item.url).slice(0, 6);
}

function topicLinks(topics) {
  return list(topics).map((topic) => ({
    label: topic.title || topic.label || topic.slug,
    url: youtubeTopicUrl(topic.slug),
    type: 'tixuz_topic',
  })).filter((item) => item.url).slice(0, 3);
}

function coverageFor(brief, topics) {
  const stats = briefStats(brief);
  if (brief && stats.owned_tixuz_video_count > 0) {
    return {
      level: 'owned_tixuz',
      label: 'Biblioteca Tixuz encontrada',
      confidence: stats.usable_claim_count > 0 ? 'media' : 'contextual',
      warning: stats.usable_claim_count > 0
        ? ''
        : 'Hay material de biblioteca, pero varias notas siguen en revision editorial; lo uso como contexto, no como veredicto definitivo.',
      stats,
    };
  }
  if (brief) {
    return {
      level: 'library_brief',
      label: 'Brief de biblioteca encontrado',
      confidence: stats.usable_claim_count > 0 ? 'media' : 'contextual',
      warning: stats.usable_claim_count > 0
        ? ''
        : 'El brief existe, pero no tiene suficientes claims verificados; el consejo se apoya mas en checklist y prudencia.',
      stats,
    };
  }
  if (topics && topics.length) {
    return {
      level: 'topic_page',
      label: 'Tema Tixuz relacionado',
      confidence: 'contextual',
      warning: 'Encontre tema editorial relacionado, pero no un brief especifico de marca/modelo.',
      stats,
    };
  }
  return {
    level: 'general',
    label: 'Analisis general honesto',
    confidence: 'basica',
    warning: 'No encontre cobertura editorial especifica suficiente; esto es checklist general para no inventar datos.',
    stats,
  };
}

function buildLibraryNote(brand, model, brief, topics, coverage) {
  const parts = [];
  if (brand) parts.push(`Detecte marca: ${brand.label}.`);
  if (model) parts.push(`Detecte modelo/familia: ${model.family}.`);
  if (brief) {
    const stats = coverage.stats || briefStats(brief);
    parts.push(`La biblioteca tiene ${stats.claim_count} pistas registradas y ${stats.source_count} fuente(s) para esta marca.`);
    if (stats.review_needed_count) {
      parts.push('Varias pistas requieren revision editorial, por eso no las presento como fallas comprobadas.');
    }
  }
  if (topics && topics.length) {
    parts.push(`Tambien hay ${topics.length} pagina(s) tematica(s) de Tixuz relacionadas.`);
  }
  if (!parts.length) return coverage.warning;
  return parts.join(' ');
}

function digestListing(listing) {
  return {
    title: clean((listing && (listing.titulo || listing.title)) || 'Anuncio sin titulo', 220),
    price: clean((listing && listing.precio) || '', 80),
    location: clean((listing && listing.ubicacion) || '', 120),
    mileage: clean((listing && listing.kilometraje) || '', 80),
    portal: clean((listing && listing.portal) || '', 80),
    url: safeUrl(listing && listing.url),
    image: safeUrl(listing && listing.imagen),
  };
}

function hashVerdict(input) {
  return crypto.createHash('sha1').update(JSON.stringify(input)).digest('hex').slice(0, 12);
}

function buildVerdict(payload) {
  const listing = payload && typeof payload.listing === 'object' ? payload.listing : {};
  const query = clean(payload && payload.query, 500);
  const digest = digestListing(listing);
  const text = listingText(listing, query);
  const textWords = words(text);
  const brand = inferBrand(textWords);
  const model = inferModel(textWords);
  const year = inferYear(textWords);
  const brief = readBrief(brand && brand.slug);
  const topics = findTopics(textWords, brand);
  const profile = specificProfile(textWords, brand, model, year);
  const coverage = coverageFor(brief, topics);
  const sourceLinks = uniqByUrl([
    ...topicLinks(topics),
    ...sourceLinksFromBrief(brief),
  ]).slice(0, 8);

  const titleBits = [year, model ? model.family : brand && brand.label].filter(Boolean);
  const detectedTitle = titleBits.length ? titleBits.join(' ') : profile.family;

  const nextSteps = [
    'Abrir la fuente original y confirmar que precio, version, ciudad y telefono coinciden.',
    'Pedir factura, NIV/serie y adeudos antes de apartar.',
    'Hacer revision mecanica, escaneo y prueba de manejo antes de pagar.',
  ];

  return {
    ok: true,
    verdict_id: hashVerdict({ digest, query, brand: brand && brand.slug, model: model && model.family, year }),
    generated_at: new Date().toISOString(),
    title: digest.title,
    detected: {
      brand: brand ? brand.label : '',
      brand_slug: brand ? brand.slug : '',
      model_family: model ? model.family : '',
      year,
      display: detectedTitle,
    },
    listing: digest,
    tone: profile.tone,
    summary: profile.summary,
    good: profile.good.slice(0, 5),
    watch: profile.watch.slice(0, 5),
    questions: profile.questions.slice(0, 5),
    next_steps: nextSteps,
    library_note: buildLibraryNote(brand, model, brief, topics, coverage),
    coverage,
    source_links: sourceLinks,
    business_note: 'Tixuz no necesita poseer el inventario para ayudar: convierte anuncios externos en una ficha de decision con checklist, fuentes y prudencia editorial.',
    disclaimer: 'No sustituye revision mecanica, legal ni inspeccion fisica. Sirve para decidir si vale la pena avanzar o descartar.',
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return json(200, { ok: true });
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Use POST' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { ok: false, error: 'Invalid JSON' });
  }

  const hasListing = payload && typeof payload.listing === 'object' && Object.keys(payload.listing).length > 0;
  const hasQuery = clean(payload && payload.query, 20).length > 0;
  if (!hasListing && !hasQuery) {
    return json(400, { ok: false, error: 'Missing listing or query' });
  }

  try {
    return json(200, buildVerdict(payload));
  } catch (e) {
    return json(500, {
      ok: false,
      error: 'Could not build verdict',
      detail: String(e && e.message ? e.message : e).slice(0, 300),
    });
  }
};
