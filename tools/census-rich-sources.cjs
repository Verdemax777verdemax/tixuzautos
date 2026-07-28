const UA = 'TixuzBot/1.0 (+https://tixuzautos.com/bot; contacto: bot@tixuzautos.com)';

const SOURCES = [
  { name: 'Das WeltAuto', base: 'https://www.dasweltauto.com.mx' },
  { name: 'Toyota Como Nuevos', base: 'https://comonuevos.toyota.com.mx' },
  { name: 'Carmudi Mexico', base: 'https://www.carmudi.com.mx' },
  {
    name: 'ClikAuto',
    base: 'https://clikauto.com',
    listing: 'https://clikauto.com/auto-seminuevo/toyota-corolla-2018/30283/vdpagencia/82'
  },
  { name: 'Odetta', base: 'https://odetta.com' },
  {
    name: 'Dalton Seminuevos',
    base: 'https://www.daltonseminuevos.com.mx',
    listing: 'https://www.daltonseminuevos.com.mx/autos/honda-hr-v-seminuevo-2025-90841'
  },
  { name: 'Grupo Plasencia Seminuevos', base: 'https://seminuevos.grupoplasencia.com' }
];

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, done: () => clearTimeout(timer) };
}

async function request(url, accept = 'text/html,*/*') {
  const { controller, done } = withTimeout(20000);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: accept }
    });
    return { status: response.status, url: response.url || url, text: await response.text() };
  } finally {
    done();
  }
}

function robotsRules(text) {
  const groups = [];
  let current = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      current = { agent: value.toLowerCase(), allow: [], disallow: [] };
      groups.push(current);
    } else if ((key === 'allow' || key === 'disallow') && current) {
      current[key].push(value);
    }
  }
  return groups.filter(group => group.agent === '*' || group.agent === 'tixuzbot');
}

function robotsAllows(groups, targetUrl) {
  if (!groups.length) return true;
  const path = new URL(targetUrl).pathname || '/';
  const rules = groups.flatMap(group => [
    ...group.allow.filter(Boolean).map(value => ({ kind: 'allow', value })),
    ...group.disallow.filter(Boolean).map(value => ({ kind: 'disallow', value }))
  ]).filter(rule => path.startsWith(rule.value)).sort((a, b) => b.value.length - a.value.length);
  return !rules.length || rules[0].kind === 'allow';
}

function jsonLdSummary(html) {
  const blocks = [];
  const types = new Set();
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of String(html || '').matchAll(re)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      blocks.push(parsed);
      const stack = [parsed];
      while (stack.length) {
        const value = stack.pop();
        if (!value || typeof value !== 'object') continue;
        if (Array.isArray(value)) {
          stack.push(...value);
          continue;
        }
        const rawTypes = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
        rawTypes.filter(Boolean).forEach(type => types.add(String(type)));
        stack.push(...Object.values(value).filter(child => child && typeof child === 'object'));
      }
    } catch (_) {
      // Presence is counted only for valid JSON-LD.
    }
  }
  return { blocks: blocks.length, types: [...types].sort(), vehicle: types.has('Car') || types.has('Vehicle') };
}

function listingCandidates(base, html) {
  const baseUrl = new URL(base);
  const seen = new Set();
  const out = [];
  for (const match of String(html || '').matchAll(/href=["']([^"']+)["']/gi)) {
    try {
      const url = new URL(match[1], base);
      if (url.hostname !== baseUrl.hostname || seen.has(url.href)) continue;
      const value = decodeURIComponent(url.pathname + url.search);
      if (!/(auto|vehiculo|seminuevo|inventario|unidad)/i.test(value)) continue;
      if (!/\b(19|20)\d{2}\b/.test(value) && !/\d{4,}/.test(value)) continue;
      seen.add(url.href);
      out.push(url.href);
    } catch (_) {}
  }
  return out;
}

async function inspect(source) {
  const result = {
    source: source.name,
    base_url: source.base,
    robots_url: `${source.base}/robots.txt`,
    robots_status: null,
    robots_allows_listing: false,
    listing_url: source.listing || null,
    listing_status: null,
    listing_final_url: null,
    jsonld_blocks: 0,
    jsonld_types: [],
    jsonld_vehicle: false,
    verdict: 'BLOQUEADO',
    reason: null
  };
  let robots;
  let home;
  try {
    robots = await request(result.robots_url, 'text/plain,*/*');
    result.robots_status = robots.status;
  } catch (error) {
    result.reason = `robots_request:${error.cause?.code || error.message}`;
  }
  try {
    home = await request(source.base);
  } catch (error) {
    result.reason = `home_request:${error.cause?.code || error.message}`;
    return result;
  }
  if (!result.listing_url) {
    const candidates = listingCandidates(source.base, home.text);
    result.listing_url = candidates[0] || null;
    result.candidate_count = candidates.length;
  }
  if (!result.listing_url) {
    result.reason = home.url !== `${source.base}/` && !home.url.startsWith(source.base)
      ? `redirected_outside:${home.url}`
      : 'no_individual_listing_found';
    return result;
  }
  const groups = robots?.status === 200 ? robotsRules(robots.text) : [];
  result.robots_allows_listing = robotsAllows(groups, result.listing_url);
  if (!result.robots_allows_listing) {
    result.reason = 'robots_disallow_listing';
    return result;
  }
  try {
    const listing = await request(result.listing_url);
    result.listing_status = listing.status;
    result.listing_final_url = listing.url;
    const jsonld = jsonLdSummary(listing.text);
    result.jsonld_blocks = jsonld.blocks;
    result.jsonld_types = jsonld.types;
    result.jsonld_vehicle = jsonld.vehicle;
    const stayedOnSource = new URL(listing.url).hostname.endsWith(new URL(source.base).hostname.replace(/^www\./, ''));
    if (listing.status === 200 && stayedOnSource && listing.text.length > 5000) {
      result.verdict = 'VIABLE';
      result.reason = jsonld.vehicle ? 'listing_accessible_with_vehicle_jsonld' : 'listing_accessible_without_vehicle_jsonld';
    } else {
      result.reason = `listing_http_${listing.status}${stayedOnSource ? '' : '_redirected_outside'}`;
    }
  } catch (error) {
    result.reason = `listing_request:${error.cause?.code || error.message}`;
  }
  return result;
}

(async () => {
  const results = [];
  for (const source of SOURCES) results.push(await inspect(source));
  console.log(JSON.stringify({ checked_at: new Date().toISOString(), results }, null, 2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
