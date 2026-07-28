const PUBLIC_FIELDS = [
  'id',
  'make',
  'model',
  'year',
  'price',
  'mileage',
  'transmission',
  'fuel_type',
  'color',
  'location',
  'description',
  'images',
  'seller_name',
  'seller_type',
  'plan',
  'featured',
  'status',
  'verification_badge',
  'created_at',
  'updated_at',
  'tixuz_note_status',
  'tixuz_note_pros',
  'tixuz_note_watch',
];

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async function () {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return json(500, { ok: false, listings: [], error: 'Faltan variables privadas de Supabase.' });
  }

  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/marketplace_listings?select=${PUBLIC_FIELDS.join(',')}&status=eq.active&order=created_at.desc&limit=300`;
  const res = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return json(502, { ok: false, listings: [], error: `Supabase HTTP ${res.status}`, detail: detail.slice(0, 200) });
  }

  const rows = await res.json();
  return json(200, { ok: true, count: Array.isArray(rows) ? rows.length : 0, listings: Array.isArray(rows) ? rows : [] });
};
