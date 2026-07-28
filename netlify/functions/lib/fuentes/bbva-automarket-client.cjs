const { createHmac } = require('node:crypto');

const BASE_URL = 'https://automarket.bbva.mx';
const nativeFetch = global.fetch.bind(global);

function env(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || '';
}

function automarketIdFromUrl(value) {
  try {
    const url = new URL(value, BASE_URL);
    if (url.hostname !== 'automarket.bbva.mx') return null;
    return url.pathname.split('/').filter(Boolean).pop()?.replace(/\.html$/i, '') || null;
  } catch (_) {
    return null;
  }
}

function isAutomarketVehicleUrl(value) {
  try {
    const url = new URL(value, BASE_URL);
    return url.hostname === 'automarket.bbva.mx'
      && /-[a-z0-9]+-[a-z0-9]+\.html$/i.test(url.pathname)
      && !url.pathname.startsWith('/seminuevos/');
  } catch (_) {
    return false;
  }
}

function ingestToken() {
  const secret = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SERVICE_KEY');
  if (!secret) throw new Error('missing_SUPABASE_SERVICE_ROLE_KEY');
  return createHmac('sha256', secret).update('tixuz-bbva-automarket-v1').digest('hex');
}

async function discover(marca, modelo, ciudad = '', options = {}) {
  const siteUrl = env('SITE_URL') || 'https://tixuzautos.com';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 70000);
  try {
    const endpoint = `${siteUrl.replace(/\/$/, '')}/.netlify/functions/bbva-automarket-discover`;
    const requestBody = JSON.stringify({
      marca,
      modelo,
      ciudad,
      limit: Math.min(Math.max(Number(options.limit) || 2, 1), 5)
    });
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const response = await nativeFetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-tixuz-automarket-token': ingestToken()
        },
        body: requestBody
      });
      const text = await response.text();
      let payload;
      try { payload = text ? JSON.parse(text) : {}; } catch (_) { payload = { error: text }; }
      if (response.ok) return Array.isArray(payload.cars) ? payload.cars : [];
      lastError = new Error(`automarket_headless_${response.status}:${payload.error || 'unknown'}`);
      if (![502, 504].includes(response.status) || attempt === 2) throw lastError;
    }
    throw lastError || new Error('automarket_headless_unknown');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { automarketIdFromUrl, discover, isAutomarketVehicleUrl };
