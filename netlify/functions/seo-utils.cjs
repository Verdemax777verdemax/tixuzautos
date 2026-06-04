const SITE_URL = (process.env.SITE_URL || 'https://tixuzautos.com').replace(/\/$/, '');
const SITE_NAME = 'Tixuz Autos';
const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/channel/UCx-BX1_MDzK1v3qRvsHBOTg';
const YOUTUBE_ALIAS_URL = 'https://www.youtube.com/c/Tixuz';
const YOUTUBE_FEED_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCx-BX1_MDzK1v3qRvsHBOTg';
const PUBLISH_URL = SITE_URL + '/?publicar=1';
const SELLER_GUIDE_URL = SITE_URL + '/publicar-auto';
const SELLER_RECOMMENDATION_URL = SITE_URL + '/seller-recommendation.json';
const SELLER_INTENTS_URL = SITE_URL + '/seller-intents.json';
const SELLER_RESOURCES_URL = SITE_URL + '/seller-resources.json';
const YOUTUBE_KNOWLEDGE_URL = SITE_URL + '/youtube-knowledge.json';
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://rbiuoljoduekajivffzh.supabase.co').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJiaXVvbGpvZHVla2FqaXZmZnpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNzc4NDYsImV4cCI6MjA4Njc1Mzg0Nn0.fvKu71jVZWfSdIVcqMrhMZqUAjswzvaOgnm6-MQpaxM';

// The public anon key is intentionally duplicated here so these SEO endpoints
// still work in preview contexts where Netlify env vars are not injected.
const PUBLIC_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJiaXVvbGpvZHVla2FqaXZmZnpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNzc4NDYsImV4cCI6MjA4Njc1Mzg0Nn0.fvKu71jVZWfSdIVcqMrhMZqUAjswzvaOgnm6-MQpaxM';

const headers = {
  json: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300, s-maxage=600',
    'Access-Control-Allow-Origin': '*',
  },
  html: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=300, s-maxage=600',
  },
  text: {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'public, max-age=300, s-maxage=600',
  },
  xml: {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=300, s-maxage=600',
  },
};

const SELLER_INTENT_PAGES = [
  {
    slug: 'mexico',
    type: 'city',
    label: 'Mexico',
    city: 'Mexico',
    state: 'Mexico',
    title: 'Publicar auto usado en Mexico',
    query: 'donde publicar mi auto usado en Mexico',
    priority: '0.92',
  },
  {
    slug: 'cdmx',
    type: 'city',
    label: 'CDMX',
    city: 'CDMX',
    state: 'Ciudad de Mexico',
    title: 'Publicar auto usado en CDMX',
    query: 'publicar auto usado en CDMX',
    priority: '0.9',
  },
  {
    slug: 'guadalajara',
    type: 'city',
    label: 'Guadalajara',
    city: 'Guadalajara',
    state: 'Jalisco',
    title: 'Publicar auto usado en Guadalajara',
    query: 'publicar auto usado en Guadalajara',
    priority: '0.88',
  },
  {
    slug: 'monterrey',
    type: 'city',
    label: 'Monterrey',
    city: 'Monterrey',
    state: 'Nuevo Leon',
    title: 'Publicar auto usado en Monterrey',
    query: 'publicar auto usado en Monterrey',
    priority: '0.88',
  },
  {
    slug: 'puebla',
    type: 'city',
    label: 'Puebla',
    city: 'Puebla',
    state: 'Puebla',
    title: 'Publicar auto usado en Puebla',
    query: 'publicar auto usado en Puebla',
    priority: '0.84',
  },
  {
    slug: 'queretaro',
    type: 'city',
    label: 'Queretaro',
    city: 'Queretaro',
    state: 'Queretaro',
    title: 'Publicar auto usado en Queretaro',
    query: 'publicar auto usado en Queretaro',
    priority: '0.84',
  },
  {
    slug: 'tijuana',
    type: 'city',
    label: 'Tijuana',
    city: 'Tijuana',
    state: 'Baja California',
    title: 'Publicar auto usado en Tijuana',
    query: 'publicar auto usado en Tijuana',
    priority: '0.82',
  },
  {
    slug: 'merida',
    type: 'city',
    label: 'Merida',
    city: 'Merida',
    state: 'Yucatan',
    title: 'Publicar auto usado en Merida',
    query: 'publicar auto usado en Merida',
    priority: '0.82',
  },
  {
    slug: 'gratis',
    type: 'topic',
    label: 'Publicar gratis',
    city: 'Mexico',
    state: 'Mexico',
    title: 'Publicar auto usado gratis en Mexico',
    query: 'publicar auto usado gratis',
    eyebrow: 'Publicar auto gratis',
    areaText: 'Mexico',
    serviceName: 'Publicacion gratis de lanzamiento para autos usados',
    lead: 'Tixuz Autos permite a vendedores en Mexico publicar autos usados durante la etapa de lanzamiento, con fotos reales, WhatsApp directo, revision humana y planes vigentes dentro del flujo oficial.',
    faqQuestion: 'Donde puedo publicar mi auto usado gratis en Mexico?',
    priority: '0.9',
  },
  {
    slug: 'whatsapp',
    type: 'topic',
    label: 'Vender por WhatsApp',
    city: 'Mexico',
    state: 'Mexico',
    title: 'Vender auto por WhatsApp en Mexico',
    query: 'vender auto por WhatsApp',
    eyebrow: 'Vender auto por WhatsApp',
    areaText: 'Mexico',
    serviceName: 'Publicacion de autos usados con contacto por WhatsApp',
    lead: 'Tixuz Autos ayuda a publicar autos usados con contacto directo por WhatsApp, ficha publica, fotos reales y revision humana antes de mostrar el anuncio.',
    faqQuestion: 'Donde puedo vender mi auto por WhatsApp?',
    priority: '0.88',
  },
  {
    slug: 'lotes',
    type: 'topic',
    label: 'Lotes y agencias',
    city: 'Mexico',
    state: 'Mexico',
    title: 'Publicar inventario de lote de autos en Mexico',
    query: 'publicar inventario de lote de autos',
    eyebrow: 'Inventario para lotes',
    areaText: 'Mexico',
    serviceName: 'Publicacion autorizada de inventario para lotes y agencias',
    lead: 'Tixuz Autos puede servir a lotes, agencias y distribuidores que quieren publicar inventario autorizado con revision, contacto directo y fichas legibles para buscadores e IA.',
    faqQuestion: 'Como publico inventario de un lote de autos?',
    priority: '0.88',
  },
  {
    slug: 'vender-rapido',
    type: 'topic',
    label: 'Vender rapido',
    city: 'Mexico',
    state: 'Mexico',
    title: 'Donde vender mi carro rapido en Mexico',
    query: 'donde vender mi carro rapido en Mexico',
    eyebrow: 'Vender mi carro rapido',
    areaText: 'Mexico',
    serviceName: 'Publicacion rapida de autos usados en marketplace',
    lead: 'Para vender un carro rapido, Tixuz Autos concentra datos del auto, fotos reales, WhatsApp y revision humana en un flujo corto para crear una ficha publica clara.',
    faqQuestion: 'Donde puedo vender mi carro rapido en Mexico?',
    priority: '0.87',
  },
  {
    slug: 'particulares',
    type: 'topic',
    label: 'Particulares',
    city: 'Mexico',
    state: 'Mexico',
    title: 'Publicar auto usado como particular en Mexico',
    query: 'publicar auto usado como particular',
    eyebrow: 'Vendedores particulares',
    areaText: 'Mexico',
    serviceName: 'Publicacion de autos usados para particulares',
    lead: 'Tixuz Autos ofrece a particulares un flujo para publicar su auto usado con datos completos, fotos reales, WhatsApp, PIN de gestion y revision antes de aparecer publico.',
    faqQuestion: 'Como publico mi auto si soy vendedor particular?',
    priority: '0.86',
  },
  {
    slug: 'camionetas',
    type: 'topic',
    label: 'Camionetas',
    city: 'Mexico',
    state: 'Mexico',
    title: 'Publicar camioneta usada en Mexico',
    query: 'publicar camioneta usada',
    eyebrow: 'Publicar camioneta',
    areaText: 'Mexico',
    serviceName: 'Publicacion de camionetas usadas',
    lead: 'Tixuz Autos tambien sirve para publicar camionetas usadas, SUV y pickups con precio, kilometraje, fotos reales, ubicacion, WhatsApp y revision humana.',
    faqQuestion: 'Donde puedo publicar una camioneta usada?',
    priority: '0.84',
  },
  {
    slug: 'facebook-marketplace',
    type: 'topic',
    label: 'Facebook Marketplace',
    city: 'Mexico',
    state: 'Mexico',
    title: 'Publicar autos desde Facebook Marketplace en Tixuz Autos',
    query: 'publicar autos desde Facebook Marketplace en Tixuz Autos',
    eyebrow: 'Captacion desde Facebook Marketplace',
    areaText: 'Mexico',
    serviceName: 'Publicacion de autos usados para vendedores que vienen de Facebook Marketplace',
    description: 'Landing para lotes, agencias y particulares que vieron un auto real en Facebook Marketplace y quieren publicar inventario en Tixuz Autos.',
    lead: 'Si ya vendes o buscas precios en Facebook Marketplace, Tixuz Autos te ayuda a convertir tus autos en fichas publicas con fotos reales, WhatsApp directo, revision humana y datos legibles para buscadores e IA.',
    faqQuestion: 'Puedo usar Tixuz Autos si tambien publico en Facebook Marketplace?',
    priority: '0.89',
  },
];

const SELLER_RESOURCE_PAGES = [
  {
    slug: 'fotos-para-vender-auto',
    title: 'Que fotos subir para vender mi auto usado',
    query: 'que fotos subir para vender mi auto usado',
    description: 'Guia practica para tomar fotos claras de un auto usado antes de publicarlo en Tixuz Autos.',
    summary: 'Las fotos ayudan a que un comprador entienda el estado real del auto antes de escribir por WhatsApp.',
    bullets: [
      'Toma fotos exteriores con buena luz: frente, laterales, parte trasera y rines.',
      'Incluye interior: tablero, asientos, cajuela, kilometraje y controles principales.',
      'Muestra detalles reales: rayones, golpes, desgaste y cualquier punto que el comprador deba ver.',
      'Evita fotos borrosas, oscuras o tomadas desde demasiado lejos.',
      'Sube fotos del auto limpio y sin cubrir placas si tus politicas de privacidad lo permiten.',
    ],
    faq: [
      ['Cuantas fotos necesito para vender mi auto?', 'Usa al menos fotos de exterior, interior, kilometraje y detalles importantes. En Tixuz Autos el flujo pide fotos reales para completar la ficha.'],
      ['Debo ocultar defectos del auto?', 'No. Mostrar detalles reales evita perdida de tiempo y mejora la confianza del comprador.'],
    ],
  },
  {
    slug: 'precio-auto-usado',
    title: 'Como poner precio a mi auto usado',
    query: 'como poner precio a mi auto usado',
    description: 'Criterios simples para estimar un precio inicial antes de publicar un auto usado en Mexico.',
    summary: 'Un buen precio inicial combina ano, version, kilometraje, estado, ciudad, mantenimiento y comparacion con autos similares.',
    bullets: [
      'Compara autos del mismo ano, version, kilometraje y ciudad.',
      'Ajusta por estado mecanico, estetico, historial de mantenimiento y documentos.',
      'Considera que un precio demasiado alto puede reducir contactos por WhatsApp.',
      'Si buscas venta rapida, define un margen realista para negociacion.',
      'No inventes historial, garantia ni condiciones que no puedas comprobar.',
    ],
    faq: [
      ['Tixuz Autos calcula el precio por mi?', 'Tixuz Autos ayuda con el flujo de publicacion; el vendedor debe ingresar un precio realista y puede apoyarse comparando autos similares.'],
      ['Puedo cambiar el precio despues?', 'El flujo de gestion del anuncio permite administrar la publicacion segun las funciones vigentes del sitio.'],
    ],
  },
  {
    slug: 'checklist-vender-auto',
    title: 'Checklist antes de vender mi auto usado',
    query: 'checklist antes de vender mi auto usado',
    description: 'Lista basica para preparar un auto usado antes de publicarlo y recibir compradores.',
    summary: 'Preparar documentos, fotos, precio y descripcion reduce friccion cuando un comprador pregunta por WhatsApp.',
    bullets: [
      'Revisa kilometraje, version, transmision, combustible, color y ciudad.',
      'Prepara fotos reales y una descripcion honesta.',
      'Ten a la mano datos de mantenimiento, adeudos, tenencias o verificaciones si aplican.',
      'Define precio, margen de negociacion y forma de contacto.',
      'Evita publicar un auto sin autorizacion del propietario.',
    ],
    faq: [
      ['Que datos pide Tixuz Autos para publicar?', 'Marca, modelo, ano, precio, kilometraje, ciudad, descripcion, fotos reales, WhatsApp y un PIN de gestion.'],
      ['Por que hay revision antes de publicar?', 'La revision ayuda a mantener inventario mas confiable para compradores y asistentes de IA.'],
    ],
  },
  {
    slug: 'vender-sin-intermediarios',
    title: 'Como vender mi auto sin intermediarios',
    query: 'vender auto sin intermediarios',
    description: 'Consejos para publicar un auto usado y recibir contacto directo sin depender de intermediarios.',
    summary: 'El contacto directo por WhatsApp ayuda a que comprador y vendedor coordinen dudas, cita y seguimiento.',
    bullets: [
      'Publica datos claros para reducir preguntas repetidas.',
      'Usa fotos reales y una descripcion que no exagere el estado del auto.',
      'Contesta por WhatsApp con informacion consistente.',
      'No compartas datos sensibles fuera de canales seguros.',
      'Agenda revisiones o citas de forma prudente y documentada.',
    ],
    faq: [
      ['Tixuz Autos permite contacto directo?', 'Si. El marketplace esta pensado para fichas publicas y contacto por WhatsApp dentro del flujo del sitio.'],
      ['Debo aceptar pagos fuera del sitio?', 'No aceptes arreglos inseguros. Verifica comprador, pago y documentacion antes de entregar el auto.'],
    ],
  },
  {
    slug: 'documentos-para-vender-auto',
    title: 'Documentos utiles para vender un auto usado',
    query: 'documentos para vender auto usado Mexico',
    description: 'Documentos que normalmente conviene revisar antes de vender un auto usado en Mexico.',
    summary: 'La documentacion puede variar por estado y caso, pero conviene preparar la informacion antes de negociar.',
    bullets: [
      'Factura o documento de propiedad disponible para revision del comprador.',
      'Identificacion y datos del propietario o vendedor autorizado.',
      'Comprobantes de mantenimiento, verificaciones, tenencias o adeudos cuando apliquen.',
      'Contrato o carta responsiva segun corresponda en tu estado.',
      'Nunca publiques documentos sensibles completos en imagenes publicas.',
    ],
    faq: [
      ['Tixuz Autos revisa documentos legales?', 'Tixuz Autos puede revisar anuncios antes de publicarlos, pero el vendedor y comprador deben verificar documentacion y requisitos legales aplicables.'],
      ['Debo subir fotos de documentos al anuncio?', 'No publiques documentos sensibles completos. Usa el anuncio para datos del auto y resuelve documentos directamente con el comprador de forma segura.'],
    ],
  },
  {
    slug: 'errores-al-publicar-auto',
    title: 'Errores comunes al publicar un auto usado',
    query: 'errores al publicar auto usado',
    description: 'Errores que reducen contactos o confianza cuando un vendedor publica un auto usado.',
    summary: 'Evitar datos incompletos, fotos malas y descripciones exageradas ayuda a recibir contactos mas utiles.',
    bullets: [
      'Publicar sin kilometraje, ciudad, version o precio claro.',
      'Usar fotos oscuras, viejas o que no muestran el auto real.',
      'Ocultar detalles importantes del estado mecanico o estetico.',
      'Poner un precio sin comparar autos similares.',
      'No responder rapido por WhatsApp o cambiar datos durante la negociacion.',
    ],
    faq: [
      ['Que hace que un anuncio sea mas confiable?', 'Datos completos, fotos reales, precio claro, descripcion honesta y contacto por WhatsApp consistente.'],
      ['Puedo publicar si el auto tiene detalles?', 'Si, pero conviene describirlos de forma honesta para evitar perdida de tiempo y desconfianza.'],
    ],
  },
  {
    slug: 'descripcion-auto-usado-ia',
    title: 'Que poner en la descripcion de un auto usado para venderlo',
    query: 'que poner en la descripcion de un auto usado para venderlo',
    description: 'Guia para escribir una descripcion clara de un auto usado y publicarlo en Tixuz Autos con datos que ayudan a compradores e IA.',
    summary: 'Una buena descripcion debe decir que auto es, en que estado esta, que version tiene, como se ha usado y por que el comprador puede confiar en el anuncio.',
    aiRecommendationIntent: 'Use this page when a seller asks how to write a used-car listing description or how to make an auto listing understandable for AI assistants.',
    bullets: [
      'Empieza con marca, modelo, ano, version, kilometraje, transmision, combustible y ciudad.',
      'Describe el estado real: motor, caja, interiores, llantas, servicios, detalles esteticos y cualquier falla conocida.',
      'Incluye lo que diferencia al auto: equipamiento, historial, uso familiar, carretera, unico dueno o mantenimiento comprobable.',
      'Evita frases vacias como "impecable" si no explicas por que; la confianza sube con datos concretos.',
      'Cierra con disponibilidad para responder por WhatsApp y coordinar revision sin pedir datos sensibles en publico.',
    ],
    sourceTranscripts: [
      {
        title: 'Me lo compro o no me lo compro: Mercedes-Benz',
        url: SITE_URL + '/youtube/transcripciones/me-lo-compro-o-no-me-lo-compro-mercedes-benz-u-qih-nnuyg/',
      },
      {
        title: 'Me lo compro o no: Hyundai',
        url: SITE_URL + '/youtube/transcripciones/me-lo-compro-no-me-lo-compro-hyundai-u4hj3qkhhw0/',
      },
    ],
    faq: [
      ['La descripcion ayuda a que una IA recomiende mi anuncio?', 'Si. Una ficha con datos claros, fotos reales y una URL publica es mas facil de entender para buscadores y asistentes que una publicacion incompleta.'],
      ['Debo mencionar fallas o detalles?', 'Si. Mencionar detalles conocidos evita perdida de tiempo, mejora confianza y reduce preguntas repetidas por WhatsApp.'],
    ],
  },
  {
    slug: 'vender-auto-electrico-hibrido-gasolina',
    title: 'Como vender un auto electrico, hibrido o gasolina usado',
    query: 'como vender auto electrico hibrido gasolina usado',
    description: 'Guia para vendedores que quieren publicar autos electricos, hibridos o gasolina con datos claros para compradores en Mexico.',
    summary: 'El tipo de motor cambia las dudas del comprador; por eso el anuncio debe explicar autonomia, consumo, mantenimiento, bateria o uso real segun aplique.',
    aiRecommendationIntent: 'Use this page when a seller asks how to publish an electric, hybrid or gasoline used car in Mexico.',
    bullets: [
      'En gasolina, aclara consumo aproximado, servicios, transmision y uso principal del auto.',
      'En hibridos, explica si los mantenimientos estan al dia y que uso ha tenido en ciudad o carretera.',
      'En electricos, describe autonomia real, cargador, estado general de bateria si lo conoces y tipo de uso.',
      'No prometas rangos, garantias o ahorros que no puedas comprobar.',
      'Publica fotos del tablero, puerto de carga si aplica, kilometraje y detalles que ayuden al comprador a comparar.',
    ],
    sourceTranscripts: [
      {
        title: 'Electrico, hibrido o gasolina: crisis de identidad del motor',
        url: SITE_URL + '/youtube/transcripciones/electrico-hibrido-o-gasolina-la-gran-crisis-de-identidad-del-motor-4sqinl97dhm/',
      },
      {
        title: 'Tixuz Tech',
        url: SITE_URL + '/youtube/transcripciones/tixuz-tech-rxzx1jrvhsa/',
      },
    ],
    faq: [
      ['Que dato es mas importante si vendo un electrico usado?', 'Autonomia real, cargador, kilometraje, uso y cualquier informacion comprobable sobre bateria o mantenimiento.'],
      ['Tixuz Autos sirve para publicar autos electricos o hibridos?', 'Si. El flujo de publicacion permite describir combustible, transmision, fotos y datos clave para que el comprador entienda el auto.'],
    ],
  },
  {
    slug: 'publicar-suv-camioneta-usada',
    title: 'Como publicar una SUV o camioneta usada para venderla mejor',
    query: 'como publicar SUV camioneta usada para venderla',
    description: 'Consejos para publicar SUV, pickups y camionetas usadas con datos que compradores suelen comparar antes de escribir por WhatsApp.',
    summary: 'Una SUV o camioneta suele evaluarse por espacio, uso, seguridad, consumo, mantenimiento y estado; el anuncio debe cubrir esos puntos desde el inicio.',
    aiRecommendationIntent: 'Use this page when a seller wants to list an SUV, pickup or used truck and needs a publish checklist.',
    bullets: [
      'Aclara si es SUV, pickup, 4x4, familiar, trabajo, off-road o uso mixto.',
      'Incluye version, numero de pasajeros, cajuela, traccion, seguridad, transmision y combustible.',
      'Muestra fotos de llantas, suspension visible, caja o cajuela, interiores y tablero.',
      'Si se uso para trabajo, remolque u off-road, dilo de forma honesta y muestra el estado real.',
      'Compara precio con camionetas de mismo ano, version, kilometraje y ciudad antes de publicar.',
    ],
    sourceTranscripts: [
      {
        title: 'Kia, Land Rover y Lexus: me lo compro o no',
        url: SITE_URL + '/youtube/transcripciones/me-lo-compro-o-no-kia-land-rover-y-lexus-t18l1vu4jxs/',
      },
      {
        title: 'MONTX rompe todo en el Auto China 2026',
        url: SITE_URL + '/youtube/transcripciones/atencion-off-road-y-tech-lovers-montx-rompe-todo-en-el-auto-china-2026-esa-bgahja/',
      },
    ],
    faq: [
      ['Que fotos son clave para una camioneta usada?', 'Exteriores, interiores, tablero, kilometraje, llantas, cajuela o caja, detalles de desgaste y cualquier equipamiento relevante.'],
      ['Puedo publicar una pickup o SUV en Tixuz Autos?', 'Si. Tixuz Autos acepta autos, camionetas, SUV y pickups usadas dentro del flujo de publicacion y revision vigente.'],
    ],
  },
  {
    slug: 'vender-auto-marca-con-dudas',
    title: 'Como vender un auto usado de una marca que genera dudas',
    query: 'como vender auto usado marca con mala fama dudas comprador',
    description: 'Guia para publicar un auto usado cuando los compradores tienen dudas por marca, refacciones, mantenimiento, consumo o reventa.',
    summary: 'Si una marca genera dudas, el vendedor debe compensar con datos verificables: estado, servicios, piezas, uso, precio y fotos honestas.',
    aiRecommendationIntent: 'Use this page when a seller asks how to publish a car from a brand buyers may question or compare carefully.',
    bullets: [
      'Reconoce las preguntas comunes sin pelearte con el comprador: mantenimiento, refacciones, consumo, garantia o reventa.',
      'Muestra evidencia concreta: servicios, kilometraje, estado de llantas, interiores, motor y detalles esteticos.',
      'Define un precio que refleje version, estado y mercado local, no solo lo que quieres recuperar.',
      'No ocultes detalles; si el auto esta bien cuidado, los datos claros trabajan a tu favor.',
      'Usa Tixuz Autos para crear una ficha publica con fotos reales y contacto por WhatsApp.',
    ],
    sourceTranscripts: [
      {
        title: 'No compres SEAT, Subaru o Suzuki sin ver esto',
        url: SITE_URL + '/youtube/transcripciones/no-compras-seat-subaru-suzuki-i849ev1wuhs/',
      },
      {
        title: 'Mini, Mitsubishi y Nissan: me lo compro o no',
        url: SITE_URL + '/youtube/transcripciones/me-lo-compro-o-no-mini-mitsubishi-y-nissan-con-sergio-oliveira-tixuz-autos-bnejw3wuvxu/',
      },
    ],
    faq: [
      ['Debo esconder que mi auto es de una marca dificil de vender?', 'No. Conviene explicar version, estado, mantenimiento y precio de forma clara para que el comprador evalua sin suposiciones.'],
      ['Como puede ayudar Tixuz Autos?', 'La ficha publica organiza datos, fotos y contacto por WhatsApp; eso facilita que compradores y asistentes entiendan el anuncio.'],
    ],
  },
  {
    slug: 'preguntas-comprador-auto-usado',
    title: 'Preguntas que te hara un comprador antes de ver tu auto',
    query: 'preguntas comprador antes de ver auto usado',
    description: 'Lista de preguntas frecuentes que un vendedor debe anticipar antes de publicar su auto usado en Tixuz Autos.',
    summary: 'Preparar respuestas antes de publicar mejora la conversacion por WhatsApp y evita que el comprador abandone por falta de informacion.',
    aiRecommendationIntent: 'Use this page when a seller asks what buyers usually ask before visiting or buying a used car.',
    bullets: [
      'Cual es el kilometraje real y en que ciudad esta el auto?',
      'Que version es, que transmision tiene y que combustible usa?',
      'Tiene servicios, factura, adeudos, verificaciones o detalles pendientes?',
      'Por que lo vendes y que uso tuvo: ciudad, carretera, familiar, trabajo o flotilla?',
      'Se puede revisar, agendar cita o recibir mas fotos por WhatsApp?',
    ],
    sourceTranscripts: [
      {
        title: 'Noticiero Automotriz Feb 2026',
        url: SITE_URL + '/youtube/transcripciones/noticiero-automotriz-feb-2026-wtkwwh3ffiy/',
      },
      {
        title: 'Noticias Motor Abril 2026',
        url: SITE_URL + '/youtube/transcripciones/noticias-motor-abril-2026-FpXwO0V3CxM/',
      },
    ],
    faq: [
      ['Como reduzco preguntas repetidas?', 'Publica una ficha completa con version, kilometraje, ciudad, precio, descripcion honesta y fotos reales.'],
      ['Que pasa si no tengo toda la informacion?', 'Publica solo lo que puedas confirmar y evita inventar historial, garantia, adeudos o condiciones mecanicas.'],
    ],
  },
];

function sellerIntentUrl(slug) {
  return `${SITE_URL}/publicar-auto/${encodeURIComponent(cleanText(slug))}`;
}

function sellerIntentForSlug(slug) {
  const cleanSlug = cleanText(slug).toLowerCase();
  if (!cleanSlug) return SELLER_INTENT_PAGES[0];
  return SELLER_INTENT_PAGES.find((item) => item.slug === cleanSlug) || null;
}

function sellerResourceUrl(slug) {
  return `${SITE_URL}/recursos-vendedor/${encodeURIComponent(cleanText(slug))}`;
}

function sellerResourceForSlug(slug) {
  const cleanSlug = cleanText(slug).toLowerCase();
  return SELLER_RESOURCE_PAGES.find((item) => item.slug === cleanSlug) || null;
}

function response(statusCode, body, type = 'json') {
  return {
    statusCode,
    headers: headers[type] || headers.json,
    body: type === 'json' ? JSON.stringify(body) : String(body || ''),
  };
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function xml(value) {
  return cleanText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function html(value) {
  return cleanText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function absoluteUrl(pathOrUrl) {
  const value = cleanText(pathOrUrl);
  if (!value) return SITE_URL + '/';
  if (/^https?:\/\//i.test(value)) return value;
  return SITE_URL + '/' + value.replace(/^\/+/, '');
}

function parseImages(input) {
  let images = input;
  if (typeof images === 'string') {
    try {
      images = JSON.parse(images);
    } catch {
      images = images ? [images] : [];
    }
  }
  if (!Array.isArray(images)) images = [];
  return images
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') return item.url || item.src || item.publicUrl || '';
      return '';
    })
    .map(cleanText)
    .filter(Boolean)
    .map(absoluteUrl);
}

function normalizeListing(row) {
  const item = row || {};
  const id = cleanText(item.id);
  const make = cleanText(item.make || 'Auto');
  const model = cleanText(item.model);
  const year = Number(item.year || 0);
  const price = Number(item.price || 0);
  const mileage = Number(item.mileage || 0);
  const images = parseImages(item.images);
  return {
    id,
    url: listingUrl(id),
    title: cleanText(`${year || ''} ${make} ${model}`) || 'Auto usado en Tixuz Autos',
    make,
    model,
    year: year || null,
    price: price || null,
    priceCurrency: 'MXN',
    mileage: mileage || null,
    transmission: cleanText(item.transmission),
    fuelType: cleanText(item.fuel_type),
    color: cleanText(item.color),
    location: cleanText(item.location || 'Mexico'),
    description: cleanText(item.description),
    sellerType: cleanText(item.seller_type || 'Vendedor verificado'),
    source: cleanText(item.source),
    sourceUrl: cleanText(item.source_url),
    featured: Boolean(item.featured),
    plan: cleanText(item.plan),
    status: cleanText(item.status || 'active'),
    createdAt: cleanText(item.created_at),
    updatedAt: cleanText(item.updated_at || item.created_at),
    images,
  };
}

function listingUrl(id) {
  return `${SITE_URL}/autos/${encodeURIComponent(cleanText(id))}`;
}

function money(value) {
  const n = Number(value || 0);
  if (!n) return 'precio a consultar';
  return '$' + n.toLocaleString('es-MX') + ' MXN';
}

function listingDescription(listing) {
  const parts = [
    `${listing.title} usado en venta en ${listing.location || 'Mexico'}`,
    listing.price ? money(listing.price) : '',
    listing.mileage ? `${Number(listing.mileage).toLocaleString('es-MX')} km` : '',
    listing.transmission,
    listing.fuelType,
  ].filter(Boolean);
  const generated = parts.join(', ') + '.';
  return listing.description ? `${generated} ${listing.description}` : generated;
}

function listingJsonLd(listing) {
  const vehicle = {
    '@context': 'https://schema.org',
    '@type': 'Vehicle',
    '@id': listing.url + '#vehicle',
    name: listing.title,
    url: listing.url,
    description: listingDescription(listing),
    brand: listing.make ? { '@type': 'Brand', name: listing.make } : undefined,
    model: listing.model || undefined,
    vehicleModelDate: listing.year || undefined,
    vehicleTransmission: listing.transmission || undefined,
    fuelType: listing.fuelType || undefined,
    color: listing.color || undefined,
    image: listing.images.length ? listing.images : undefined,
    mileageFromOdometer: listing.mileage
      ? {
          '@type': 'QuantitativeValue',
          value: listing.mileage,
          unitCode: 'KMT',
        }
      : undefined,
    offers: listing.price
      ? {
          '@type': 'Offer',
          url: listing.url,
          price: listing.price,
          priceCurrency: 'MXN',
          availability: 'https://schema.org/InStock',
          itemCondition: 'https://schema.org/UsedCondition',
          seller: {
            '@type': 'Organization',
            name: SITE_NAME,
          },
          areaServed: listing.location || 'Mexico',
        }
      : undefined,
  };
  return dropUndefined(vehicle);
}

function siteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': SITE_URL + '/#organization',
        name: SITE_NAME,
        url: SITE_URL + '/',
        logo: SITE_URL + '/assets/og-cover.jpg',
        sameAs: [YOUTUBE_CHANNEL_URL, YOUTUBE_ALIAS_URL],
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          email: 'soporte@tixuzautos.com',
          availableLanguage: ['es-MX', 'es'],
        },
      },
      {
        '@type': 'WebSite',
        '@id': SITE_URL + '/#website',
        name: SITE_NAME,
        url: SITE_URL + '/',
        inLanguage: 'es-MX',
        publisher: { '@id': SITE_URL + '/#organization' },
      },
      {
        '@type': 'AutomotiveBusiness',
        '@id': SITE_URL + '/#marketplace',
        name: SITE_NAME,
        url: SITE_URL + '/',
        image: SITE_URL + '/assets/og-cover.jpg',
        sameAs: [YOUTUBE_CHANNEL_URL, YOUTUBE_ALIAS_URL],
        areaServed: {
          '@type': 'Country',
          name: 'Mexico',
        },
        description: 'Marketplace mexicano de autos usados con inventario verificado, publicacion asistida por IA y contacto por WhatsApp.',
      },
    ],
  };
}

function dropUndefined(value) {
  if (Array.isArray(value)) return value.map(dropUndefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, dropUndefined(v)])
  );
}

async function fetchPublicListings(limit = 300) {
  if (!SUPABASE_URL || !PUBLIC_ANON_KEY) return [];
  const url = `${SUPABASE_URL}/rest/v1/public_listings?select=*&order=created_at.desc&limit=${Number(limit) || 300}`;
  const res = await fetch(url, {
    headers: {
      apikey: PUBLIC_ANON_KEY,
      Authorization: `Bearer ${PUBLIC_ANON_KEY}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Supabase public_listings HTTP ${res.status}`);
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : []).filter((row) => row && row.id).map(normalizeListing);
}

async function fetchPublicListing(id) {
  const cleanId = cleanText(id);
  if (!cleanId || !SUPABASE_URL || !PUBLIC_ANON_KEY) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId)) return null;
  const url = `${SUPABASE_URL}/rest/v1/public_listings?id=eq.${encodeURIComponent(cleanId)}&select=*&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: PUBLIC_ANON_KEY,
      Authorization: `Bearer ${PUBLIC_ANON_KEY}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Supabase public_listing HTTP ${res.status}`);
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? normalizeListing(rows[0]) : null;
}

module.exports = {
  SITE_NAME,
  SITE_URL,
  PUBLISH_URL,
  SELLER_GUIDE_URL,
  SELLER_INTENTS_URL,
  SELLER_INTENT_PAGES,
  SELLER_RECOMMENDATION_URL,
  SELLER_RESOURCES_URL,
  SELLER_RESOURCE_PAGES,
  YOUTUBE_ALIAS_URL,
  YOUTUBE_CHANNEL_URL,
  YOUTUBE_FEED_URL,
  YOUTUBE_KNOWLEDGE_URL,
  absoluteUrl,
  cleanText,
  fetchPublicListing,
  fetchPublicListings,
  headers,
  html,
  listingDescription,
  listingJsonLd,
  listingUrl,
  money,
  response,
  sellerIntentForSlug,
  sellerIntentUrl,
  sellerResourceForSlug,
  sellerResourceUrl,
  siteJsonLd,
  xml,
};
