const { sb } = require('../netlify/functions/_shared');

const checkedAt = '2026-07-15T00:16:21.201Z';
const records = [
  {
    source_name: 'Das WeltAuto',
    base_url: 'https://www.dasweltauto.com.mx',
    status: 'blocked',
    method: 'census_dns',
    trust_score: 0,
    verdict: 'BLOQUEADO',
    detail: 'DNS no resuelve (EAI_AGAIN); robots y ficha no accesibles.'
  },
  {
    source_name: 'Toyota Como Nuevos',
    base_url: 'https://comonuevos.toyota.com.mx',
    status: 'blocked',
    method: 'census_dns',
    trust_score: 0,
    verdict: 'BLOQUEADO',
    detail: 'DNS no resuelve (ENOTFOUND); robots y ficha no accesibles.'
  },
  {
    source_name: 'Carmudi Mexico',
    base_url: 'https://www.carmudi.com.mx',
    status: 'blocked',
    method: 'census_dns',
    trust_score: 0,
    verdict: 'BLOQUEADO',
    detail: 'DNS no resuelve (ENOTFOUND); robots y ficha no accesibles.'
  },
  {
    source_name: 'ClikAuto',
    base_url: 'https://clikauto.com',
    status: 'active',
    method: 'html_no_vehicle_jsonld',
    trust_score: 70,
    verdict: 'VIABLE',
    detail: 'robots 200 permite ficha; ficha HTTP 200; JSON-LD valido solo BreadcrumbList/ListItem, sin Car/Vehicle.'
  },
  {
    source_name: 'Odetta',
    base_url: 'https://odetta.com',
    status: 'blocked',
    method: 'census_redirected_domain',
    trust_score: 0,
    verdict: 'BLOQUEADO',
    detail: 'robots 404; dominio redirige a atom.com/name/Odetta y termina en 403; sin inventario.'
  },
  {
    source_name: 'Dalton Seminuevos',
    base_url: 'https://www.daltonseminuevos.com.mx',
    status: 'active',
    method: 'html_no_vehicle_jsonld',
    trust_score: 75,
    verdict: 'VIABLE',
    detail: 'robots 200 permite ficha; ficha HTTP 200 con datos ricos; sin JSON-LD valido.'
  },
  {
    source_name: 'Grupo Plasencia Seminuevos',
    base_url: 'https://seminuevos.grupoplasencia.com',
    status: 'blocked',
    method: 'census_no_individual_url',
    trust_score: 30,
    verdict: 'BLOQUEADO',
    detail: 'robots 200 y portada 200, pero no expone URL de ficha individual verificable; imagenes declaradas ilustrativas.'
  }
];

function key(value) {
  return String(value || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
}

(async () => {
  const registry = await sb('agg_source_registry?select=id,source_name');
  if (!registry.ok) throw new Error(`registry_${registry.status}`);
  const existing = new Map((registry.data || []).map(row => [key(row.source_name), row]));
  const result = [];
  for (const record of records) {
    const now = new Date().toISOString();
    const body = {
      source_name: record.source_name,
      name: record.source_name,
      label: record.source_name,
      source_type: 'crawler',
      base_url: record.base_url,
      method: record.method,
      status: record.status,
      trust_score: record.trust_score,
      notes: `CENSO ${checkedAt}: ${record.verdict}. ${record.detail}`,
      last_success_at: record.status === 'active' ? checkedAt : null,
      last_error: record.status === 'active' ? null : record.detail,
      updated_at: now
    };
    const row = existing.get(key(record.source_name));
    const response = row
      ? await sb(`agg_source_registry?id=eq.${encodeURIComponent(row.id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body)
      })
      : await sb('agg_source_registry', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body)
      });
    if (!response.ok) throw new Error(`${record.source_name}_${response.status}:${JSON.stringify(response.data).slice(0, 220)}`);
    result.push({ source: record.source_name, verdict: record.verdict, status: record.status, operation: row ? 'updated' : 'inserted' });
  }
  const ml = existing.get(key('MercadoLibre Autos'));
  if (ml) {
    const detail = 'OAuth valido (/users/me 200), pero /sites/MLM/search y /items/{id} responden 403 forbidden con el token vigente.';
    const response = await sb(`agg_source_registry?id=eq.${encodeURIComponent(ml.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        method: 'official_oauth_api_403',
        status: 'needs_unlocker',
        notes: `BLOQUE ML ${checkedAt}: BLOQUEADO. ${detail}`,
        last_error: detail,
        updated_at: new Date().toISOString()
      })
    });
    if (!response.ok) throw new Error(`MercadoLibre_${response.status}`);
  }
  console.log(JSON.stringify(result, null, 2));
})().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
