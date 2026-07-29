// Snapshot de /autos/sitemap-modelos.xml (76 paginas de modelo vivas al 2026-07-29).
// Enlaza fichas -> pagina de modelo SOLO cuando la pagina existe (evita enlaces rotos).
// Si el sitemap de modelos crece, actualizar esta lista en el siguiente deploy.
const MODEL_SLUGS = new Set([
  'chevrolet-tracker',
  'chevrolet-trax',
  'renault-kwid',
  'chevrolet-onix',
  'honda-hr-v',
  'volkswagen-taos',
  'chevrolet-aveo',
  'volkswagen-jetta',
  'mazda-mazda-3',
  'toyota-rav4',
  'suzuki-swift',
  'seat-ibiza',
  'jeep-compass',
  'nissan-x-trail',
  'nissan-march',
  'toyota-hilux',
  'hyundai-creta',
  'honda-civic',
  'toyota-yaris',
  'volkswagen-vento',
  'nissan-versa',
  'toyota-corolla',
  'mazda-cx-5',
  'volkswagen-t-cross',
  'chevrolet-spark',
  'kia-rio',
  'kia-seltos',
  'volkswagen-gol',
  'honda-accord',
  'volkswagen-golf',
  'volkswagen-polo',
  'nissan-sentra',
  'jeep-renegade',
  'kia-forte',
  'nissan-kicks',
  'hyundai-elantra',
  'volkswagen-tiguan',
  'cadillac-escalade',
  'mg-zs',
  'honda-cr-v',
  'nissan-altima',
  'hyundai-grand-i10',
  'mazda-cx-30',
  'jac-j7',
  'chevrolet-beat',
  'mitsubishi-l200',
  'kia-sportage',
  'byd-dolphin',
  'chirey-tiggo',
  'renault-duster',
  'hyundai-tucson',
  'toyota-camry',
  'nissan-tsuru',
  'volkswagen-virtus',
  'ford-ranger',
  'ford-fiesta',
  'honda-city',
  'ford-figo',
  'mg-mg-5',
  'nissan-np300',
  'jac-sei7',
  'dodge-ram',
  'nissan-urvan',
  'cadillac-xt5',
  'mg-mg-3',
  'audi-a3',
  'cadillac-cts',
  'volkswagen-gti',
  'renault-kangoo',
  'jac-sei6',
  'nissan-v-drive',
  'volkswagen-taigun',
  'nissan-frontier',
  'kia-niro',
  'audi-a1',
  'volkswagen-transporter',
]);

// Misma regla de slug que generar-paginas-modelo.cjs y la Edge Function "modelo".
const slugify = (text) => String(text ?? '')
  .toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, '-')
  .replace(/[^\w\-]+/g, '')
  .replace(/\-\-+/g, '-')
  .replace(/^-+|-+$/g, '');

function modelPageSlug(make, model) {
  const slug = slugify(`${make || ''} ${model || ''}`.trim());
  return MODEL_SLUGS.has(slug) ? slug : null;
}

module.exports = { MODEL_SLUGS, slugify, modelPageSlug };
