const fs = require('node:fs');
const path = require('node:path');

const SUPABASE_URL = 'https://rbiuoljoduekajivffzh.supabase.co';
const OFFICIAL_CHANNEL_ID = 'UCx-BX1_MDzK1v3qRvsHBOTg';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!serviceKey) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY o SUPABASE_SERVICE_KEY');

const assignments = {
  'chevrolet-aveo': 'emF8Ccu4ACQ',
  'chevrolet-beat': 'dn78Nhiiy24',
  'chevrolet-onix': 'dn78Nhiiy24',
  'chevrolet-spark': 'F-A1N41Axag',
  'chevrolet-suburban': 'dn78Nhiiy24',
  'chevrolet-tracker': 'dn78Nhiiy24',
  'chevrolet-trax': 'dn78Nhiiy24',
  'honda-accord': '3-4dRcXnvMk',
  'honda-city': 'gubSjioOfDg',
  'honda-civic': 'xM-45XzFac4',
  'honda-cr-v': 'e5YkykxE7UM',
  'honda-hr-v': 'gubSjioOfDg',
  'honda-pilot': 'gubSjioOfDg',
  'hyundai-creta': 'u4Hj3qKhhw0',
  'kia-sportage': 't18L1VU4jxs',
  'mazda-3': 'webpk9FnmZc',
  'mazda-cx-5': 'EJTDO9RseNE',
  'nissan-kicks': 'bneJw3WuvXU',
  'nissan-march': 'bneJw3WuvXU',
  'nissan-versa': 'bneJw3WuvXU',
  'nissan-x-trail': 'bneJw3WuvXU',
  'renault-duster': 'mXTDiaK7BgU',
  'renault-kwid': 'lPrD1hk3ifY',
  'seat-ibiza': 'i849ev1wuhs',
  'suzuki-swift': 'i849ev1wuhs',
  'toyota-corolla': 'tMg44vcqP8Y',
  'toyota-hilux': 'jweXNVr_RsA',
  'toyota-rav4': 'tMg44vcqP8Y',
  'toyota-yaris': 'tMg44vcqP8Y',
  'volkswagen-golf': 'Yf0XoDwOHW8',
};

const catalogPath = path.join(__dirname, '..', 'youtube-library-output', 'catalog', 'videos.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
if (catalog.channel_id !== OFFICIAL_CHANNEL_ID) {
  throw new Error(`Catálogo no oficial: ${catalog.channel_id || '(sin channel_id)'}`);
}

const byId = new Map(catalog.videos.map((video) => [video.id, video]));
const rows = Object.entries(assignments).map(([slug, youtube_id]) => {
  const video = byId.get(youtube_id);
  if (!video?.title) throw new Error(`Video ${youtube_id} no está en el catálogo oficial`);
  return { slug, youtube_id, titulo: video.title };
});

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

async function request(pathname, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${body}`);
  return body ? JSON.parse(body) : null;
}

async function main() {
  const before = await request('videos_modelo?select=slug,youtube_id,titulo');
  const upserted = await request('videos_modelo?on_conflict=slug', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(rows),
  });
  const slugs = rows.map((row) => row.slug).join(',');
  const verified = await request(`videos_modelo?select=slug,youtube_id,titulo&slug=in.(${slugs})&order=slug.asc`);
  const mismatch = verified.filter((row) => assignments[row.slug] !== row.youtube_id);
  if (verified.length !== rows.length || mismatch.length) {
    throw new Error(`Verificación falló: esperadas=${rows.length}, encontradas=${verified.length}, mismatch=${mismatch.length}`);
  }
  console.log(JSON.stringify({
    official_channel_id: OFFICIAL_CHANNEL_ID,
    before_rows: before.length,
    requested_rows: rows.length,
    upserted_rows: upserted.length,
    verified_rows: verified.length,
    priority: verified.filter((row) => [
      'chevrolet-tracker', 'chevrolet-trax', 'chevrolet-onix', 'renault-kwid',
      'nissan-versa', 'chevrolet-spark', 'chevrolet-aveo', 'suzuki-swift',
      'toyota-corolla', 'honda-cr-v', 'mazda-cx-5',
    ].includes(row.slug)),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
