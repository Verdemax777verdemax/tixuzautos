// ============================================================
// veredicto.cjs - regla pura de precio contra agg_modelo_referencia
// Sin LLM, sin costo por anuncio.
// ============================================================

const { sb } = require('./_shared');

const CACHE_MS = 5 * 60 * 1000;
let refCache = { at: 0, rows: [] };

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const n = Number(String(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pick(row, keys) {
  for (const key of keys) {
    if (row && row[key] !== null && row[key] !== undefined && row[key] !== '') return row[key];
  }
  return null;
}

function money(n) {
  const value = toNumber(n);
  return value ? `$${Math.round(value).toLocaleString('es-MX')}` : '';
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try { return JSON.parse(trimmed); } catch (_) {}
  }
  return value;
}

function listFromValue(value) {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) return parsed.map(v => String(v || '').trim()).filter(Boolean);
  if (parsed && typeof parsed === 'object') return Object.values(parsed).map(v => String(v || '').trim()).filter(Boolean);
  return String(parsed || '')
    .split(/\n|;|\|/)
    .map(v => v.trim())
    .filter(Boolean);
}

function percent(delta, base) {
  if (!delta || !base) return 0;
  return Math.round(Math.abs(delta / base) * 100);
}

async function loadReferences(force = false) {
  if (!force && refCache.rows.length && Date.now() - refCache.at < CACHE_MS) return refCache.rows;
  const res = await sb('agg_modelo_referencia?select=*&limit=500');
  if (!res.ok || !Array.isArray(res.data)) {
    console.warn('veredicto refs failed', res.status, res.data);
    return refCache.rows || [];
  }
  refCache = { at: Date.now(), rows: res.data };
  return refCache.rows;
}

function rowMarca(row) {
  return pick(row, ['marca', 'make', 'brand', 'fabricante']);
}

function rowModelo(row) {
  return pick(row, ['modelo', 'model', 'nombre_modelo', 'modelo_referencia', 'name']);
}

function rowYearMin(row) {
  return toNumber(pick(row, ['anio_min', 'anio_inicio', 'year_min', 'year_from', 'desde', 'min_anio']))
    || toNumber(pick(row, ['anio', 'year', 'model_year']));
}

function rowYearMax(row) {
  return toNumber(pick(row, ['anio_max', 'anio_fin', 'year_max', 'year_to', 'hasta', 'max_anio']))
    || toNumber(pick(row, ['anio', 'year', 'model_year']));
}

function rowPriceRange(row) {
  const byYear = parseMaybeJson(row?.precios_por_anio || row?.prices_by_year || row?.rangos_por_anio);
  const fromYearMap = priceRangeFromYearMap(byYear, row?.__target_anio);
  if (fromYearMap) return fromYearMap;

  let min = toNumber(pick(row, [
    'precio_min', 'precio_bajo', 'rango_min', 'min_price', 'price_min',
    'precio_mercado_min', 'valor_min', 'min'
  ]));
  let max = toNumber(pick(row, [
    'precio_max', 'precio_alto', 'rango_max', 'max_price', 'price_max',
    'precio_mercado_max', 'valor_max', 'max'
  ]));
  const avg = toNumber(pick(row, [
    'precio_promedio', 'precio_medio', 'precio_ref', 'precio_referencia',
    'avg_price', 'market_price', 'valor_mercado', 'promedio'
  ]));
  if ((!min || !max) && avg) {
    min = min || Math.round(avg * 0.9);
    max = max || Math.round(avg * 1.1);
  }
  if (min && max && min > max) [min, max] = [max, min];
  return min && max ? { min, max } : null;
}

function priceRangeFromAny(value) {
  const parsed = parseMaybeJson(value);
  if (!parsed) return null;
  if (Array.isArray(parsed)) {
    if (parsed.length >= 2 && (toNumber(parsed[0]) || toNumber(parsed[1]))) {
      const nums = parsed.map(toNumber).filter(Boolean).sort((a, b) => a - b);
      return nums.length >= 2 ? { min: nums[0], max: nums[nums.length - 1] } : null;
    }
    for (const item of parsed) {
      const range = priceRangeFromAny(item);
      if (range) return range;
    }
  }
  if (parsed && typeof parsed === 'object') {
    const direct = rowPriceRange(parsed);
    if (direct) return direct;
    const nums = Object.values(parsed).map(toNumber).filter(Boolean).sort((a, b) => a - b);
    if (nums.length >= 2) return { min: nums[0], max: nums[nums.length - 1] };
  }
  const nums = String(parsed).match(/\d[\d,.]{4,}/g)?.map(toNumber).filter(Boolean).sort((a, b) => a - b) || [];
  return nums.length >= 2 ? { min: nums[0], max: nums[nums.length - 1] } : null;
}

function priceRangeFromYearMap(value, anio) {
  const parsed = parseMaybeJson(value);
  if (!parsed) return null;
  if (Array.isArray(parsed)) {
    const y = toNumber(anio);
    const withYear = parsed
      .map(item => ({ item, y: toNumber(item?.anio || item?.year || item?.modelo_anio || item?.model_year) }))
      .filter(x => x.item);
    if (withYear.length) {
      const picked = withYear.sort((a, b) => Math.abs((a.y || y || 0) - (y || 0)) - Math.abs((b.y || y || 0) - (y || 0)))[0]?.item;
      return priceRangeFromAny(picked);
    }
    return priceRangeFromAny(parsed);
  }
  if (parsed && typeof parsed === 'object') {
    const keys = Object.keys(parsed);
    const y = toNumber(anio);
    const yearKeys = keys.filter(k => /^(19|20)\d{2}$/.test(String(k)));
    if (yearKeys.length) {
      const pickedKey = y && parsed[String(y)] !== undefined
        ? String(y)
        : yearKeys.sort((a, b) => Math.abs(Number(a) - (y || Number(a))) - Math.abs(Number(b) - (y || Number(b))))[0];
      return priceRangeFromAny(parsed[pickedKey]);
    }
    return priceRangeFromAny(parsed);
  }
  return priceRangeFromAny(parsed);
}

function yearScore(row, anio) {
  const y = toNumber(anio);
  if (!y) return 8;
  const min = rowYearMin(row);
  const max = rowYearMax(row);
  if (!min && !max) return 4;
  if (min && max && y >= min && y <= max) return 0;
  const nearest = [min, max].filter(Boolean).sort((a, b) => Math.abs(a - y) - Math.abs(b - y))[0];
  return nearest ? Math.abs(nearest - y) : 6;
}

function findReference(rows, marca, modelo, anio) {
  const m = norm(marca);
  const mo = norm(modelo);
  if (!mo) return null;

  const matches = rows
    .map(row => {
      const rm = norm(rowMarca(row));
      const rmo = norm(rowModelo(row));
      if (!rmo) return null;
      const makeOk = !m || !rm || rm === m || rm.includes(m) || m.includes(rm);
      const modelOk = rmo === mo || rmo.includes(mo) || mo.includes(rmo);
      if (!makeOk || !modelOk) return null;
      return { row, score: yearScore(row, anio) + Math.abs(rmo.length - mo.length) / 100 };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score);

  const picked = matches[0]?.row || null;
  return picked ? { ...picked, __target_anio: anio } : null;
}

function buildAlerts(label, precio, range, ref) {
  const fromRef = [
    ...listFromValue(ref?.alertas),
    ...listFromValue(ref?.que_revisar)
  ].slice(0, 2);
  if (fromRef.length) return fromRef;

  if (label === 'Buen precio') {
    return [
      'Precio atractivo: confirma factura, adeudos y motivo de venta.',
      'Revisa que el kilometraje y las fotos coincidan con el estado real.'
    ];
  }
  if (label === 'Arriba de mercado') {
    return [
      'Precio alto: pide evidencia de version, mantenimiento o extras.',
      'Compara contra unidades similares antes de apartar.'
    ];
  }
  return [
    'Precio dentro de mercado: aun valida documentos y disponibilidad.',
    'Agenda revision mecanica antes de cerrar trato.'
  ];
}

function buildQuestions(label, ref) {
  const fromRef = listFromValue(ref?.que_preguntar).slice(0, 2);
  if (fromRef.length) return fromRef;

  if (label === 'Buen precio') {
    return [
      'Por que esta por debajo del rango y que detalles debo revisar?',
      'Puedes mandar NIV/VIN, factura, adeudos y foto del odometro?'
    ];
  }
  if (label === 'Arriba de mercado') {
    return [
      'Que justifica el precio: version, historial, servicios o extras?',
      'Aceptas negociar contra comparables del mismo ano y kilometraje?'
    ];
  }
  return [
    'El precio incluye adeudos, verificacion y cambio de propietario?',
    'Puedes compartir factura, NIV/VIN y servicios recientes?'
  ];
}

async function getVeredicto(marca, modelo, anio, precio, opts = {}) {
  const p = toNumber(precio);
  if (!p) return null;

  const rows = opts.rows || await loadReferences();
  const ref = findReference(rows, marca, modelo, anio);
  const range = ref ? rowPriceRange(ref) : null;
  if (!range) return null;

  let badge = 'En mercado';
  let nivel = 'mercado';
  let mensaje = `Dentro del rango ${money(range.min)}-${money(range.max)}.`;

  if (p < range.min) {
    badge = 'Buen precio';
    nivel = 'bueno';
    mensaje = `\u2248${percent(range.min - p, range.min)}% abajo del rango ${money(range.min)}-${money(range.max)}.`;
  } else if (p > range.max) {
    badge = 'Arriba de mercado';
    nivel = 'alto';
    mensaje = `\u2248${percent(p - range.max, range.max)}% arriba del rango ${money(range.min)}-${money(range.max)}.`;
  }

  return {
    badge,
    nivel,
    mensaje,
    senales: buildAlerts(badge, p, range, ref).slice(0, 2),
    preguntas: buildQuestions(badge, ref).slice(0, 2),
    referencia: {
      marca: rowMarca(ref) || marca || '',
      modelo: rowModelo(ref) || modelo || '',
      anio_min: rowYearMin(ref),
      anio_max: rowYearMax(ref),
      precio_min: range.min,
      precio_max: range.max
    }
  };
}

async function attachVeredictos(cars) {
  const list = Array.isArray(cars) ? cars : [];
  if (!list.length) return list;
  let rows = [];
  try {
    rows = await loadReferences();
  } catch (err) {
    console.warn('veredicto load failed', err.message);
    return list;
  }
  return Promise.all(list.map(async car => ({
    ...car,
    veredicto: await getVeredicto(car.marca, car.modelo, car.anio, car.precio, { rows }).catch(() => null)
  })));
}

module.exports = {
  getVeredicto,
  attachVeredictos,
  loadReferences,
  findReference,
  rowPriceRange
};
