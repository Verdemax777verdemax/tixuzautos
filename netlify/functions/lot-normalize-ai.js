// Tixuz Autos · normalizador AI para inventarios de lotes.
// Si no hay OPENAI_API_KEY configurada, el frontend cae al normalizador local.

const OPENAI_API = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

function respond(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}
function env(name) { return process.env[name] || ''; }
function safeString(v, max = 60000) { return String(v ?? '').slice(0, max); }
function parseJson(text) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  throw new Error('La IA no devolvió JSON válido');
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return respond(200, { ok: true });
  if (event.httpMethod !== 'POST') return respond(405, { ok: false, error: 'Method Not Allowed' });

  const apiKey = env('OPENAI_API_KEY');
  if (!apiKey) return respond(503, { ok: false, error: 'AI no configurada. Falta OPENAI_API_KEY.' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return respond(400, { ok: false, error: 'JSON inválido' }); }
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 80) : [];
  const text = safeString(body.text || '');
  const lot = body.lot || {};
  if (!rows.length && !text.trim()) return respond(400, { ok: false, error: 'No hay inventario para normalizar.' });

  const prompt = `Convierte inventario de autos de un lote mexicano a JSON.

Reglas:
- No inventes marca, modelo, año ni precio. Si falta, deja campo vacío o 0.
- Mantén hasta 80 autos.
- Extrae URLs de fotos si existen.
- Si una fila viene como texto libre, separa marca, modelo, año, precio, km, transmisión, combustible, color, ciudad y descripción.
- Devuelve SOLO JSON válido con forma:
{"listings":[{"make":"","model":"","year":0,"price":0,"mileage":0,"transmission":"","fuel_type":"","color":"","location":"","description":"","images":[],"source_url":""}]}

Lote: ${safeString(JSON.stringify(lot), 1000)}
Filas estructuradas: ${safeString(JSON.stringify(rows), 50000)}
Texto pegado: ${safeString(text, 20000)}`;

  try {
    const res = await fetch(OPENAI_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env('OPENAI_LOT_MODEL') || MODEL,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Eres un normalizador de inventario automotriz. Devuelve solo JSON válido.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    const data = await res.json().catch(async () => ({ error: await res.text() }));
    if (!res.ok) return respond(502, { ok: false, error: data.error.message || data.error || `OpenAI HTTP ${res.status}` });
    const content = data.choices?.[0].message.content || '';
    const parsed = parseJson(content);
    const listings = Array.isArray(parsed.listings) ? parsed.listings.slice(0, 80) : [];
    return respond(200, { ok: true, listings, provider: 'openai' });
  } catch (err) {
    return respond(500, { ok: false, error: err.message || 'No pude normalizar con IA' });
  }
};
