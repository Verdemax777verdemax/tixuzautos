// ── CONFIG ──
const SB_URL='https://rbiuoljoduekajivffzh.supabase.co';
const SB_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJiaXVvbGpvZHVla2FqaXZmZnpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNzc4NDYsImV4cCI6MjA4Njc1Mzg0Nn0.fvKu71jVZWfSdIVcqMrhMZqUAjswzvaOgnm6-MQpaxM';
let db=null;
function getDb(){
  if(db) return db;
  if(window.supabase && window.supabase.createClient){
    db=window.supabase.createClient(SB_URL,SB_ANON);
    return db;
  }
  return null;
}
let allCars=[],step=1,uploadedImgs=[],selPlan='basic',plans=[],lotRows=[],lotFileTexts=[],adminTok=sessionStorage.getItem('ta_tok')||'';
let externalCars=[],externalPortalLinks=[],externalSearchKey='',externalLoading=false,externalError='',externalPartial=false,externalTimer=null,externalAbortController=null,externalSeq=0;
let externalZeroQuery='';
let activeDiscoveryFilter=null;
const LIVE_SEARCH_DEBOUNCE_MS=1400;
const DETAIL_CACHE=new Map();
const MAX_LISTING_PHOTOS=20;
const BASIC_PLAN={key:'basic',name:'Básico',price_mxn:0,interval_type:'one_time',active_days:30,max_photos:5,badge:'Gratis'};
const DEFAULT_PLANS=[
  BASIC_PLAN,
  {key:'featured',name:'Destacado',price_mxn:199,interval_type:'one_time',active_days:60,max_photos:20},
  {key:'pro',name:'PRO Lote',price_mxn:499,interval_type:'recurring',active_days:30,max_photos:20,lot_capacity:20,featured_slots:2}
];
// La presentación no depende todavía de la tabla remota: evita mostrar beneficios
// viejos mientras los planes de pago siguen desactivados durante el lanzamiento.
const PLAN_PRESENTATION={
  featured:{name:'Destacado',price_mxn:199,interval_type:'one_time',active_days:60,max_photos:20},
  pro:{name:'PRO Lote',price_mxn:499,interval_type:'recurring',active_days:30,max_photos:20,lot_capacity:20,featured_slots:2}
};
function withBasicPlan(list){
  const incoming=Array.isArray(list)?list.filter(p=>p&&p.key):[];
  const apiBasic=incoming.find(p=>p.key==='basic');
  const basic={...BASIC_PLAN,...(apiBasic||{}),key:'basic',name:'Básico',price_mxn:0};
  const paid=incoming.filter(p=>p.key==='featured'||p.key==='pro');
  return [basic,...paid].map(plan=>({...plan,...(PLAN_PRESENTATION[plan.key]||{})}));
}
function planIsComingSoon(p){
  // 5c (27-jul-2026): por lanzamiento solo el plan Básico gratis está activo.
  // Destacado y PRO se muestran como "Próximamente", deshabilitados.
  return Boolean(p&&p.key&&p.key!=='basic');
}
function planNameForListing(l){
  if(l&&l.payment_status==='not_required')return 'Básico';
  return ({basic:'Básico',featured:'Destacado',pro:'PRO Lote'}[l?.plan]||l?.plan||'Básico');
}
function publishButtonLabel(){return selPlan==='basic'?'Publicar gratis':'Ir a pagar';}
function updatePublishButton(){const b=document.getElementById('btnNext');if(b&&step===3)b.textContent=publishButtonLabel();}
function escJS(v){return String(v ?? '').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,' ')}
function escAttr(v){return String(v ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function escHTML(v){return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function safeWaTarget(id){return 'waR_'+String(id ?? '').replace(/[^a-zA-Z0-9_-]/g,'_')}
function comparableKey(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()}
function priceComparableSignal(car){
  const price=Number(car?.price||0);
  const make=comparableKey(car?.make),model=comparableKey(car?.model);
  const year=Number(car?.year||0),km=Number(car?.mileage||0);
  const transmission=comparableKey(car?.transmission),fuel=comparableKey(car?.fuel_type),location=comparableKey(car?.location);
  if(!price||!make||!model||!year)return '';
  const candidates=allCars.filter(other=>{
    if(!other||String(other.id)===String(car.id)||other.external)return false;
    const otherPrice=Number(other.price||0),otherYear=Number(other.year||0),otherKm=Number(other.mileage||0);
    if(!otherPrice||!otherYear||comparableKey(other.make)!==make||comparableKey(other.model)!==model)return false;
    if(Math.abs(otherYear-year)>1)return false;
    if(km&&otherKm&&(otherKm<km*.5||otherKm>km*2))return false;
    if(transmission&&comparableKey(other.transmission)&&comparableKey(other.transmission)!==transmission)return false;
    if(fuel&&comparableKey(other.fuel_type)&&comparableKey(other.fuel_type)!==fuel)return false;
    if(location&&comparableKey(other.location)&&comparableKey(other.location)!==location)return false;
    return true;
  });
  if(candidates.length<10)return '';
  let values=candidates.map(other=>Number(other.price)).sort((a,b)=>a-b);
  const quartile=q=>values[Math.floor((values.length-1)*q)];
  const q1=quartile(.25),q3=quartile(.75),iqr=q3-q1;
  if(iqr>0)values=values.filter(value=>value>=q1-1.5*iqr&&value<=q3+1.5*iqr);
  if(values.length<10)return '';
  const middle=Math.floor(values.length/2);
  const median=values.length%2?values[middle]:(values[middle-1]+values[middle])/2;
  if(!median)return '';
  const difference=Math.round((price/median-1)*100);
  const format=value=>Math.round(value).toLocaleString('es-MX');
  const direction=difference<=-3
    ?`<strong>↓ ${Math.abs(difference)}% debajo de referencia</strong>`
    :difference>=3?`<strong>↑ ${difference}% arriba de referencia</strong>`:'<strong>En línea con la referencia</strong>';
  const tone=difference<=-3?'lower':difference>=3?'higher':'';
  return `<div class="price-signal ${tone}"><strong>Precio comparativo estimado</strong><br>${direction}<small>Rango publicado: $${format(values[0])}–$${format(values.at(-1))} · ${values.length} autos similares. Comparación de anuncios publicados; no es avalúo ni garantía.</small></div>`;
}
function publicListingUrl(id){return '/autos/'+encodeURIComponent(String(id||'').trim())}
const ATTRIBUTION_KEY='tixuz_attribution_v1';
function makeSessionId(){
  try{if(window.crypto?.randomUUID)return window.crypto.randomUUID();}catch(e){}
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;
}
function trackingContext(){
  const keys=['utm_source','utm_medium','utm_campaign','utm_content'];
  let saved={};
  try{saved=JSON.parse(sessionStorage.getItem(ATTRIBUTION_KEY)||'{}')||{};}catch(e){}
  const params=new URLSearchParams(location.search);
  keys.forEach(key=>{
    const value=(params.get(key)||'').trim();
    if(value)saved[key]=value.slice(0,180);
  });
  const requestedSession=(params.get('session_id')||'').trim();
  saved.session_id=(requestedSession||saved.session_id||makeSessionId()).slice(0,120);
  try{sessionStorage.setItem(ATTRIBUTION_KEY,JSON.stringify(saved));}catch(e){}
  return {
    utm_source:saved.utm_source||'',
    utm_medium:saved.utm_medium||'',
    utm_campaign:saved.utm_campaign||'',
    utm_content:saved.utm_content||'',
    session_id:saved.session_id,
    referrer:document.referrer||''
  };
}
function trackedClickoutUrl(car){
  const destination=String(car?.source_url||'').trim();
  if(!destination)return String(car?.clickout_url||'').trim();
  const params=new URLSearchParams({
    to:destination,
    source:String(car?.source||'Portal externo'),
    q:(document.getElementById('fQ')?.value||'').trim(),
    src:'listing_card',
    listing_id:String(car?.id||'')
  });
  Object.entries(trackingContext()).forEach(([key,value])=>{if(value)params.set(key,value)});
  return '/api/ir?'+params.toString();
}
function formatListingDate(value){
  const date=value?new Date(value):null;
  if(!date||Number.isNaN(date.getTime()))return '';
  return new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',year:'numeric',timeZone:'America/Mexico_City'}).format(date);
}
function mexicoDay(value){
  const date=value?new Date(value):null;
  if(!date||Number.isNaN(date.getTime()))return '';
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City'}).format(date);
}
function listingPublicationLabel(car){
  const date=formatListingDate(car?.published_at||car?.created_at);
  if(!date)return 'Fecha de publicación no disponible';
  return car?.external?`Publicado: ${date}`:`Publicado en Tixuz: ${date}`;
}
function listingVerificationLabel(car){
  if(!car?.external)return '';
  const date=formatListingDate(car.last_seen_at);
  if(!date)return '';
  return mexicoDay(car.last_seen_at)===mexicoDay(new Date())?'✓ Verificado hoy':`✓ Verificado: ${date}`;
}
function requestedAutoId(){
  const p=new URLSearchParams(location.search);
  return (p.get('auto')||p.get('listing')||p.get('id')||'').trim();
}
async function openRequestedAuto(){
  const id=requestedAutoId();
  if(!id)return;
  const opened=document.querySelector('.overlay.open');
  if(opened&&opened.id!=='detailOv')closeO(opened.id);
  await openDetailById(id);
}
function cacheCar(c){
  const n=normalizeCar(c);
  if(n&&n.id)DETAIL_CACHE.set(String(n.id),n);
  return n;
}
function cacheCars(list){
  (Array.isArray(list)?list:[]).forEach(cacheCar);
  return list;
}
// Sello de veredicto de precio (datos calculados en la base por el cron de Claude).
// REGLA INNEGOCIABLE: el sello NUNCA sale solo — solo se pinta si tambien hay precio_metodo.
// 'revisar' es senal interna de posible fraude: NO se pinta al publico.
const PRECIO_VEREDICTO_LABEL={excelente:'Precio excelente',bueno:'Buen precio',justo:'Precio justo',alto:'Precio arriba del promedio'};
function precioSelloHTML(car,opts={}){
  const v=String(car&&car.precio_veredicto||'').toLowerCase().trim();
  const label=PRECIO_VEREDICTO_LABEL[v];
  const metodo=String(car&&car.precio_metodo||'').trim();
  if(!label||!metodo)return '';
  if(opts.mode==='visible'){
    return `<div style="margin-bottom:12px"><span class="precio-sello ${escAttr(v)}">${escHTML(label)}</span><div class="precio-metodo-txt">${escHTML(metodo)}</div></div>`;
  }
  return `<div><span class="precio-sello ${escAttr(v)}" title="${escAttr(metodo)}">${escHTML(label)}</span></div>`;
}
function normalizeCar(c){
  c = c || {};
  const out = {...c};
  let imgs = out.images;
  if(typeof imgs === 'string'){
    try{ imgs = JSON.parse(imgs); }catch{ imgs = imgs ? [imgs] : []; }
  }
  if(!Array.isArray(imgs)) imgs = [];
  out.images = imgs.map(x=>{
    if(typeof x === 'string') return x;
    if(x && typeof x === 'object') return x.url || x.src || x.publicUrl || '';
    return '';
  }).filter(Boolean);
  out.year = Number(out.year || 0);
  out.price = Number(out.price || 0);
  out.mileage = Number(out.mileage || 0);
  out.make = out.make || 'Auto';
  out.model = out.model || '';
  out.created_at = out.created_at || out.published_at || null;
  return out;
}
function mergeCars(list){
  const byId = new Map();
  [...(Array.isArray(list)?list:[]), ...allCars].forEach(c=>{
    const n = cacheCar(c);
    if(n.id && !byId.has(String(n.id))) byId.set(String(n.id), n);
  });
  allCars = Array.from(byId.values());
  return allCars;
}
async function fetchListingById(id){
  const sid=String(id||'').trim();
  if(!sid)return null;
  const ctrl=new AbortController();
  const tid=setTimeout(()=>ctrl.abort(),8000);
  try{
    const url=SB_URL+'/rest/v1/public_listings?id=eq.'+encodeURIComponent(sid)+'&select=*&limit=1';
    const r=await fetch(url,{signal:ctrl.signal,headers:{apikey:SB_ANON,Authorization:'Bearer '+SB_ANON,Accept:'application/json'}});
    clearTimeout(tid);
    if(!r.ok)return null;
    const data=await r.json();
    const car=Array.isArray(data)&&data[0]?normalizeCar(data[0]):null;
    if(car)mergeCars([car]);
    return car;
  }catch(e){clearTimeout(tid);return null;}
}

// ── INIT ──
function resetFiltersSilent(){
  ['fQ','fPMin','fPMax','fCity'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
  const yr=document.getElementById('fYear'); if(yr) yr.value='';
  const tr=document.getElementById('fTrans'); if(tr) tr.value='';
  const so=document.getElementById('fSort'); if(so) so.value='default';
}
function clearAutofillFiltersIfNeeded(){
  if(String(document.getElementById('heroQ')?.value||'').trim())return false;
  const ids=['fQ','fPMin','fPMax','fCity','fYear','fTrans'];
  const dirty=ids.some(id=>{const el=document.getElementById(id);return el&&String(el.value||'').trim()});
  if(!dirty)return false;
  resetFiltersSilent();
  return true;
}
async function init(){
  initHeroPlaceholder();
  installLiveSearchScrollGuard();
  bindHeroSearchControls();
  populateYearFilter();
  resetFiltersSilent();
  allCars=[];
  populateCityFilter();
  applyFilters();
  // Algunos navegadores/autofill meten números viejos en filtros después del primer render.
  // Se limpia sin cambiar diseño para que nunca arranque filtrado por accidente.
  setTimeout(()=>{if(clearAutofillFiltersIfNeeded())applyFilters()},120);
  setTimeout(()=>{if(clearAutofillFiltersIfNeeded())applyFilters()},700);
  loadCars().finally(openRequestedAuto);
  loadPlans();
  renderPhotoGrid();
  handleReturn();
  setTimeout(aiInit,600);
}

async function loadCars(){
  try{
    const ctrl=new AbortController();
    const tid=setTimeout(()=>ctrl.abort(),3500);
    let r=await fetch('/.netlify/functions/public-active-listings',{signal:ctrl.signal,headers:{Accept:'application/json'}});
    let realCars=[];
    clearTimeout(tid);
    if(r.ok){
      const payload=await r.json();
      realCars=Array.isArray(payload.listings)?payload.listings:[];
    }else{
      const fallback=await fetch(SB_URL+'/rest/v1/public_listings?select=*&order=created_at.desc&limit=300',{
        headers:{'apikey':SB_ANON,'Authorization':'Bearer '+SB_ANON,'Accept':'application/json'}
      });
      if(!fallback.ok)throw new Error('HTTP '+fallback.status);
      realCars=await fallback.json();
    }
    const persistedExternal=await loadPersistedExternalInventory();
    const cleanReal=[
      ...(Array.isArray(realCars)?realCars:[]).filter(c=>c&&c.id).map(normalizeCar),
      ...persistedExternal
    ];
    const seen=new Set();
    allCars=cacheCars(cleanReal.filter(c=>{const k=String(c.id||c.make+'-'+c.model+'-'+c.year); if(seen.has(k))return false; seen.add(k); return true}));
    populateCityFilter();
    applyFilters();
  }catch(e){
    console.warn('Supabase no cargó; se muestra estado vacío honesto.', e);
    allCars=[];
    populateCityFilter();
    applyFilters();
  }
}

function isIndividualExternalListingUrl(value){
  const url=String(value||'');
  return /auto\.mercadolibre\.com\.mx\/MLM-\d+/i.test(url)
    || /seminuevos\.com\/vehicle\/(?:[^/?]+\/)?\d+/i.test(url)
    || /autocosmos\.com\.mx\/auto\/usado\/[^/]+\/[^/]+\/[^/]+\/[a-f0-9]{32}/i.test(url);
}
function normalizeInventoryCar(c){
  const source=c.agg_source_registry||{};
  const sourceName=repairMojibakeText(c.source_name||source.source_name||source.name||source.label||'Portal externo').trim();
  const sourceUrl=String(c.source_url||'').trim();
  if(/tixuz/i.test(sourceName)||/tixuzautos\.com/i.test(sourceUrl)||!isIndividualExternalListingUrl(sourceUrl))return null;
  return normalizeExternalCar({
    url:sourceUrl,
    portal:sourceName,
    marca:c.make||c.marca,
    modelo:c.model||c.modelo||c.title,
    anio:c.year||c.anio,
    precio:c.price_mxn||c.price||c.precio,
    km:c.mileage_km||c.mileage||c.km,
    ubicacion:c.location||c.ubicacion,
    city:c.city,
    state:c.state,
    version:c.raw_payload?.version,
    transmission:c.raw_payload?.transmission,
    seller_name:c.raw_payload?.seller_name,
    seller_type:c.seller_type||c.raw_payload?.seller_type,
    published_at:c.raw_payload?.published_at,
    last_seen_at:c.last_seen_at,
    thumbnail_url:c.thumbnail_url
  });
}
async function loadPersistedExternalInventory(){
  try{
    const select='id,source_id,external_id,make,model,year,price_mxn,mileage_km,city,state,location,seller_type,thumbnail_url,source_url,title,last_seen_at,raw_payload,agg_source_registry(source_name,name,label)';
    const url=SB_URL+'/rest/v1/agg_autos_inventory?status=eq.active&expires_at=gt.'+encodeURIComponent(new Date().toISOString())+'&select='+encodeURIComponent(select)+'&order=last_seen_at.desc&limit=300';
    const r=await fetch(url,{headers:{apikey:SB_ANON,Authorization:'Bearer '+SB_ANON,Accept:'application/json'}});
    if(!r.ok)return [];
    const rows=await r.json();
    return (Array.isArray(rows)?rows:[]).map(normalizeInventoryCar).filter(c=>c&&c.source_url);
  }catch(e){
    console.warn('Inventario externo persistido no disponible.',e);
    return [];
  }
}

function hasAnyActiveFilter(){
  const q=(document.getElementById('fQ')?.value||'').trim();
  const pmin=(document.getElementById('fPMin')?.value||'').trim();
  const pmax=(document.getElementById('fPMax')?.value||'').trim();
  const city=(document.getElementById('fCity')?.value||'').trim();
  const yr=(document.getElementById('fYear')?.value||'').trim();
  const tr=(document.getElementById('fTrans')?.value||'').trim();
  const sort=(document.getElementById('fSort')?.value||'default');
  return !!(q||pmin||pmax||city||yr||tr||sort!=='default');
}
function activeRealCount(){
  return (allCars||[]).length;
}
function updateInventoryNotice(list, opts={}){
  const n=document.getElementById('inventoryNotice');
  if(!n)return;
  const real=activeRealCount();
  const filtered=!!opts.hasActiveFilters;
  if(!real && !filtered){
    n.style.display='block';
    n.innerHTML='<strong>Inventario verificado en crecimiento.</strong> Estamos sumando autos de particulares, lotes y agencias con revision humana antes de activar. <button onclick="openSell()">Publicar mi auto</button>';
  }else if(real && real<6 && !filtered){
    n.style.display='block';
    n.innerHTML='<strong>Anuncios reales en crecimiento.</strong> Primero medimos contactos reales por WhatsApp; los planes pagados vienen despues de probar valor. <button onclick="openSell()">Publicar ahora</button>';
  }else{
    n.style.display='none';
    n.innerHTML='';
  }
}
function updateDensityNotice(list,opts={}){
  const n=document.getElementById('densityNotice');
  if(!n)return;
  const city=opts.city||'';
  if(!city){n.style.display='none';n.innerHTML='';return}
  const count=Array.isArray(list)?list.length:0;
  const label=cityLabel(city);
  n.style.display='block';
  if(count<6){
    n.innerHTML=`<strong>${label}: ${count} autos visibles.</strong> Aun estamos aumentando inventario local. Puedes publicar tu auto gratis y ayudar a que haya mas opciones reales en esta ciudad.`;
  }else{
    n.innerHTML=`<strong>${label}: ${count} autos visibles.</strong> Ya hay base local; mide clics a WhatsApp y respuesta del vendedor antes de vender planes pagados.`;
  }
}
function normText(v){
  return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function toggleMobileMenu(){
  const menu=document.querySelector('.hbtns');
  const btn=document.querySelector('.menu-toggle');
  if(!menu)return;
  const open=menu.classList.toggle('open');
  if(btn)btn.setAttribute('aria-label',open?'Cerrar menú':'Abrir menú');
}
function initHeroPlaceholder(){
  const input=document.getElementById('heroQ');
  if(!input)return;
  const examples=['Toyota Hilux 2021 diésel','SUV familiar hasta $350,000','Mazda 3 automático','Pickup para trabajo en Jalisco','Sedán ahorrador menos de $200,000'];
  let item=0,pos=0,deleting=false;
  const tick=()=>{
    if(input.value)return setTimeout(tick,900);
    const text=examples[item];
    pos += deleting ? -1 : 1;
    input.placeholder=text.slice(0,pos);
    if(!deleting&&pos>=text.length){deleting=true;return setTimeout(tick,1300)}
    if(deleting&&pos<=0){deleting=false;item=(item+1)%examples.length;return setTimeout(tick,220)}
    setTimeout(tick,deleting?30:55);
  };
  input.placeholder='';
  tick();
}
function hashExternalId(value){
  let h=0; const s=String(value||'');
  for(let i=0;i<s.length;i++) h=((h<<5)-h+s.charCodeAt(i))|0;
  return 'ext-'+Math.abs(h);
}
function repairMojibakeText(value){
  return String(value||'')
    .replace(/M\u00c3\u00a9/g,'Mé')
    .replace(/m\u00c3\u00a9/g,'mé')
    .replace(/\u00c3\u00a9/g,'é')
    .replace(/\u00c3\u00a1/g,'á')
    .replace(/\u00c3\u00ad/g,'í')
    .replace(/\u00c3\u00b3/g,'ó')
    .replace(/\u00c3\u00ba/g,'ú')
    .replace(/\u00c3\u00b1/g,'ñ')
    .replace(/\u00c3\u00bc/g,'ü')
    .replace(/\u00c2\u00bf/g,'¿')
    .replace(/\u00c2\u00a1/g,'¡')
    .replace(/\u00c2/g,'');
}
function normalizeExternalCar(c){
  const url=String(c.url||c.fuente_url||'').trim();
  const portal=repairMojibakeText(c.portal||c.fuente_portal||c.source||'Portal externo').trim();
  const title=repairMojibakeText(c.title||'').trim();
  return {
    id: hashExternalId(url || title),
    external: true,
    source_url: url,
    clickout_url: String(c.clickout_url||'').trim(),
    source: portal,
    make: repairMojibakeText(c.marca||c.make||'').trim(),
    model: repairMojibakeText(c.modelo||c.model||title||'Auto externo').trim(),
    year: c.anio || c.year || '',
    price: c.precio || c.price || 0,
    mileage: c.km || c.mileage || 0,
    transmission: c.transmission || '',
    fuel_type: c.fuel_type || '',
    location: repairMojibakeText(c.ubicacion||c.location||[c.city,c.state].filter(Boolean).join(', ')).trim()||null,
    city: repairMojibakeText(c.city||'').trim()||null,
    state: repairMojibakeText(c.state||'').trim()||null,
    version: c.version||null,
    images: c.thumbnail_url ? [c.thumbnail_url] : [],
    image_kind: c.image_kind || (c.thumbnail_url ? 'real_source' : 'placeholder'),
    seller_name: c.seller_name||null,
    seller_type: c.seller_type||portal,
    published_at: c.published_at||null,
    created_at: c.published_at||null,
    last_seen_at: c.last_seen_at||c.verified_at||null,
    vehicle_body_type: c.vehicle_body_type||null,
    precio_veredicto: c.precio_veredicto||null,
    precio_metodo: c.precio_metodo||null,
    precio_n: c.precio_n||null,
    precio_mediana: c.precio_mediana||null
  };
}
function currentExternalKey(q,city){
  return `${normText(q).trim()}|${city||''}`;
}
function externalMatchesControls(c,pmin,pmax,yr,tr){
  if(Number(c.price||0) && (Number(c.price||0)<pmin || Number(c.price||0)>pmax)) return false;
  if(yr && Number(c.year||0) && Number(c.year||0)<yr) return false;
  if(tr && c.transmission && c.transmission!==tr) return false;
  return true;
}
function cancelPendingExternalSearch(clearResults=false){
  clearTimeout(externalTimer);
  externalTimer=null;
  if(externalAbortController){
    externalAbortController.abort();
    externalAbortController=null;
  }
  externalSeq++;
  externalLoading=false;
  if(clearResults){
    externalCars=[];
    externalPortalLinks=[];
    externalSearchKey='';
    externalError='';
    externalPartial=false;
    externalZeroQuery='';
  }
}
function scheduleExternalSearch(q,city,opts={}){
  const clean=String(q||'').trim();
  const key=currentExternalKey(clean,city);
  if(clean.length<3){
    cancelPendingExternalSearch(true);
    return;
  }
  const keyChanged=externalSearchKey!==key;
  if(opts.immediate)cancelPendingExternalSearch(keyChanged);
  else if(keyChanged)cancelPendingExternalSearch(true);
  else if(externalLoading || externalCars.length || externalError)return;
  externalLoading=true; externalError=''; externalPartial=false; externalSearchKey=key;
  const delay=opts.immediate?0:LIVE_SEARCH_DEBOUNCE_MS;
  externalTimer=setTimeout(()=>loadExternalCars(clean,city,key),delay);
}
async function loadExternalCars(q,city,key){
  const seq=++externalSeq;
  const ctrl=new AbortController();
  externalAbortController=ctrl;
  try{
    const params=new URLSearchParams({q,limit:'40'});
    if(city)params.set('ciudad',cityLabel(city));
    const r=await fetch('/api/buscar-serper?'+params.toString(),{signal:ctrl.signal,headers:{Accept:'application/json'}});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const payload=await r.json();
    if(seq!==externalSeq||key!==externalSearchKey)return;
    const resultItems=Array.isArray(payload.results)?payload.results:[];
    const externalItems=resultItems;
    externalCars=externalItems
      .filter(item=>item&&item.type==='aggregated')
      .map(item=>normalizeExternalCar({
        title:item.title,
        portal:item.source,
        url:item.url,
        clickout_url:item.clickout_url,
        marca:item.make,
        modelo:item.model,
        anio:item.year,
        precio:item.price_mxn,
        km:item.mileage_km,
        ubicacion:item.location,
        city:item.city,
        state:item.state,
        version:item.version,
        transmission:item.transmission,
        seller_name:item.seller_name,
        seller_type:item.seller_type,
        published_at:item.published_at,
        last_seen_at:item.last_seen_at,
        thumbnail_url:item.image_url,
        image_kind:item.image_kind,
        precio_veredicto:item.precio_veredicto,
        precio_metodo:item.precio_metodo,
        precio_n:item.precio_n,
        precio_mediana:item.precio_mediana
      }))
      .filter(c=>c.source_url&&!/tixuz/i.test(c.source||'')&&!/tixuzautos\.com/i.test(c.source_url||''));
    externalPortalLinks=[];
    externalZeroQuery='';
    externalPartial=Boolean(payload.partial);
    externalError=externalPartial?'Busqueda externa parcial; puedes reintentar para consultar nuevamente todos los portales.':'';
  }catch(err){
    if(err&&err.name==='AbortError')return;
    if(seq!==externalSeq||key!==externalSearchKey)return;
    externalCars=[];
    externalPortalLinks=[];
    externalZeroQuery='';
    externalPartial=true;
    externalError='Los portales externos estan tardando. Mostrando inventario Tixuz.';
  }finally{
    if(externalAbortController===ctrl)externalAbortController=null;
    if(seq===externalSeq&&key===externalSearchKey){
      externalLoading=false;
      applyFilters({skipExternalFetch:true});
    }
  }
}
function syncHeroSearch(){
  const hero=document.getElementById('heroQ');
  const q=document.getElementById('fQ');
  if(!hero||!q)return;
  q.value=hero.value;
  applyFilters();
}
function handleLiveSearchInput(source){
  activeDiscoveryFilter=null;
  cancelPendingExternalSearch(true);
  if(source==='hero')syncHeroSearch();
  else applyFilters();
}
function setHeroQuery(value){
  activeDiscoveryFilter=null;
  const hero=document.getElementById('heroQ');
  if(hero)hero.value=value||'';
  const q=document.getElementById('fQ');
  if(q)q.value=hero?.value||'';
  markExplicitSearch();
  forceHybridSearch();
  scrollToInventory({explicit:true});
}
async function setDiscoveryFilter(filters,label){
  const allowedBodyTypes=new Set(['suv','sedan','hatchback','pickup','van','otro']);
  const bodyType=String(filters?.body_type||'').toLowerCase();
  const priceMin=Number(filters?.price_min||0);
  const priceMax=Number(filters?.price_max||0);
  activeDiscoveryFilter={
    ...(allowedBodyTypes.has(bodyType)?{body_type:bodyType}:{}),
    ...(priceMin>0?{price_min:Math.round(priceMin)}:{}),
    ...(priceMax>0?{price_max:Math.round(priceMax)}:{})
  };
  if(!Object.keys(activeDiscoveryFilter).length)return;
  cancelPendingExternalSearch(true);
  const hero=document.getElementById('heroQ');
  const q=document.getElementById('fQ');
  if(hero)hero.value=label||'';
  if(q)q.value=label||'';
  externalLoading=true;
  externalError='';
  markExplicitSearch();
  applyFilters({skipExternalFetch:true});
  scrollToInventory({explicit:true});
  const seq=++externalSeq;
  try{
    const params=new URLSearchParams({limit:'100'});
    Object.entries(activeDiscoveryFilter).forEach(([key,value])=>params.set(key,String(value)));
    const r=await fetch('/api/buscar?'+params.toString(),{headers:{Accept:'application/json'}});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const payload=await r.json();
    if(seq!==externalSeq||!activeDiscoveryFilter)return;
    externalCars=(Array.isArray(payload.results)?payload.results:[])
      .filter(item=>item&&item.type==='aggregated')
      .map(item=>normalizeExternalCar({
        title:item.title,
        portal:item.source,
        url:item.original_url||item.url,
        clickout_url:item.url,
        marca:item.make,
        modelo:item.model,
        anio:item.year,
        precio:item.price_mxn,
        km:item.mileage_km,
        ubicacion:item.location,
        city:item.city,
        state:item.state,
        transmission:item.transmission,
        last_seen_at:item.last_seen_at,
        vehicle_body_type:item.body_type,
        thumbnail_url:item.image_url,
        image_kind:item.image_kind,
        precio_veredicto:item.precio_veredicto,
        precio_metodo:item.precio_metodo,
        precio_n:item.precio_n,
        precio_mediana:item.precio_mediana
      }));
  }catch(err){
    if(seq!==externalSeq)return;
    externalCars=[];
    externalError='No pudimos aplicar este filtro. Intenta de nuevo.';
  }finally{
    if(seq===externalSeq){
      externalLoading=false;
      applyFilters({skipExternalFetch:true});
    }
  }
}
function searchInputHasFocus(){
  const active=document.activeElement;
  return active?.id==='heroQ'||active?.id==='fQ';
}
function markExplicitSearch(){
  window.__tixuzNativeExplicitSearchUntil=Date.now()+3000;
}
function installLiveSearchScrollGuard(){
  if(window.__tixuzNativeScrollGuard)return;
  window.__tixuzNativeScrollGuard=true;
  const originalScrollIntoView=Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView=function(...args){
    try{
      const inLiveBox=this.id==='tixuz-live-box'||this.closest?.('#tixuz-live-box');
      const explicit=Number(window.__tixuzNativeExplicitSearchUntil||0)>Date.now();
      if(inLiveBox&&searchInputHasFocus()&&!explicit)return;
    }catch(_){/* never block an unrelated scroll */}
    return originalScrollIntoView.apply(this,args);
  };
}
function scrollToInventory(opts={}){
  if(!opts.explicit&&searchInputHasFocus())return;
  const target=document.getElementById('carsGrid')||document.getElementById('inventoryNotice');
  target?.scrollIntoView({behavior:'smooth',block:'start'});
}
function heroSearchSubmit(ev){
  if(ev&&ev.preventDefault)ev.preventDefault();
  activeDiscoveryFilter=null;
  const hero=document.getElementById('heroQ');
  const q=document.getElementById('fQ');
  if(hero&&q)q.value=hero.value;
  markExplicitSearch();
  forceHybridSearch();
  scrollToInventory({explicit:true});
}
function forceHybridSearch(){
  activeDiscoveryFilter=null;
  const qRaw=(document.getElementById('fQ')?.value||document.getElementById('heroQ')?.value||'').trim();
  if(qRaw.length<3){cancelPendingExternalSearch(true);applyFilters({skipExternalFetch:true});return;}
  const fQ=document.getElementById('fQ');
  const hero=document.getElementById('heroQ');
  if(fQ)fQ.value=qRaw;
  if(hero)hero.value=qRaw;
  const city=document.getElementById('fCity')?.value||'';
  scheduleExternalSearch(qRaw,city,{immediate:true});
  applyFilters({skipExternalFetch:true});
}
function bindHeroSearchControls(){
  const form=document.querySelector('.hero-search');
  const input=document.getElementById('heroQ');
  const filterInput=document.getElementById('fQ');
  if(form&&!form.dataset.boundHybridSearch){
    form.dataset.boundHybridSearch='1';
    form.addEventListener('submit',heroSearchSubmit);
  }
  if(input&&!input.dataset.boundHybridSearch){
    input.dataset.boundHybridSearch='1';
    input.addEventListener('input',()=>handleLiveSearchInput('hero'));
  }
  if(filterInput&&!filterInput.dataset.boundHybridSearch){
    filterInput.dataset.boundHybridSearch='1';
    filterInput.addEventListener('input',()=>handleLiveSearchInput('filters'));
    filterInput.addEventListener('keydown',ev=>{
      if(ev.key!=='Enter')return;
      ev.preventDefault();
      markExplicitSearch();
      forceHybridSearch();
      scrollToInventory({explicit:true});
    });
  }
}
function carSmartTags(c){
  const s=normText(`${c.make||''} ${c.model||''} ${c.description||''}`);
  const tags=[];
  if(/kicks|hr-v|hrv|tucson|cx-30|cx30|corolla cross|seltos|\bzs\b|vitara|duster|jimny|tiguan|rav4|cr-v|crv|x-trail|xtrail|tracker|captiva|escape|edge|suv|camioneta/.test(s)) tags.push('suv camioneta familiar');
  if(/ranger|hilux|l200|np300|frontier|pickup|pick up|troca|trabajo/.test(s)) tags.push('pickup pick up troca trabajo');
  if(/versa|march|rio|swift|mirage|polo|aveo|attitude|spark|beat|economico|uber/.test(s)) tags.push('economico barato ciudad uber ahorrador');
  if(/sentra|versa|jetta|corolla|mazda 3|civic|elantra|mirage g4|sedan|sedán/.test(s)) tags.push('sedan sedán familiar ciudad');
  return tags.join(' ');
}
function carRealDate(c){
  const raw=c?.published_at||c?.created_at;
  if(!raw)return null;
  const parsed=new Date(raw);
  return Number.isNaN(parsed.getTime())?null:parsed;
}
function updateHonestSortOptions(list){
  const select=document.getElementById('fSort');
  if(!select)return'yr';
  const rows=Array.isArray(list)?list:[];
  const total=rows.length;
  const hideRecent=total>0&&rows.filter(c=>!carRealDate(c)).length/total>0.5;
  const hideKm=total>0&&rows.filter(c=>!(Number(c?.mileage||0)>0)).length/total>0.5;
  const recent=select.querySelector('option[value="new"]');
  const km=select.querySelector('option[value="km"]');
  if(recent){recent.hidden=hideRecent;recent.disabled=hideRecent}
  if(km){km.hidden=hideKm;km.disabled=hideKm}
  // "Ordenar resultados" es el estado inicial: conserva el orden histórico
  // (año descendente) sin convertirlo en una elección explícita del usuario.
  if((select.value||'default')==='default')return'yr';
  if((select.value==='new'&&hideRecent)||(select.value==='km'&&hideKm))select.value='yr';
  return select.value;
}
function carSort(sort){
  return(a,b)=>{
    if(sort==='lo')return Number(a.price||0)-Number(b.price||0);
    if(sort==='hi')return Number(b.price||0)-Number(a.price||0);
    if(sort==='yr')return Number(b.year||0)-Number(a.year||0);
    if(sort==='km')return Number(a.mileage||0)-Number(b.mileage||0);
    return Number(carRealDate(b)?.getTime()||0)-Number(carRealDate(a)?.getTime()||0);
  };
}
function isTixuzListing(c){
  // Los resultados agregados se normalizan siempre con external:true; los
  // marketplace_listings propios no. No se infiere por título, marca o año.
  return !c?.external;
}
function tixuzDefaultSort(a,b){
  const aIsTixuz=isTixuzListing(a);
  const bIsTixuz=isTixuzListing(b);
  if(aIsTixuz!==bIsTixuz)return aIsTixuz?-1:1;
  // Dentro del bloque propio, el anuncio más reciente va primero.
  if(aIsTixuz){
    return Number(carRealDate(b)?.getTime()||0)-Number(carRealDate(a)?.getTime()||0);
  }
  // El bloque agregado conserva exactamente el orden histórico por año.
  return carSort('yr')(a,b);
}
function parsePriceInput(value){
  const limpio=String(value||'').replace(/[^0-9.]/g,'');
  const n=parseFloat(limpio);
  return Number.isFinite(n)?n:0;
}
function applyPriceRange(){
  const sel=document.getElementById('fPRange');
  const min=document.getElementById('fPMin');
  const max=document.getElementById('fPMax');
  const wrap=document.getElementById('fPCustom');
  if(!sel||!min||!max)return;
  if(sel.value==='custom'){
    if(wrap)wrap.style.display='';
    min.value=''; max.value='';
    min.focus();
    return;
  }
  if(wrap)wrap.style.display='none';
  const partes=String(sel.value||'').split('-');
  min.value=partes[0]||'';
  max.value=partes[1]||'';
  applyFilters();
}
function applyFilters(opts={}){
  const discovery=activeDiscoveryFilter;
  const qRaw=discovery?'':(document.getElementById('fQ').value||'');
  const q=normText(qRaw);
  const stop=new Set(['de','del','la','el','los','las','para','en','con','y','o','un','una']);
  const qTokens=q.split(/\s+/).filter(t=>t&&!stop.has(t));
  const pmin=parsePriceInput(document.getElementById('fPMin').value)||0;
  const pmax=parsePriceInput(document.getElementById('fPMax').value)||1e9;
  const city=document.getElementById('fCity')?.value||'';
  const yr=parseInt(document.getElementById('fYear').value)||0;
  const tr=document.getElementById('fTrans').value;
  let list=discovery?[]:allCars.filter(c=>{
    const searchText=normText(`${c.make||''} ${c.model||''} ${c.description||''} ${c.location||''} ${c.transmission||''} ${c.fuel_type||''} ${carSmartTags(c)}`);
    if(qTokens.length&&!qTokens.every(t=>searchText.includes(t)))return false;
    if(city&&cityKey(c.location)!==city)return false;
    if(Number(c.price||0)<pmin||Number(c.price||0)>pmax)return false;
    if(Number(c.year||0)<yr)return false;
    if(tr&&(c.transmission||'')!==tr)return false;
    return true;
  });
  if(!discovery&&qTokens.length && !opts.skipExternalFetch) scheduleExternalSearch(qRaw,city);
  if(!discovery&&!qTokens.length && !opts.skipExternalFetch){
    cancelPendingExternalSearch(true);
  }
  const externalList=(discovery||qTokens.length)
    ? externalCars.filter(c=>externalMatchesControls(c,pmin,pmax,yr,tr))
    : [];
  const selectedSort=document.getElementById('fSort')?.value||'default';
  const sort=updateHonestSortOptions([...list,...externalList]);
  const hasFilters=hasAnyActiveFilter();
  renderGrid(list,{hasActiveFilters:hasFilters,city,sort,prioritizeTixuz:selectedSort==='default',externalList,externalPortalLinks:!discovery&&qTokens.length?externalPortalLinks:[],externalLoading:Boolean((discovery||qTokens.length)&&externalLoading),externalError:(discovery||qTokens.length)?externalError:''});
}

function ago(d){
  const date=carRealDate({created_at:d});
  if(!date)return'Fecha no disponible';
  const s=Math.floor((Date.now()-date)/1000);
  if(s<3600)return'Hoy';if(s<172800)return'Ayer';return`Hace ${Math.floor(s/86400)} días`;
}

function handleListingImageError(img){
  if(!img)return;
  img.removeAttribute('onerror');
  img.style.display='none';
  const fallback=img.nextElementSibling;
  if(fallback&&fallback.classList.contains('source-ph'))fallback.style.display='flex';
  const gallery=img.closest('.dgal');
  if(gallery&&![...gallery.querySelectorAll('img')].some(other=>other.style.display!=='none')){
    gallery.innerHTML='<div style="min-height:180px;width:100%;display:flex;align-items:center;justify-content:center;background:var(--bg3);color:var(--text3);font-weight:700">Imagen de referencia</div>';
  }
}
window.handleListingImageError=handleListingImageError;

function renderGrid(list,opts={}){
  updateInventoryNotice(list,opts);
  updateDensityNotice(list,opts);
  const externalList=Array.isArray(opts.externalList)?opts.externalList:[];
  const portalLinks=Array.isArray(opts.externalPortalLinks)?opts.externalPortalLinks:[];
  const displaySeen=new Set();
  const displayList=[...list,...externalList].filter(c=>{
    const key=c.external?String(c.source_url||'').replace(/[?#].*$/,'').replace(/\/$/,'').toLowerCase():`tixuz:${c.id}`;
    if(!key||displaySeen.has(key))return false;
    displaySeen.add(key);return true;
  });
  displayList.sort(opts.prioritizeTixuz?tixuzDefaultSort:carSort(opts.sort||'yr'));
  document.getElementById('gc').innerHTML=`<strong>${displayList.length}</strong> <span>autos encontrados</span>`;
  if(!displayList.length && !opts.externalLoading){document.getElementById('carsGrid').innerHTML='<div class="empty" style="grid-column:1/-1"><h3>Sin resultados visibles todavia</h3><p>No encontramos autos de Tixuz ni fuentes externas para esos filtros. Prueba con marca/modelo mas amplio o publica un auto parecido para aparecer cuando alguien busque esto.</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px"><button class="btn btn-primary" onclick="forceHybridSearch()">Reintentar busqueda hibrida</button><button class="btn btn-green" onclick="openSellFromCurrentSearch()">Publicar auto parecido</button><button class="btn btn-ghost" onclick="openSearchAI()">Ajustar filtros</button></div></div>';return}
  const cards=displayList.map((c,idx)=>{
    c=cacheCar(c);
    const sid=escJS(c.id);
    const sidAttr=escAttr(c.id);
    const loading=idx<4?'eager':'lazy';
    const priority=idx===0?' fetchpriority="high"':'';
    const sourceLabel=(c.external?c.source:'Tixuz')||'AUTO';
    const sourceInitials=sourceLabel.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'AUTO';
    const img=c.images?.[0]?`<img src="${escAttr(c.images[0])}" alt="${escAttr(c.make)} ${escAttr(c.model)}" loading="${loading}" decoding="async"${priority} onerror="handleListingImageError(this)"><div class="cimg-ph source-ph" style="display:none"><strong>Imagen de referencia</strong><span>${escHTML(sourceLabel)}</span></div>`:`<div class="cimg-ph source-ph"><strong>Imagen de referencia</strong><span>${escHTML(sourceLabel)}</span></div>`;
    const badge=c.plan==='pro'?'<span class="cbadge bp">PRO Lote</span>':c.featured?'<span class="cbadge bf">Tixuz Destacado</span>':'';
    const sourceBadge=c.external
      ? `<span class="cbadge bsource">Fuente: ${escHTML(c.source||'externa')} ↗</span>`
      : '<span class="cbadge btixuz" title="Publicado en Tixuz — directo con el vendedor">Tixuz · Directo</span>';
    const origin=c.external
      ? `<div class="listing-origin aggregated">Fuente: <strong>${escHTML(c.source||'Portal externo')} ↗</strong></div>`
      : '<div class="listing-origin direct">✓ Tixuz Directo · WhatsApp sin comisión</div>';
    const displaySellerType=c.seller_type||'Particular';
    const verdictText=(normText(c.tixuz_note_status)==='published'&&(c.tixuz_note_pros||c.tixuz_note_watch))?String(c.tixuz_note_pros||c.tixuz_note_watch).split(/[.;\n]/)[0].trim():'';
    const verdict=verdictText?`<div class="verdict-chip ${c.tixuz_note_watch&&!c.tixuz_note_pros?'watch':''}">${escHTML(verdictText).slice(0,72)}</div>`:'';
    const hasPrice=Number(c.price||0)>0;
    const hasKm=Number(c.mileage||0)>0;
    const title=[Number(c.year||0)>0?c.year:'',c.make,c.model].filter(Boolean).join(' ');
    const p=hasPrice?Number(c.price).toLocaleString('es-MX'):'';
    const km=hasKm?Number(c.mileage).toLocaleString('es-MX'):'';
    const clickout=trackedClickoutUrl(c);
    const publication=listingPublicationLabel(c);
    const verified=listingVerificationLabel(c);
    const reviewed=!c.external&&(c.verification_badge===true||String(c.verification_badge||'').toLowerCase()==='true')?'Publicación revisada':'';
    const href=c.external?escAttr(clickout):escAttr(publicListingUrl(c.id));
    const target=c.external?' target="_blank" rel="nofollow noopener"':'';
    const dataDetail=c.external?'':` data-detail-id="${sidAttr}"`;
    return`<a class="car-card${c.featured?' is-tixuz-featured':''}" href="${href}"${target} data-id="${sidAttr}"${dataDetail} aria-label="Ver ${escAttr(title||'Auto')}">
      <div class="cimg">${img}${sourceBadge}${badge}<span class="cstype">${displaySellerType}</span></div>
      <div class="cbody">
        <div class="ctitle">${escHTML(title||'Auto')}</div>
        <div class="cprice">${hasPrice?'$'+p:'Ver precio'}</div>
        ${precioSelloHTML(c)}
        ${origin}
        ${verdict}
        <div class="cmeta"><span>${hasKm?km+' km':'—'}</span><span>${c.transmission||'—'}</span><span>${c.fuel_type||'—'}</span></div>
        <div class="cloc"><span>${c.location||'Ubicación no disponible'}</span></div>
        <div class="listing-dates"><span>${escHTML(publication)}</span>${reviewed?`<span class="verified-today">${escHTML(reviewed)}</span>`:''}${verified?`<span class="verified-today">${escHTML(verified)}</span>`:''}</div>
      </div></a>`;
  }).join('');
  const loader=opts.externalLoading?'<div class="empty" style="grid-column:1/-1"><h3>Buscando fuentes externas...</h3><p>Ya mostramos primero los autos de Tixuz; agregamos portales externos en cuanto respondan.</p></div>':'';
  const links=portalLinks.length?`<div class="empty" style="grid-column:1/-1;text-align:left"><h3>Sigue buscando en otros portales:</h3><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${portalLinks.map(l=>`<a class="btn btn-ghost" href="${escAttr(l.url)}" target="_blank" rel="nofollow noopener" style="font-size:.78rem;padding:7px 10px">${escHTML(l.portal||l.label||'Portal')}</a>`).join('')}</div></div>`:'';
  const zero=externalZeroQuery?`<div class="empty" style="grid-column:1/-1"><h3>No encontramos "${escHTML(externalZeroQuery)}" ahorita</h3><p>Mira estos similares:</p></div>`:'';
  const error=opts.externalError&&!externalZeroQuery?`<div class="empty" style="grid-column:1/-1"><h3>Busqueda externa parcial</h3><p>${escHTML(opts.externalError)}</p><button class="btn btn-primary" onclick="forceHybridSearch()">Reintentar</button></div>`:'';
  document.getElementById('carsGrid').innerHTML=zero+cards+loader+error+links;
}

// ── DETAIL ──
async function openDetailById(id){
  const sid=String(id||'').trim();
  if(!sid){showToast('No se encontró la ficha del auto','error');return;}
  try{
    let car = DETAIL_CACHE.get(sid)
      || allCars.find(c => String(c.id) === sid)
;
    if(!car) car = await fetchListingById(sid);
    if(!car){showToast('No se encontró la ficha del auto','error');return;}
    car=cacheCar(car);
    openDetail(car);
  }catch(err){
    console.error('Error abriendo ficha:',err);
    showToast('No pude abrir la ficha del auto','error');
    try{
      const fallback = DETAIL_CACHE.get(sid) || allCars.find(c => String(c.id) === sid);
      if(fallback) openDetailFallback(fallback);
    }catch(e2){console.error('Fallback ficha falló:',e2)}
  }
}
window.openDetailById=openDetailById;
async function bumpViewSafely(car){
  try{
    if(!car || !car.id)return;
    await fetch('/api/listing-view',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({listing_id:String(car.id),source:'marketplace_listing',tracking:trackingContext()}),
      keepalive:true
    });
  }catch(e){console.warn('Vista no incrementada, pero ficha abierta:',e)}
}
function openDetailFallback(car){
  car=normalizeCar(car);
  const title=`${car.year||''} ${car.make||'Auto'} ${car.model||''}`.trim();
  document.getElementById('detailTitle').textContent=title||'Detalle del auto';
  const p=Number(car.price||0).toLocaleString('es-MX');
  const mileageText=Number(car.mileage)>0?`${Number(car.mileage).toLocaleString('es-MX')} km`:'No especificado';
  document.getElementById('detailBody').innerHTML=`
    <div style="height:110px;background:var(--bg3);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:2.5rem;margin-bottom:12px">🚗</div>
    <h3 style="font-size:1.15rem;font-weight:800;margin-bottom:6px">${escHTML(title)}</h3>
    <div style="font-size:1.45rem;font-weight:800;color:var(--accent);margin-bottom:12px">$${p} MXN</div>
    ${precioSelloHTML(car,{mode:'visible'})}
    <div class="dgrid">
      <div class="di"><label>Kilometraje</label><span>${mileageText}</span></div>
      <div class="di"><label>Transmisión</label><span>${escHTML(car.transmission||'—')}</span></div>
      <div class="di"><label>Ubicación</label><span>${escHTML(car.location||'México')}</span></div>
      <div class="di"><label>Vendedor</label><span>${escHTML(car.seller_name||'—')} · ${escHTML(car.seller_type||'—')}</span></div>
    </div>
    <div style="border:1px solid var(--border);background:rgba(59,130,246,.08);border-radius:12px;padding:12px;margin-top:12px;color:var(--text2);font-size:.84rem;line-height:1.5">
      La ficha se abrió en modo seguro porque el registro trae algún dato irregular. El anuncio no se pierde.
    </div>
    <div class="detail-note">
      <strong style="color:var(--text)">Prevención de fraude:</strong> No entregues anticipos sin verificar identidad del vendedor, documentos y existencia física del auto.
    </div>`;
  openO('detailOv');
}
function openDetail(car){
  if(typeof car==='string')try{car=JSON.parse(car)}catch{return}
  car=normalizeCar(car);
  const isDemo=car.demo===true||car.is_demo===true||car.seed===true;
  window.__lastDetailCar = car; // v65: guardar para mensaje WhatsApp pre-llenado
  const title=`${car.year||''} ${car.make||'Auto'} ${car.model||''}`.trim();
  document.getElementById('detailTitle').textContent=title;
  const imgs=(car.images||[]).filter(Boolean);
  const gal=imgs.length?`<div class="dgal">${imgs.map(u=>`<img src="${escAttr(u)}" alt="" onerror="handleListingImageError(this)">`).join('')}</div>`:`<div style="height:110px;background:var(--bg3);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text3);font-weight:700;margin-bottom:12px">Imagen de referencia</div>`;
  const p=Number(car.price||0).toLocaleString('es-MX');
  const km=Number(car.mileage)>0?`${Number(car.mileage).toLocaleString('es-MX')} km`:'No especificado';
  const b=car.plan==='pro'?'<span class="cbadge bp" style="position:static;display:inline-block">PRO Lote</span>':car.featured?'<span class="cbadge bf" style="position:static;display:inline-block">Tixuz Destacado</span>':'';
  const waTarget=safeWaTarget(car.id);
  const displaySellerName=car.seller_name||'—';
  const displaySellerType=car.seller_type||'—';
  const reviewPassed=car.verification_badge===true||String(car.verification_badge||'').toLowerCase()==='true';
  const trust=`<div class="trust-row"><span class="trust-chip good">${reviewPassed?'Publicación revisada':'Revisión humana de tu publicación'}</span><span class="trust-chip">Contacto directo por WhatsApp</span></div>`;
  const originDetail=isDemo?'':`<div class="listing-provenance"><div class="listing-origin direct">✓ Tixuz Directo · Contacto inmediato por WhatsApp · Sin comisión</div><div class="listing-dates"><span>${escHTML(listingPublicationLabel(car))}</span></div></div>`;
  const descText = car.description||'';
  const originalLink = (!isDemo && car.source_url) ? `<a href="${escAttr(car.source_url)}" target="_blank" rel="noopener" class="btn btn-ghost" style="width:100%;justify-content:center;margin-top:7px;text-decoration:none">Ver publicación original</a>` : '';
  const safetyNote = `
    <div class="detail-note">
      <strong style="color:var(--text)">Prevención de fraude:</strong> No entregues anticipos sin verificar identidad del vendedor, documentos y existencia física del auto. No des apartado ni anticipo antes de ver el auto, al vendedor y sus documentos originales.<br><strong style="color:var(--text)">Si vendes:</strong> No aceptes cheques; no entregues auto, llaves o factura solo por un comprobante de transferencia. Confirma el pago final en tu banco.<br><span style="color:var(--text3)">Tixuz no recibe ni custodia el pago del vehículo; comprador y vendedor acuerdan la operación directamente.</span>
      <a href="mailto:soporte@tixuzautos.com?subject=Reporte%20de%20anuncio%20${encodeURIComponent(title)}" style="color:var(--accent);font-weight:700;text-decoration:none">Reportar anuncio</a>
    </div>`;
  const actionBlock = isDemo ? `
    <div class="detail-note">
      <strong style="color:var(--text)">Inventario activo de Tixuz Autos.</strong><br>
      Esta ficha muestra cómo se verá un anuncio activo. Para recibir compradores reales, publica tu propio auto.
    </div>
    <div class="detail-actions">
      <button class="btn btn-green" style="flex:1;justify-content:center" onclick="closeO('detailOv');openSell()">Publicar mi auto</button>
      <button class="btn btn-ghost" style="flex:1;justify-content:center" onclick="closeO('detailOv');openPlans()">Ver planes</button>
    </div>` : `
    <div class="detail-actions"><button class="btn btn-green" style="width:100%;justify-content:center;padding:12px;font-size:.9rem" onclick="revealWA('${escJS(car.id)}',this,'${escJS(waTarget)}')">Ver WhatsApp del vendedor</button></div>
    ${originalLink}
    <div id="${escAttr(waTarget)}" style="margin-top:7px;font-size:.8rem"></div>
    <div style="margin-top:5px;font-size:.7rem;color:var(--text3)">8 revelaciones por IP cada 10 min · anti-scraping</div>
    ${safetyNote}`;
  document.getElementById('detailBody').innerHTML=`
    ${gal}
    <div style="display:flex;align-items:center;gap:7px;margin-bottom:7px">${b}<h3 style="font-size:1.15rem;font-weight:800">${escHTML(title)}</h3></div>
    <div style="font-size:1.45rem;font-weight:800;color:var(--accent);margin-bottom:12px">$${p} MXN</div>
    ${precioSelloHTML(car,{mode:'visible'})}
    ${priceComparableSignal(car)}
    ${originDetail}
    ${trust}
    <div class="dgrid">
      <div class="di"><label>Kilometraje</label><span>${km}</span></div>
      <div class="di"><label>Transmisión</label><span>${escHTML(car.transmission||'—')}</span></div>
      <div class="di"><label>Combustible</label><span>${escHTML(car.fuel_type||'—')}</span></div>
      <div class="di"><label>Color</label><span>${escHTML(car.color||'—')}</span></div>
      <div class="di"><label>Ubicación</label><span>${escHTML(car.location||'México')}</span></div>
      <div class="di"><label>Vendedor</label><span>${escHTML(displaySellerName)} · ${escHTML(displaySellerType)}</span></div>
    </div>
    ${descText?`<p style="color:var(--text2);font-size:.84rem;line-height:1.6;margin-bottom:12px">${escHTML(descText)}</p>`:''}
    ${actionBlock}`;
  openO('detailOv');
  if(!isDemo)setTimeout(()=>bumpViewSafely(car),0);
}
function trackLeadClick(id,channel='whatsapp'){
  try{
    const key='tixuz_lead_events_v1';
    const arr=JSON.parse(localStorage.getItem(key)||'[]');
    arr.push({
      id:String(id||''),
      channel,
      at:new Date().toISOString(),
      city:document.getElementById('fCity')?.value||'',
      path:location.pathname+location.search
    });
    localStorage.setItem(key,JSON.stringify(arr.slice(-300)));
  }catch(e){}
}
async function revealWA(id,btn,targetId){
  btn.disabled=true;btn.textContent='Verificando…';
  const el=document.getElementById(targetId||('waR'+id));
  if(!el){btn.disabled=false;btn.textContent='Ver WhatsApp del vendedor';showToast('No pude preparar el WhatsApp','error');return;}
  const ctrl=new AbortController();
  const tid=setTimeout(()=>ctrl.abort(),10000);
  try{
    const r=await fetch('/.netlify/functions/reveal-whatsapp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({listing_id:id,tracking:trackingContext()}),signal:ctrl.signal});
    clearTimeout(tid);
    const txt=await r.text();
    let d={};
    try{d=txt?JSON.parse(txt):{}}catch{d={ok:false,error:txt||'Respuesta inválida'}}
    if(r.ok&&d.ok&&d.whatsapp){
      const wa=String(d.whatsapp).replace(/\D/g,'');
      // v65: armar mensaje pre-llenado con datos del auto que vio el comprador
      const ctx = window.__lastDetailCar || {};
      const titulo = `${ctx.year||''} ${ctx.make||''} ${ctx.model||''}`.trim();
      const precio = ctx.price ? ` (${Number(ctx.price).toLocaleString('es-MX')} MXN)` : '';
      const msg = encodeURIComponent(`Hola, vi tu ${titulo||'auto'}${precio} en Tixuz Autos. Sigue disponible?`);
      el.innerHTML=`<a href="https://wa.me/52${wa}?text=${msg}" target="_blank" onclick="trackLeadClick('${escJS(id)}','whatsapp')" class="btn btn-green" style="display:inline-flex;gap:5px;text-decoration:none">💬 Abrir WhatsApp: ${wa.slice(0,3)} ${wa.slice(3,7)} ${wa.slice(7)}</a>`;
      btn.style.display='none';
    }else{
      el.innerHTML=`<span style="color:var(--danger)">${escHTML(d.error||'No se pudo revelar WhatsApp')}</span>`;
      btn.disabled=false;btn.textContent='Ver WhatsApp del vendedor';
    }
  }catch(err){
    clearTimeout(tid);
    if(el)el.innerHTML='<span style="color:var(--danger)">No respondió la función reveal-whatsapp. Revisa Functions log.</span>';
    btn.disabled=false;btn.textContent='Ver WhatsApp del vendedor';
    showToast('No se pudo abrir WhatsApp','error');
  }
}

// -- SELLER INTAKE --
// ── SELLER INVENTORY INTAKE ──
function openLotIntake(){
  document.getElementById('lotErr').style.display='none';
  prefillLotIntakeFromUrl();
  renderLotPreview();
  openO('lotOv');
}
function lotIntakeRequested(){
  const p=new URLSearchParams(location.search);
  return p.has('lote')||p.has('cargar_lote')||location.hash==='#lote';
}
function sellRequested(){
  const p=new URLSearchParams(location.search);
  return p.has('publicar')||p.has('vender')||p.has('sell')||location.hash==='#publicar'||location.hash==='#vender';
}
function prefillLotIntakeFromUrl(){
  const p=new URLSearchParams(location.search);
  const map={lotName:['nombre','lote','name'],lotWA:['wa','whatsapp','telefono'],lotCity:['ciudad','city']};
  Object.entries(map).forEach(([id,keys])=>{
    const el=document.getElementById(id);
    if(!el||el.value)return;
    const val=keys.map(k=>p.get(k)).find(Boolean);
    if(val)el.value=id==='lotWA'?lotDigits(val).slice(-10):val;
  });
}
function lotMsg(msg,type=''){
  const el=document.getElementById('lotStatus');
  el.innerHTML=msg;
  el.style.color=type==='bad'?'var(--danger)':type==='ok'?'var(--green)':type==='warn'?'var(--gold)':'var(--text3)';
}
function clearLotIntake(){
  lotRows=[];lotFileTexts=[];
  ['lotFiles','lotPaste'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('lotPreview').style.display='none';
  document.getElementById('lotPreview').innerHTML='';
  lotMsg('Sin inventario analizado todavía.');
}
function lotDigits(v){return String(v||'').replace(/\D/g,'')}
function normalizeHeader(k){
  return String(k||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
}
function csvLine(line,sep=','){
  const out=[];let cur='',q=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i],nx=line[i+1];
    if(ch==='"'&&q&&nx==='"'){cur+='"';i++;continue}
    if(ch==='"'){q=!q;continue}
    if(ch===sep&&!q){out.push(cur.trim());cur='';continue}
    cur+=ch;
  }
  out.push(cur.trim());
  return out;
}
function parseDelimited(text,sep){
  const lines=String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(lines.length<2)return [];
  const headers=csvLine(lines[0],sep).map(normalizeHeader);
  return lines.slice(1).map(line=>{
    const cells=csvLine(line,sep),row={};
    headers.forEach((h,i)=>row[h]=cells[i]||'');
    return row;
  });
}
function detectInventorySep(line){
  if(String(line||'').includes('\t'))return '\t';
  if(String(line||'').includes(';'))return ';';
  return ',';
}
function looksLikeInventoryHeader(line){
  const h=String(line||'').toLowerCase();
  return /marca|make|modelo|model|año|ano|anio|year|precio|price|kilometraje|km|fotos|imagenes|im[aá]genes|descripcion|descripci[oó]n/.test(h);
}
function parseInventoryInput(text){
  const raw=String(text||'').trim();
  if(!raw)return [];
  if(/^\s*[\[{]/.test(raw)){
    try{return parseJsonInventory(raw)}catch(e){}
  }
  const lines=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(lines.length>=2&&looksLikeInventoryHeader(lines[0]))return parseDelimited(raw,detectInventorySep(lines[0]));
  return parseTextInventory(raw);
}
function parseJsonInventory(text){
  const data=JSON.parse(text);
  if(Array.isArray(data))return data;
  return data.listings||data.autos||data.inventario||data.items||[];
}
function findVal(row,keys){
  for(const k of keys){
    const nk=normalizeHeader(k);
    if(row[k]!=null&&String(row[k]).trim()!=='')return row[k];
    if(row[nk]!=null&&String(row[nk]).trim()!=='')return row[nk];
  }
  return '';
}
function moneyNum(v){
  const s=String(v||'').replace(/\b(mxn|pesos|mn)\b/ig,'').replace(/[^\d.]/g,'');
  const n=Number(s);
  return Number.isFinite(n)?Math.round(n):0;
}
function textNum(v){
  const n=Number(String(v||'').replace(/[^\d.]/g,''));
  return Number.isFinite(n)?Math.round(n):0;
}
function imageUrls(v){
  const s=Array.isArray(v)?v.join(' '):String(v||'');
  return (s.match(/https?:\/\/[^\s,;|)]+/g)||[]).filter(u=>!/(javascript:|data:|file:)/i.test(u)).slice(0,12);
}
const LOT_BRANDS=['Toyota','Honda','Nissan','Volkswagen','VW','Mazda','Chevrolet','Ford','Kia','Hyundai','Audi','BMW','Mercedes-Benz','Renault','Suzuki','Mitsubishi','MG','Jeep','Dodge','RAM','Seat','Peugeot','BYD','Chirey','JAC','Fiat','Volvo'];
function titleParts(text){
  const head=String(text||'').split(/[,;|]/)[0];
  const clean=head.replace(/https?:\/\/\S+/g,' ').replace(/\$ ?[\d,.]+/g,' ').replace(/\b(19[8-9]\d|20[0-2]\d)\b/g,' ').replace(/[\d,.]+\s*(km|kms|kilometros|kilómetros)/ig,' ').replace(/\s+/g,' ').trim();
  const found=LOT_BRANDS.find(b=>new RegExp(`\\b${b.replace('-','[- ]')}\\b`,'i').test(clean));
  if(!found)return {make:'',model:clean};
  const make=found==='VW'?'Volkswagen':found;
  const after=clean.replace(new RegExp(`^.*?\\b${found.replace('-','[- ]')}\\b`,'i'),'').trim();
  const stops=new Set(['manual','automatico','automática','automatica','cvt','gasolina','diesel','diésel','hibrido','híbrido','electrico','eléctrico','blanco','negro','gris','plata','rojo','azul','verde','guadalajara','cdmx','monterrey','puebla','queretaro','tijuana','toluca','merida','leon']);
  const model=after.split(/\s+/).filter(Boolean);
  const cleanModel=[];
  for(const token of model){if(stops.has(token.toLowerCase())||/^\d+$/.test(token))break;cleanModel.push(token)}
  return {make,model:cleanModel.join(' ')};
}
function normalizeLotRow(raw){
  const title=String(findVal(raw,['titulo','title','auto','vehiculo','vehículo','descripcion','descripción','description','modelo'])||'');
  const parts=titleParts(`${findVal(raw,['marca','make'])} ${findVal(raw,['modelo','model']) || title}`);
  const make=String(findVal(raw,['make','marca'])||parts.make||'').trim();
  const model=String(findVal(raw,['model','modelo','version','versión'])||parts.model||'').trim().replace(new RegExp(`^${make}\\s+`,'i'),'');
  const text=Object.values(raw||{}).join(' ');
  const year=textNum(findVal(raw,['year','año','ano','anio'])) || textNum((text.match(/\b(19[8-9]\d|20[0-2]\d)\b/)||[])[1]);
  const price=moneyNum(findVal(raw,['price','precio','precio_mxn'])) || moneyNum((text.match(/\$ ?[\d,.]{4,}/)||[])[0]);
  const mileage=textNum(findVal(raw,['mileage','kilometraje','km'])) || textNum((text.match(/([\d,.]+)\s*(km|kms|kilometros|kilómetros)/i)||[])[1]);
  const images=imageUrls(findVal(raw,['images','fotos','imagenes','imágenes','foto','image'])||text);
  return {
    make,model,year,price,mileage,
    transmission:String(findVal(raw,['transmission','transmision','transmisión'])||(/manual/i.test(text)?'Manual':/cvt/i.test(text)?'CVT':'Automática')).trim(),
    fuel_type:String(findVal(raw,['fuel_type','combustible'])||(/diesel|diésel/i.test(text)?'Diésel':/hibrid|híbr/i.test(text)?'Híbrido':/elect/i.test(text)?'Eléctrico':'Gasolina')).trim(),
    color:String(findVal(raw,['color'])||'No especificado').trim(),
    location:String(findVal(raw,['location','ubicacion','ubicación','ciudad'])||document.getElementById('lotCity')?.value||'México').trim(),
    description:String(findVal(raw,['description','descripcion','descripción'])||title||'Inventario autorizado para Tixuz Autos.').trim(),
    images,
    source_url:String(findVal(raw,['source_url','url','link'])||'').trim(),
  };
}
function parseTextInventory(text){
  return String(text||'').split(/\n+/).map(x=>x.trim()).filter(x=>x.length>8).map(line=>({titulo:line,descripcion:line}));
}
function lotIssues(row){
  const out=[];
  if(!row.make)out.push('marca');
  if(!row.model)out.push('modelo');
  if(!row.year||row.year<1980||row.year>2027)out.push('año');
  if(!row.price||row.price<1000)out.push('precio');
  return out;
}
function renderLotPreview(){
  const box=document.getElementById('lotPreview');
  if(!lotRows.length){box.style.display='none';box.innerHTML='';return}
  const valid=lotRows.filter(r=>!lotIssues(r).length).length;
  const noPhotos=lotRows.filter(r=>!r.images?.length&&!lotIssues(r).length).length;
  lotMsg(`${lotRows.length} autos detectados · ${valid} listos · ${noPhotos} sin foto URL`, valid?'ok':'warn');
  box.style.display='';
  box.innerHTML=`<table><thead><tr><th>Estado</th><th>Auto</th><th>Precio</th><th>Ciudad</th><th>Fotos</th></tr></thead><tbody>${lotRows.map(r=>{
    const issues=lotIssues(r);
    const cls=issues.length?'lot-bad':r.images?.length?'lot-ok':'lot-warn';
    const status=issues.length?'Falta '+issues.join(', '):(r.images?.length?'Listo':'Sin fotos');
    return `<tr><td class="${cls}">${escHTML(status)}</td><td>${escHTML(`${r.year||''} ${r.make||''} ${r.model||''}`.trim())}</td><td>$${Number(r.price||0).toLocaleString('es-MX')}</td><td>${escHTML(r.location||'México')}</td><td>${r.images?.length||0}</td></tr>`;
  }).join('')}</tbody></table>`;
}
function readFileText(file){
  return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=reject;r.readAsText(file);});
}
function readFileBuffer(file){
  return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsArrayBuffer(file);});
}
function loadXLSX(){
  if(window.XLSX)return Promise.resolve(window.XLSX);
  return new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src='/assets/vendor/xlsx-0.18.5.full.min.js';
    s.onload=()=>resolve(window.XLSX);s.onerror=()=>reject(new Error('No pude cargar lector de Excel'));
    document.head.appendChild(s);
  });
}
async function handleLotFiles(ev){
  const files=Array.from(ev.target.files||[]);
  if(!files.length)return;
  lotMsg(`Leyendo ${files.length} archivo(s)…`);
  const rows=[];
  for(const file of files){
    const name=file.name.toLowerCase();
    try{
      if(/\.(xlsx|xls)$/.test(name)){
        const XLSX=await loadXLSX();
        const wb=XLSX.read(await readFileBuffer(file),{type:'array'});
        wb.SheetNames.forEach(sn=>rows.push(...XLSX.utils.sheet_to_json(wb.Sheets[sn],{defval:''})));
      }else{
        const text=await readFileText(file);
        lotFileTexts.push(text);
        if(name.endsWith('.json'))rows.push(...parseJsonInventory(text));
        else if(name.endsWith('.tsv'))rows.push(...parseDelimited(text,'\t'));
        else if(name.endsWith('.csv'))rows.push(...parseDelimited(text,','));
        else rows.push(...parseTextInventory(text));
      }
    }catch(err){showToast(`No pude leer ${file.name}: ${err.message}`,'error')}
  }
  lotRows=rows.map(normalizeLotRow).slice(0,100);
  renderLotPreview();
}
async function aiNormalizeLot(rows,text){
  const ctrl=new AbortController();
  const tid=setTimeout(()=>ctrl.abort(),8000);
  try{
    const r=await fetch('/.netlify/functions/lot-normalize-ai',{method:'POST',headers:{'Content-Type':'application/json'},signal:ctrl.signal,body:JSON.stringify({rows,text,lot:{name:document.getElementById('lotName').value,city:document.getElementById('lotCity').value}})});
    clearTimeout(tid);
    const d=await r.json();
    if(r.ok&&d.ok&&Array.isArray(d.listings)&&d.listings.length)return d.listings.map(normalizeLotRow);
  }catch(e){clearTimeout(tid);}
  return null;
}
async function analyzeLotInventory(){
  const btn=document.getElementById('lotAnalyzeBtn');
  const pasted=document.getElementById('lotPaste').value.trim();
  const baseRows=[...lotRows];
  if(pasted)baseRows.push(...parseInventoryInput(pasted));
  if(!baseRows.length&&!pasted)return lotMsg('Sube un archivo o pega inventario para analizar.','bad');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="spin"></div> Acomodando…'}
  try{
    lotRows=baseRows.map(normalizeLotRow).slice(0,100);
    renderLotPreview();
    lotMsg('Inventario acomodado. Revisando si la IA puede mejorarlo…','warn');
    const aiRows=await aiNormalizeLot(baseRows,pasted||lotFileTexts.join('\n').slice(0,50000));
    if(aiRows&&aiRows.length){
      lotRows=aiRows.slice(0,100);
      renderLotPreview();
      lotMsg('Inventario acomodado con IA. Revisa la tabla antes de enviar.','ok');
    }else{
      renderLotPreview();
      lotMsg('Inventario acomodado sin IA. Revisa marca, modelo, año y precio antes de enviar.','ok');
    }
  }catch(e){
    lotMsg(e.message||'No pude acomodar el inventario. Revisa el texto o usa CSV con encabezados.','bad');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Acomodar inventario'}
  }
}
async function submitLotInventory(){
  const err=document.getElementById('lotErr');
  const btn=document.getElementById('lotSubmitBtn');
  const lot={name:document.getElementById('lotName').value.trim(),whatsapp:lotDigits(document.getElementById('lotWA').value),city:document.getElementById('lotCity').value.trim(),pin:document.getElementById('lotPin').value.trim()};
  if(!lot.name)return ferr(err,'Ingresa el nombre del lote','lotName');
  if(lot.whatsapp.length!==10)return ferr(err,'WhatsApp del lote debe tener 10 dígitos','lotWA');
  if(!/^\d{4}$/.test(lot.pin))return ferr(err,'PIN del lote debe tener 4 dígitos','lotPin');
  if(!document.getElementById('lotAuthorized').checked)return ferr(err,'Confirma que eres dueño o representante autorizado del lote');
  const valid=lotRows.filter(r=>!lotIssues(r).length).slice(0,50);
  if(!valid.length)return ferr(err,'No hay autos válidos para enviar. Revisa marca, modelo, año y precio.');
  err.style.display='none';btn.disabled=true;btn.innerHTML='<div class="spin"></div> Enviando a revisión…';
  try{
    const r=await fetch('/.netlify/functions/seller-program-intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lot,listings:valid,authorized:true})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.ok)throw new Error(d.error||`HTTP ${r.status}`);
    lotMsg(`${d.inserted} autos enviados a revisión · ${d.needs_photos||0} necesitan fotos · ${d.skipped||0} omitidos`, 'ok');
    showToast('Inventario de lote recibido para revisión','success');
    await loadCars();
  }catch(e){ferr(err,e.message||'No pude enviar el inventario');}
  finally{btn.disabled=false;btn.textContent='Enviar a revisión →'}
}

// ── SELL ──
function openSell(pre={}){
  step=1;uploadedImgs=[];selPlan='basic';
  document.querySelectorAll('.field-error').forEach(n=>n.remove());
  if(pre.make)document.getElementById('sMake').value=pre.make||'';
  if(pre.model)document.getElementById('sModel').value=pre.model||'';
  if(pre.year)document.getElementById('sYear').value=pre.year||'';
  if(pre.price)document.getElementById('sPrice').value=pre.price||'';
  ['sp1','sp2','sp3'].forEach((id,i)=>{document.getElementById(id).style.display=i===0?'':'none'});
  ['st1','st2','st3'].forEach((id,i)=>{document.getElementById(id).className='stab'+(i===0?' active':'')});
  document.getElementById('btnBack').style.display='none';
  document.getElementById('btnNext').textContent='Siguiente →';
  document.getElementById('e1').style.display='none';
  document.getElementById('e3').style.display='none';
  renderPhotoGrid();plans = plans.length ? withBasicPlan(plans) : [...DEFAULT_PLANS];renderPlanCards();loadPlans();openO('sellOv');scrollSellModalTop();
}
function stepNext(){
  if(step===1){
    const make=document.getElementById('sMake').value.trim();
    const model=document.getElementById('sModel').value.trim();
    const yr=parseInt(document.getElementById('sYear').value);
    const pr=parseFloat(document.getElementById('sPrice').value);
    const e=document.getElementById('e1');
    if(!make)return ferr(e,'Ingresa la marca del auto','sMake');
    if(!model)return ferr(e,'Ingresa el modelo del auto','sModel');
    if(!yr||yr<1980)return ferr(e,'Ingresa un año válido, desde 1980','sYear');
    if(!pr||pr<1000)return ferr(e,'Ingresa un precio válido, mínimo $1,000 MXN','sPrice');
    e.style.display='none';goStep(2);
  }else if(step===2){
    const st=document.getElementById('upStat');
    if(uploadedImgs.length<1){ if(st){st.innerHTML='<span style="color:var(--danger);font-weight:700">Sube al menos 1 foto real del auto para revisión.</span>';} showToast('Falta al menos 1 foto real del auto','error'); return; }
    goStep(3)
  }
  else doPublish();
}
function stepBack(){if(step>1)goStep(step-1)}
function goStep(n){
  document.getElementById('sp'+step).style.display='none';
  document.getElementById('st'+step).className='stab done';
  step=n;
  document.getElementById('sp'+n).style.display='';
  document.getElementById('st'+n).className='stab active';
  document.getElementById('btnBack').style.display=n>1?'':'none';
  document.getElementById('btnNext').textContent=n===3?publishButtonLabel():'Siguiente →';
  if(n===3){plans = plans.length ? withBasicPlan(plans) : [...DEFAULT_PLANS];renderPlanCards();updatePublishButton();}
  scrollSellModalTop();
}
function ferr(el,msg,fieldId){
  el.style.display='';
  el.textContent=msg;
  document.querySelectorAll('.field-error').forEach(n=>n.remove());
  if(fieldId){
    const f=document.getElementById(fieldId);
    if(f){
      const wrap=f.closest('.fg');
      if(wrap){
        const fe=document.createElement('div');
        fe.className='field-error';
        fe.textContent=msg;
        wrap.appendChild(fe);
      }
      f.focus({preventScroll:true});f.scrollIntoView({block:'center',behavior:'smooth'});
    }
  }
  showToast(msg,'error');
}

// PHOTOS
function photoLimitForSelectedPlan(){
  const selected=plans.find(plan=>plan&&plan.key===selPlan)||BASIC_PLAN;
  return Math.min(MAX_LISTING_PHOTOS,Math.max(1,Number(selected.max_photos||BASIC_PLAN.max_photos)));
}
function renderPhotoGrid(){
  const limit=photoLimitForSelectedPlan();
  let h='';
  for(let i=0;i<limit;i++){
    if(i<uploadedImgs.length)h+=`<div class="pslot"><img src="${uploadedImgs[i]}"><button class="prm" onclick="rmPhoto(${i})">✕</button></div>`;
    else if(i===uploadedImgs.length)h+=`<div class="pslot" onclick="document.getElementById('photoInput').click()"><span style="font-size:1.2rem">📷</span><span>Agregar</span></div>`;
    else h+=`<div class="pslot" style="opacity:.2">📷</div>`;
  }
  document.getElementById('photoGrid').innerHTML=h;
}
function rmPhoto(i){uploadedImgs.splice(i,1);renderPhotoGrid()}
// v66: compresión iterativa GARANTIZADA <5MB para Supabase Storage.
// Acepta hasta 25MB (cualquier foto). Si la primera pasada no baja a <5MB
// reintenta con menos calidad/tamaño hasta caber. Usado típico:
//   foto 12MB DSLR → 1ra pasada (1600px @ 0.82) → 800KB → sube
//   foto 22MB profesional → 1ra (6.2MB) → 2da (1280px @ 0.7) → 2.1MB → sube
//   foto 40MB extrema → 3 pasadas → 1.4MB → sube
const SUPABASE_MAX_BYTES = 5 * 1024 * 1024 - 64*1024; // 5MB con margen de 64KB
async function compressOnce(file, maxWidth, quality){
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if(w > maxWidth){ h = Math.round(h * maxWidth / w); w = maxWidth; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => {
          if(!blob){ resolve(null); return; }
          const compressed = new File([blob], file.name.replace(/\.(png|webp|heic|heif|tiff?)$/i, '.jpg'), { type:'image/jpeg', lastModified: Date.now() });
          resolve(compressed);
        }, 'image/jpeg', quality);
      };
      img.onerror = () => resolve(null);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
async function compressImage(file){
  // Si ya está chiquito y es JPEG, lo dejamos pasar tal cual
  if(file.size <= 1024*1024 && /jpeg|jpg/i.test(file.type)) return file;
  // 3 pasadas decrecientes hasta caber en Supabase
  const passes = [
    { maxWidth: 1600, quality: 0.82 },
    { maxWidth: 1280, quality: 0.70 },
    { maxWidth: 1024, quality: 0.60 },
    { maxWidth:  800, quality: 0.55 } // último recurso para fotos extremas
  ];
  let best = null;
  for(const p of passes){
    const out = await compressOnce(file, p.maxWidth, p.quality);
    if(!out) continue;
    best = out;
    if(out.size <= SUPABASE_MAX_BYTES) return out;
  }
  // Si ni la 4ta pasada cupo, devolvemos la mejor (aún si es >5MB,
  // el handler superior la rechaza con mensaje claro)
  return best || file;
}
async function handlePhotos(ev){
  const available=Math.max(0,photoLimitForSelectedPlan()-uploadedImgs.length);
  const incoming=Array.from(ev.target.files);
  const files=incoming.slice(0,available);
  if(incoming.length>files.length)showToast(`Puedes subir hasta ${photoLimitForSelectedPlan()} fotos con este plan.`,'error');
  if(!files.length){ev.target.value='';return}
  document.getElementById('upStat').textContent=`Optimizando ${files.length} foto(s)…`;
  for(const f of files){
    if(f.size>40*1024*1024){showToast('Foto demasiado grande (>40MB). Usa una foto del celular o reduce tamaño.','error');continue}
    const isImage = /^image\//i.test(f.type||'') || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(f.name||'');
    if(!isImage){showToast('Solo fotos (JPG/PNG/WebP)','error');continue}
    let toUpload = f;
    try{
      document.getElementById('upStat').textContent=`Optimizando foto (${(f.size/1024/1024).toFixed(1)}MB)…`;
      toUpload = await compressImage(f);
    }catch(err){console.warn('compresión falló, subiendo original',err);}
    // Si después de 4 pasadas la foto sigue siendo >5MB, no intentamos subir
    // (Supabase rechaza con 413). Aviso claro al usuario.
    if(toUpload.size > SUPABASE_MAX_BYTES){
      const mb=(toUpload.size/1024/1024).toFixed(1);
      showToast(`Esa foto pesa ${mb}MB y no logró bajar a 5MB. Toma una nueva foto desde el celular.`,'error');
      continue;
    }
    const ext = (toUpload.type==='image/jpeg' ? 'jpg' : (toUpload.name.split('.').pop()||'jpg').toLowerCase());
    const path=`pending-review/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const client=getDb(); if(!client){showToast('Supabase aún no cargó','error');break}
    const{error}=await client.storage.from('marketplace-images').upload(path,toUpload,{upsert:false, contentType: toUpload.type||'image/jpeg'});
    if(error){
      console.error('upload error',error);
      const msg=String(error.message||'').toLowerCase();
      if(msg.includes('payload')||msg.includes('large')||msg.includes('413')) showToast('Foto rechazada por tamaño. Toma una nueva desde el celular.','error');
      else showToast('Error al subir foto: '+(error.message||'sin detalle'),'error');
      continue;
    }
    const{data:{publicUrl}}=client.storage.from('marketplace-images').getPublicUrl(path);
    uploadedImgs.push(publicUrl);
  }
  renderPhotoGrid();ev.target.value='';
  document.getElementById('upStat').textContent=uploadedImgs.length?`✅ ${uploadedImgs.length} foto(s) lista(s)`:'';
}

// PLANS
async function loadPlans(){
  // Fallback local inmediato: evita que el modal se quede en "Cargando…" si Netlify/Supabase tarda o falla.
  plans=[...DEFAULT_PLANS];
  renderPlanCards();
  renderPlansBody();
  try{
    const r=await fetch('/.netlify/functions/get-pricing',{cache:'no-store'});
    if(!r.ok)throw new Error('pricing '+r.status);
    const data=await r.json();
    if(Array.isArray(data)&&data.length){plans=withBasicPlan(data);renderPlanCards();renderPlansBody();updatePublishButton()}
  }catch(err){console.warn('Usando planes locales por fallback',err)}
}
function planBullets(p,compact=false){
  if(p.key==='basic')return `<li>${p.max_photos} fotos</li><li>${p.active_days} días activo</li><li>Gratis</li><li>Revisión humana antes de publicar</li><li>Contacto directo por WhatsApp</li>`;
  if(p.key==='featured')return `<li>20 fotos</li><li>60 días activo</li><li>Tixuz Destacado en resultados</li><li>Pago único · sin renovación</li>`;
  return `<li>Hasta 20 autos activos</li><li>20 fotos por auto</li><li>2 autos Destacados a la vez</li><li>Perfil y control de inventario</li><li>Archivo, lista o WhatsApp para ingresar autos</li>`;
}
function planPriceSuffix(p){return p.interval_type==='recurring'?' MXN/mes':' MXN · pago único'}
function planVisual(p){
  if(p.key==='basic')return `<div class="plan-visual plan-visual-basic" style="background-image:url('https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=700&q=75')"><span class="plan-visual-label">Incluye 5 fotos</span></div>`;
  if(p.key==='featured')return `<div class="plan-visual" style="background-image:url('https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=900&q=80')"><span class="plan-visual-label">Así se verá tu anuncio</span></div>`;
  if(p.key==='pro')return `<div class="plan-visual plan-collage"><i></i><i></i><i></i><i></i><i></i><b>+15 autos</b></div>`;
  return '';
}
function renderPlanCards(){
  const c=document.getElementById('planCards');
  if(!plans.length)plans=[...DEFAULT_PLANS];
  plans=withBasicPlan(plans);
  if(!plans.some(p=>p.key===selPlan))selPlan=plans[0]?.key||'basic';
  if(!plans.length){c.innerHTML='<div style="color:var(--text3);grid-column:1/-1;text-align:center">Sin planes</div>';return}
  c.innerHTML=plans.map(p=>{
    const soon=planIsComingSoon(p);
    return `<div class="pcard ${p.key===selPlan?'sel':''}${soon?' soon':''}"${soon?' aria-disabled="true"':` onclick="selPlanFn('${escJS(p.key)}')"`}>
    ${planVisual(p)}
    <h4>${escHTML(p.name)}</h4>
    <div class="pp">$${Number(p.price_mxn)||0}<sub>${p.key==='basic'?' MXN · gratis':planPriceSuffix(p)}</sub></div>
    ${soon?'<div class="soon-badge">Próximamente</div>':''}
    <ul>${planBullets(p,true)}</ul>
  </div>`}).join('');
  updatePublishButton();
}
function selPlanFn(k){
  const p=plans.find(x=>x&&x.key===k);
  if(planIsComingSoon(p)){showToast('Ese plan estará disponible próximamente. Por lanzamiento, publicar es gratis.','success');return}
  selPlan=k;renderPlanCards();updatePublishButton()
}
function renderPlansBody(){
  const planList = withBasicPlan((plans && plans.length) ? plans : DEFAULT_PLANS);
  document.getElementById('plansBody').innerHTML=`<div class="pcards">${planList.map(p=>`<div class="pcard${planIsComingSoon(p)?' soon':''}">
    ${planVisual(p)}
    <h4>${p.name}</h4>
    <div class="pp">$${p.price_mxn}<sub>${p.key==='basic'?' MXN · gratis':planPriceSuffix(p)}</sub></div>
    ${planIsComingSoon(p)?'<div class="soon-badge">Próximamente</div>':''}
    <ul>${planBullets(p)}</ul>
  </div>`).join('')}</div><div class="detail-note" style="margin-top:14px"><strong style="color:var(--text)">Publicar es gratis por lanzamiento.</strong> Destacado y PRO Lote están en preparación: no se activa ningún cobro ni suscripción todavía. Tixuz no recibe ni custodia el pago del vehículo.</div>`;
}
function openPlans(){plans = plans.length ? withBasicPlan(plans) : [...DEFAULT_PLANS];renderPlansBody();openO('plansOv')}

function normalizeCreateListingResult(data){
  let result=Array.isArray(data)?data[0]:data;
  if(typeof result==='string'){
    try{result=JSON.parse(result)}catch{}
  }
  return result&&typeof result==='object'?result:{};
}
function rememberPublishPin({listingId,wa,pin}){
  sessionStorage.setItem('tp_lid',listingId||'');
  sessionStorage.setItem('tp_wa',wa);
  sessionStorage.setItem('tp_pin',pin);
  try{
    const key='tixuz_publish_credentials';
    const saved=JSON.parse(localStorage.getItem(key)||'[]');
    const rows=Array.isArray(saved)?saved.filter(x=>x&&x.listing_id!==listingId):[];
    rows.unshift({listing_id:listingId,whatsapp:wa,pin,saved_at:new Date().toISOString()});
    localStorage.setItem(key,JSON.stringify(rows.slice(0,10)));
  }catch(err){console.warn('No se pudo guardar el PIN localmente',err)}
}
function showPendingReviewSuccess({listingId,wa,pin}){
  rememberPublishPin({listingId,wa,pin});
  const idEl=document.getElementById('publishSuccessId');
  if(idEl)idEl.textContent=listingId||'';
  const waEl=document.getElementById('mlWA');
  const pinEl=document.getElementById('mlPin');
  if(waEl)waEl.value=wa;
  if(pinEl)pinEl.value=pin;
  closeO('sellOv');
  if(document.getElementById('publishSuccessOv'))openO('publishSuccessOv');
  else showToast('✅ ¡Listo! Tu anuncio se envió a revisión. En cuanto lo aprobemos (usualmente pocas horas) aparecerá publicado. Te avisamos por WhatsApp.','success');
}
async function createBasicListing(listingData){
  const client=getDb();
  if(!client)throw new Error('Supabase aún no cargó. Intenta de nuevo.');
  const {data,error}=await client.rpc('create_listing',{
    p_make:listingData.make,
    p_model:listingData.model,
    p_year:Number(listingData.year),
    p_price:Number(listingData.price),
    p_mileage:Number(listingData.mileage||0),
    p_transmission:listingData.transmission||'Automática',
    p_fuel_type:listingData.fuel_type||'Gasolina',
    p_color:listingData.color||'Sin especificar',
    p_location:listingData.location||'México',
    p_description:listingData.description||'',
    p_images:Array.isArray(listingData.images)?listingData.images:[],
    p_seller_name:listingData.seller_name,
    p_seller_whatsapp:listingData.seller_whatsapp,
    p_seller_type:listingData.seller_type||'Particular',
    p_plan:'basic',
    p_pin:String(listingData.pin||''),
  });
  if(error)throw error;
  return normalizeCreateListingResult(data);
}

async function doPublish(){
  const name=document.getElementById('sName').value.trim();
  const wa=document.getElementById('sWA').value.replace(/\D/g,'');
  const pin=document.getElementById('sPin').value;
  const e=document.getElementById('e3');
  if(!name)return ferr(e,'Ingresa tu nombre','sName');
  if(wa.length!==10)return ferr(e,'WhatsApp debe tener 10 dígitos','sWA');
  if(!/^\d{4}$/.test(pin))return ferr(e,'El PIN debe tener exactamente 4 dígitos','sPin');
  e.style.display='none';
  const btn=document.getElementById('btnNext');
  btn.disabled=true;btn.innerHTML=selPlan==='basic'?'<div class="spin"></div> Enviando a revisión…':'<div class="spin"></div> Conectando con Stripe…';
  const listingData={
    make:document.getElementById('sMake').value.trim(),
    model:document.getElementById('sModel').value.trim(),
    year:parseInt(document.getElementById('sYear').value),
    price:parseFloat(document.getElementById('sPrice').value),
    mileage:parseInt(document.getElementById('sMileage').value)||0,
    transmission:document.getElementById('sTrans').value,
    fuel_type:document.getElementById('sFuel').value,
    color:document.getElementById('sColor').value||'Sin especificar',
    location:document.getElementById('sLoc').value||'México',
    description:document.getElementById('sDesc').value,
    images:uploadedImgs,
    seller_name:name,seller_whatsapp:wa,
    seller_type:document.getElementById('sType').value,pin,
  };
  if(selPlan==='basic'){
    try{
      const d=await createBasicListing(listingData);
      if(!d.ok)throw new Error(d.error||'No se pudo crear el anuncio');
      if(d.free!==true||d.status!=='pending_review'){
        throw new Error(`Respuesta inesperada al publicar gratis (${d.status||'sin status'})`);
      }
      showPendingReviewSuccess({listingId:d.listing_id,wa,pin});
      btn.disabled=false;btn.textContent=publishButtonLabel();
      return;
    }catch(err){
      const msg=err?.message||'Error de conexión al publicar gratis.';
      showPayFailure(e,btn,msg);return;
    }
  }

  try{
    const selectedPlan=plans.find(p=>p.key===selPlan);
    if(!selectedPlan||!selectedPlan.stripe_price_id){
      showPayFailure(e,btn,'Este plan de pago no tiene un precio de Stripe configurado.');return
    }
    const ctrl = new AbortController();
    const tid = setTimeout(()=>ctrl.abort(), 12000);
    const r=await fetch('/.netlify/functions/create-checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({listingData,plan:selPlan,stripe_price_id:selectedPlan.stripe_price_id}),signal:ctrl.signal});
    clearTimeout(tid);
    const txt = await r.text();
    let d={};
    try{d=txt?JSON.parse(txt):{}}catch{
      const low=(txt||'').toLowerCase();
      d={error: low.includes('<!doctype')||low.includes('<html') ? 'La función create-checkout no está respondiendo como función Netlify. Revisa Deploy log / Functions.' : (txt||'Respuesta inválida del servidor')};
    }
    if(!r.ok||d.error||!d.url){
      showPayFailure(e,btn,d.error||`Error al procesar el pago (HTTP ${r.status})`);return
    }
    rememberPublishPin({listingId:d.listing_id||'',wa,pin});
    window.location.href=d.url;
  }catch(err){
    const msg = err && err.name==='AbortError' ? 'La función de pago tardó demasiado. Ya no se queda colgado: revisa Functions log de create-checkout.' : 'Error de conexión al crear el pago. Revisa Functions log de create-checkout.';
    showPayFailure(e,btn,msg);
  }
}

async function handleReturn(){
  const p=new URLSearchParams(window.location.search);

  if(p.has('payment_cancelled')){
    window.history.replaceState({},'','/');
    showToast('Pago cancelado. Tu anuncio quedó pendiente de pago.','error');
    return;
  }

  if(!p.has('payment_success'))return;

  const sid=p.get('session_id')||'';
  const lid=p.get('listing_id')||sessionStorage.getItem('tp_lid')||'';
  const wa=sessionStorage.getItem('tp_wa')||'';
  const pin=sessionStorage.getItem('tp_pin')||'';

  window.history.replaceState({},'','/');
  showToast('⏳ Confirmando pago con Stripe…','success');

  let confirmed=false;
  if(sid&&lid){
    try{
      const r=await fetch('/.netlify/functions/confirm-checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:sid,listing_id:lid})});
      const txt=await r.text();
      let d={};
      try{d=txt?JSON.parse(txt):{}}catch{d={error:txt||'Respuesta inválida de confirm-checkout'}}
      if(r.ok&&d.ok){
        confirmed=true;
        showToast('🎉 Pago confirmado. Tu anuncio quedó en revisión manual antes de publicarse.','success');
        await loadCars();
      }else{
        showToast(d.error||'Pago detectado, pero no pude activar el anuncio. Revisa Functions log de confirm-checkout.','error');
      }
    }catch(err){
      showToast('Pago detectado, pero falló la confirmación. Revisa Functions log de confirm-checkout.','error');
    }
  }else{
    showToast('Regresaste de Stripe, pero falta session_id/listing_id para confirmar.','error');
  }

  if(wa)document.getElementById('mlWA').value=wa;
  if(pin)document.getElementById('mlPin').value=pin;
  if(confirmed&&wa&&pin){
    openMyListings();
    setTimeout(loadML,350);
  }
  sessionStorage.removeItem('tp_lid');
}

// MY LISTINGS
function openMyListings(){
  document.getElementById('mlRes').innerHTML='';
  document.getElementById('mlerr').style.display='none';
  openO('myOv')
}
async function loadML(){
  const wa=document.getElementById('mlWA').value.replace(/\D/g,'');
  const pin=document.getElementById('mlPin').value;
  const e=document.getElementById('mlerr');const r=document.getElementById('mlRes');
  if(wa.length!==10)return ferr(e,'WhatsApp 10 dígitos');
  if(!/^\d{4}$/.test(pin))return ferr(e,'PIN 4 dígitos');
  e.style.display='none';r.innerHTML='<div style="color:var(--text3)">Buscando…</div>';
  const ctrl=new AbortController();
  const tid=setTimeout(()=>ctrl.abort(),10000);
  try{
    const resp=await fetch('/.netlify/functions/my-listings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({whatsapp:wa,pin}),signal:ctrl.signal});
    clearTimeout(tid);
    const txt=await resp.text();
    let d={};
    try{d=txt?JSON.parse(txt):{}}catch{d={ok:false,error:txt||'Respuesta inválida'}}
    const data=Array.isArray(d.listings)?d.listings:(Array.isArray(d)?d:[]);
    if(!resp.ok||d.ok===false){
      r.innerHTML=`<div style="text-align:center;padding:14px"><p style="color:var(--danger);font-weight:700">${escHTML(d.error||'No pude consultar tus anuncios')}</p><p style="color:var(--gold);font-size:.76rem;margin-top:3px">Revisa Functions log de my-listings</p></div>`;
      return;
    }
    if(!data.length){
      r.innerHTML='<div style="text-align:center;padding:14px"><p style="color:var(--danger);font-weight:700">No encontré anuncios</p><p style="color:var(--gold);font-size:.76rem;margin-top:3px">Verifica WhatsApp y PIN</p></div>';
      return;
    }
    const ownedCars=data.map(cacheCar);
    mergeCars(ownedCars);
    r.innerHTML=ownedCars.map(l=>{
      const sid=escJS(l.id);
      const sidAttr=escAttr(l.id);
      const img=l.images?.[0]?`<img src="${l.images[0]}" style="width:50px;height:50px;object-fit:cover;border-radius:5px">`:`<div style="width:50px;height:50px;background:var(--bg4);border-radius:5px;display:flex;align-items:center;justify-content:center">🚗</div>`;
      const inReview=(l.status==='pending_review'||l.manual_review===true||(l.status==='pending_payment'&&(l.payment_status==='paid'||l.payment_status==='not_required'||l.verification_badge==='manual_review')));
      const sc=inReview?'sp':({active:'sa',pending_payment:'sp',paused:'ss',sold:'ss'}[l.status]||'ss');
      const sl=inReview?'En revisión':({active:'Activo',pending_payment:'Pend. pago',pending_review:'En revisión',paused:'Pausado',sold:'Vendido',expired:'Expirado'}[l.status]||l.status);
      return`<div class="lrow" style="cursor:pointer" data-detail-id="${sidAttr}">${img}<div class="lrow-info"><div class="lrow-t">${l.year} ${l.make} ${l.model}</div><div class="lrow-m">${Number(l.price).toLocaleString('es-MX')} · ${planNameForListing(l)}</div></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <span class="lrow-s ${sc}">${sl}</span>
        <div style="display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn btn-ghost" style="padding:2px 6px;font-size:.68rem" data-detail-id="${sidAttr}">👁 Ver</button>
          ${l.status==='active'?`<button class="btn btn-ghost" style="padding:2px 6px;font-size:.68rem" onclick="event.stopPropagation();manageL('${sid}','${wa}','${pin}','pause')">⏸</button>`:''}
          ${l.status==='paused'?`<button class="btn btn-ghost" style="padding:2px 6px;font-size:.68rem" onclick="event.stopPropagation();manageL('${sid}','${wa}','${pin}','resume')">▶</button>`:''}
          <button class="btn btn-danger" style="padding:2px 6px;font-size:.68rem" onclick="event.stopPropagation();if(confirm('¿Eliminar?'))manageL('${sid}','${wa}','${pin}','delete')">🗑</button>
        </div>
      </div></div>`;
    }).join('');
  }catch(err){
    clearTimeout(tid);
    r.innerHTML='<div style="text-align:center;padding:14px"><p style="color:var(--danger);font-weight:700">La consulta tardó demasiado o falló</p><p style="color:var(--gold);font-size:.76rem;margin-top:3px">Ya no se queda colgado. Revisa Functions log de my-listings.</p></div>';
  }
}
async function manageL(id,wa,pin,action){
  try{
    const r=await fetch('/.netlify/functions/manage-listing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({listing_id:id,whatsapp:wa,pin,action})});
    const d=await r.json();
    if(d.ok){showToast('✅ Listo','success');loadML();loadCars()}else showToast(d.error||'Error','error');
  }catch{showToast('No respondió manage-listing','error')}
}

// ADMIN
function openAdmin(){
  if(adminTok){renderAdminPanel();openO('adminOv');return}
  document.getElementById('adminBody').innerHTML=`<div class="fg"><label>Contraseña</label><input id="adminPwd" type="password" onkeydown="if(event.key==='Enter')loginAdmin()"></div><div class="ferr" id="adminErr"></div><button class="btn btn-primary" onclick="loginAdmin()">Entrar</button>`;
  openO('adminOv');
}
async function loginAdmin(){
  const pwd=document.getElementById('adminPwd').value;
  const e=document.getElementById('adminErr');
  const r=await fetch('/.netlify/functions/admin-auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pwd})});
  const d=await r.json();
  if(!r.ok||d.error)return ferr(e,d.error||'Contraseña incorrecta');
  adminTok=d.token;sessionStorage.setItem('ta_tok',adminTok);renderAdminPanel();
}
async function renderAdminPanel(){
  document.getElementById('adminBody').innerHTML='<div style="padding:20px;text-align:center;color:var(--text3)">Cargando…</div>';
  const r=await fetch('/.netlify/functions/admin-data',{headers:{'Authorization':`Bearer ${adminTok}`}});
  if(r.status===401){adminTok='';sessionStorage.removeItem('ta_tok');openAdmin();return}
  const data=await r.json();
  const listings=Array.isArray(data.listings)?data.listings:[];
  const ps=Array.isArray(data.plans)?data.plans:[];
  const adminDataError=data.error||"";
  (Array.isArray(listings)?listings:[]).forEach(l=>{try{cacheCar(l)}catch{}});
  const isReview=l=>l.status==='pending_review'||l.manual_review===true||(l.status==='pending_payment'&&(l.payment_status==='paid'||l.payment_status==='not_required'||l.verification_badge==='manual_review'));
  const review=listings.filter(isReview);
  const tot=listings.length,act=listings.filter(l=>l.status==='active').length,pnd=listings.filter(l=>l.status==='pending_payment'&&!isReview(l)).length,paid=listings.filter(l=>l.payment_status==='paid').length;
  document.getElementById('adminBody').innerHTML=`
    ${adminDataError?`<div style="border:1px solid rgba(239,68,68,.45);background:rgba(239,68,68,.08);border-radius:12px;padding:10px;margin-bottom:12px;color:#fecaca;font-size:.82rem">${escHTML(adminDataError)}</div>`:""}<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px">
      ${[['Total',tot,'#3b82f6'],['Activos',act,'#10b981'],['Revisión',review.length,'#f59e0b'],['Pagados',paid,'#8b5cf6']].map(([l,v,c])=>`<div style="background:var(--bg3);border-radius:8px;padding:9px;text-align:center"><div style="font-size:1.3rem;font-weight:800;color:${c}">${v}</div><div style="font-size:.68rem;color:var(--text3)">${l}</div></div>`).join('')}
    </div>
    <div style="border:1px solid rgba(245,158,11,.35);background:rgba(245,158,11,.08);border-radius:12px;padding:10px;margin-bottom:12px;color:var(--text2);font-size:.82rem;line-height:1.35"><strong style="color:var(--gold)">Revisión interna simple.</strong><br>Sin WhatsApp API ni email externo. Entra con <b>?admin=1</b>, revisa fotos/datos y toca <b>Sí, autorizar</b> o <b>No, rechazar</b>.</div><div class="atabs"><button class="atab active" onclick="showAtab('r',this)">Revisión ${review.length?`(${review.length})`:''}</button><button class="atab" onclick="showAtab('l',this)">Anuncios</button><button class="atab" onclick="showAtab('p',this)">Planes</button><button class="atab" onclick="showAtab('i',this)">Importar inventario</button></div>
    <div id="at_r">
      ${review.length?review.slice(0,50).map(l=>`<div style="border:1px solid var(--border);background:var(--bg2);border-radius:12px;padding:10px;margin-bottom:10px">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="display:flex;gap:5px;overflow-x:auto;max-width:190px">${(Array.isArray(l.images)?l.images:[]).slice(0,4).map(u=>`<a href="${escAttr(u)}" target="_blank" rel="noopener"><img src="${escAttr(u)}" style="width:64px;height:50px;object-fit:cover;border-radius:8px;border:1px solid var(--border)"></a>`).join('')||'<div style="width:64px;height:50px;background:var(--bg4);border-radius:8px;display:flex;align-items:center;justify-content:center">🚗</div>'}</div>
          <div style="flex:1;min-width:0"><strong>${l.year||''} ${escHTML(l.make||'')} ${escHTML(l.model||'')}</strong><br><small style="color:var(--text3)">${escHTML(l.location||'México')} · ${escHTML(l.seller_name||'')} · ${escHTML(l.seller_whatsapp||'')}</small><br><small style="color:var(--gold)">${l.payment_status==='paid'?'Pagado':'Gratis lanzamiento'} · esperando autorización</small></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <button class="btn btn-green" style="flex:1;justify-content:center" onclick="adminAct('${escJS(l.id)}','approve')">Sí, autorizar</button>
          <button class="btn btn-danger" style="flex:1;justify-content:center" onclick="adminAct('${escJS(l.id)}','reject')">No, rechazar</button>
          <button class="btn btn-ghost" style="flex:1;justify-content:center" data-detail-id="${escAttr(l.id)}">Ver ficha</button>
        </div>
      </div>`).join(''):'<div style="border:1px dashed var(--border);border-radius:12px;padding:18px;text-align:center;color:var(--text3)">No hay autos esperando autorización.</div>'}
    </div>
    <div id="at_l" style="display:none;overflow-x:auto">
      <table class="atable"><thead><tr><th>Auto</th><th>Plan</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
      ${listings.slice(0,100).map(l=>`<tr>
        <td>${l.year||''} ${l.make||''} ${l.model||''}<br><small style="color:var(--text3)">${l.seller_name||''}</small></td>
        <td><span style="background:var(--bg4);padding:1px 5px;border-radius:4px;font-size:.68rem">${l.plan}</span></td>
        <td><span class="lrow-s ${isReview(l)?'sp':({active:'sa',pending_payment:'sp',paused:'ss',sold:'ss'}[l.status]||'ss')}">${isReview(l)?'en revisión':l.status}</span></td>
        <td style="display:flex;gap:3px">
          ${isReview(l)?`<button class="btn btn-green" style="padding:2px 7px;font-size:.68rem" onclick="adminAct('${escJS(l.id)}','approve')">Autorizar</button><button class="btn btn-danger" style="padding:2px 7px;font-size:.68rem" onclick="adminAct('${escJS(l.id)}','reject')">Rechazar</button>`:`<button class="btn btn-green" style="padding:2px 7px;font-size:.68rem" onclick="adminAct('${escJS(l.id)}','activate')">Activar</button><button class="btn btn-danger" style="padding:2px 7px;font-size:.68rem" onclick="adminAct('${escJS(l.id)}','delete')">Del</button>`}
        </td>
      </tr>`).join('')}
      </tbody></table>
    </div>
    <div id="at_p" style="display:none">
      <table class="atable"><thead><tr><th>Plan</th><th>Precio</th><th>Stripe ID</th></tr></thead><tbody>${(ps||[]).map(p=>`<tr><td>${p.name}</td><td>$${p.price_mxn} MXN</td><td style="font-size:.68rem;color:var(--text3)">${p.stripe_price_id||'—'}</td></tr>`).join('')}</tbody></table>
    </div>
    <div id="at_i" style="display:none">
      <div style="border:1px solid var(--border);background:rgba(59,130,246,.08);border-radius:12px;padding:12px;margin-bottom:12px;color:var(--text2);font-size:.82rem;line-height:1.45">
        <strong style="color:var(--text)">Importador de inventario real autorizado.</strong><br>
        Pega un CSV de agencias, lotes o vendedores que te autorizaron publicar. No usa scraping masivo ni copia inventario ajeno. Los autos importados quedan activos por lanzamiento, sin cobro, y aparecen antes que el inventario inicial.
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <input id="importCsvFile" type="file" accept=".csv,text/csv" style="font-size:.78rem;color:var(--text2);max-width:260px">
        <button class="btn btn-ghost" style="font-size:.75rem" onclick="fillImportExample()">Ver ejemplo</button>
        <a class="btn btn-ghost" style="font-size:.75rem;text-decoration:none" href="plantilla-inventario-tixuz.csv" download>Descargar plantilla</a>
      </div>
      <div class="fg"><label>CSV autorizado</label><textarea id="importCsvText" rows="8" placeholder="make,model,year,price,mileage,transmission,fuel_type,color,location,description,images,seller_name,seller_whatsapp,seller_type,plan,featured,source_url"></textarea></div>
      <label style="display:flex;gap:8px;align-items:flex-start;font-size:.75rem;color:var(--text2);line-height:1.35;margin:8px 0 12px">
        <input id="importAuthOk" type="checkbox" style="margin-top:2px"> Confirmo que este inventario es propio, de agencia/lote o fue autorizado por el vendedor.
      </label>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="importInventoryCsv()">Importar autos reales gratis</button>
        <button class="btn btn-ghost" onclick="document.getElementById('importCsvText').value=''">Limpiar</button>
      </div>
      <div id="importResult" style="margin-top:10px;font-size:.78rem;color:var(--text2)"></div>
    </div>
    <div style="margin-top:12px"><button class="btn btn-ghost" style="font-size:.74rem" onclick="adminTok='';sessionStorage.removeItem('ta_tok');closeO('adminOv')">Cerrar sesión</button></div>`;
}
function showAtab(t,btn){document.querySelectorAll('.atab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');const rv=document.getElementById('at_r');if(rv)rv.style.display=t==='r'?'':'none';document.getElementById('at_l').style.display=t==='l'?'':'none';document.getElementById('at_p').style.display=t==='p'?'':'none';const im=document.getElementById('at_i');if(im)im.style.display=t==='i'?'':'none'}
async function adminAct(id,action){
  const r=await fetch('/.netlify/functions/admin-listings',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${adminTok}`},body:JSON.stringify({listing_id:id,action})});
  const d=await r.json();
  if(d.ok){showToast(action==='approve'?'✅ Anuncio autorizado':(action==='reject'?'Anuncio rechazado':'✅ Hecho'),'success');renderAdminPanel();loadCars()}else showToast(d.error||'Error','error');
}

// IMPORTADOR REAL AUTORIZADO (admin only)
function fillImportExample(){
  const t=document.getElementById('importCsvText');
  if(!t)return;
  t.value='make,model,year,price,mileage,transmission,fuel_type,color,location,description,images,seller_name,seller_whatsapp,seller_type,plan,featured,source_url\nNissan,Sentra SR,2021,335000,52000,Automática,Gasolina,Blanco,Guadalajara Jalisco,"Inventario autorizado por agencia. Factura original y servicios al día.","https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=1200",Autos Demo Agencia,5512345678,Agencia,basic,false,';
}
function splitCsvLine(line){
  const out=[];let cur='',q=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i],n=line[i+1];
    if(ch==='"'&&q&&n==='"'){cur+='"';i++;continue}
    if(ch==='"'){q=!q;continue}
    if(ch===','&&!q){out.push(cur.trim());cur='';continue}
    cur+=ch;
  }
  out.push(cur.trim());return out;
}
function parseCsv(text){
  const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l.trim());
  if(lines.length<2)return[];
  const headers=splitCsvLine(lines[0]).map(h=>normText(h).replace(/\s+/g,'_'));
  const aliases={marca:'make',modelo:'model',ano:'year',anio:'year',precio:'price',km:'mileage',kilometraje:'mileage',transmision:'transmission',combustible:'fuel_type',color:'color',ubicacion:'location',ciudad:'location',descripcion:'description',fotos:'images',imagenes:'images',foto:'images',image:'images',nombre_vendedor:'seller_name',vendedor:'seller_name',whatsapp:'seller_whatsapp',telefono:'seller_whatsapp',tipo_vendedor:'seller_type',tipo:'seller_type',plan:'plan',destacado:'featured',url:'source_url',link:'source_url',source_url:'source_url'};
  return lines.slice(1).map(line=>{
    const vals=splitCsvLine(line);const obj={};
    headers.forEach((h,i)=>{const k=aliases[h]||h;obj[k]=vals[i]||''});
    return obj;
  }).filter(o=>Object.values(o).some(v=>String(v||'').trim()));
}
async function importInventoryCsv(){
  const res=document.getElementById('importResult');
  const ok=document.getElementById('importAuthOk');
  if(!ok||!ok.checked){if(res)res.innerHTML='<span style="color:var(--danger)">Confirma que el inventario está autorizado.</span>';return}
  let text=document.getElementById('importCsvText')?.value||'';
  const file=document.getElementById('importCsvFile')?.files?.[0];
  if(file){text=await file.text();}
  const rows=parseCsv(text);
  if(!rows.length){if(res)res.innerHTML='<span style="color:var(--danger)">No encontré filas válidas. Usa la plantilla CSV.</span>';return}
  if(res)res.innerHTML='Importando '+rows.length+' autos…';
  try{
    const r=await fetch('/.netlify/functions/import-inventory',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${adminTok}`},body:JSON.stringify({listings:rows,authorized:true})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.ok){throw new Error(d.error||'No se pudo importar')}
    if(res)res.innerHTML=`<span style="color:var(--green);font-weight:700">Importados ${Number(d.inserted)||0} autos reales.</span>${d.skipped?` <span style="color:var(--gold)">${Number(d.skipped)||0} omitidos por datos incompletos.</span>`:''}`;
    showToast('Inventario importado','success');
    loadCars();renderAdminPanel();
  }catch(e){
    if(res)res.innerHTML='<span style="color:var(--danger)">'+escHTML(e.message||'Error importando')+'</span>';
    showToast('No se pudo importar inventario','error');
  }
}

// ═══════════════════════════════════════════════
//  🤖 AI ASESOR PREDICTIVO
// ═══════════════════════════════════════════════
const MARCAS=['Toyota','Honda','Nissan','Volkswagen','Mazda','Chevrolet','Ford','Kia','Hyundai','Audi','BMW','Mercedes-Benz','Tesla','Renault','Peugeot','Seat','Suzuki','Mitsubishi','Jeep','RAM','Dodge','Cadillac','Volvo','Porsche','MINI','Infiniti','Acura','Lexus'];
const MODELOS={
  Toyota:['Corolla','Camry','RAV4','Hilux','Yaris','Avanza','Fortuner','Land Cruiser','C-HR','GR86','Sequoia'],
  Honda:['Civic','CR-V','HR-V','Fit','Accord','Pilot','City','Odyssey'],
  Nissan:['Versa','Sentra','Altima','Frontier','NP300','X-Trail','Kicks','Murano','Pathfinder','GT-R'],
  Volkswagen:['Jetta','Golf','Tiguan','Polo','Passat','Amarok','T-Cross','Taos','ID.4'],
  Mazda:['Mazda3','Mazda6','CX-5','CX-30','CX-9','MX-5','BT-50'],
  Chevrolet:['Spark','Aveo','Cavalier','Trailblazer','Equinox','Silverado','Tahoe','Traverse','Blazer','Colorado'],
  Ford:['Fiesta','Focus','Fusion','Explorer','Escape','F-150','Ranger','Mustang','Bronco','EcoSport','Territory'],
  Kia:['Rio','Forte','Sportage','Sorento','Telluride','Seltos','EV6','Stinger','Soul'],
  Hyundai:['Accent','Elantra','Tucson','Santa Fe','Sonata','Creta','Kona','Ioniq 5'],
  BMW:['Serie 1','Serie 3','Serie 5','Serie 7','X1','X3','X5','M3','M5'],
  'Mercedes-Benz':['Clase A','Clase C','Clase E','Clase S','GLA','GLC','GLE','GLS','AMG GT'],
  Audi:['A1','A3','A4','A5','A6','Q3','Q5','Q7','Q8','RS5'],
  Tesla:['Model 3','Model Y','Model S','Model X','Cybertruck'],
  Jeep:['Wrangler','Cherokee','Grand Cherokee','Renegade','Compass'],
  RAM:['1500','2500','700','ProMaster'],
};
const COLORES=['Blanco','Negro','Gris','Plata','Rojo','Azul','Verde','Beige','Dorado','Naranja','Morado','Café'];
const CIUDADES=['Guadalajara, Jalisco','CDMX','Monterrey, NL','Puebla','Tijuana','Mérida','León, Gto','Querétaro','San Luis Potosí','Chihuahua','Hermosillo','Aguascalientes'];
// Precios base por marca (miles de pesos)
const BASE_PRICE={Toyota:280,Honda:270,Nissan:240,VW:260,Volkswagen:260,Mazda:300,BMW:580,Audi:620,'Mercedes-Benz':680,Tesla:750,Chevrolet:230,Ford:270,Kia:280,Hyundai:265,Jeep:480,RAM:520};

function suggestedPrice(marca,modelo,yr){
  const base=(BASE_PRICE[marca]||250);
  const delta=new Date().getFullYear()-yr;
  let p=Math.round(base*(1-Math.min(delta,10)*.07));
  // Ajuste por modelo premium
  if(['Hilux','Fortuner','Land Cruiser','F-150','Ranger','Silverado'].includes(modelo))p=Math.round(p*1.2);
  if(['Spark','Aveo','Yaris','Fit','Rio'].includes(modelo))p=Math.round(p*.75);
  return Math.max(p,80);
}

// Estados de conversación
const ESTADOS=['inicio','marca','modelo','anio','precio','km','color','ciudad','listo'];
let aiStep=0,aiData={},aiOpen=false;

function aiInit(){
  aiMsg('bot',`Hola, soy tu asesor de Tixuz.\n¿Buscas auto o quieres vender el tuyo? Puedes escribirme y te guío paso a paso.`);
  aiSuggShow(['Buscar auto','Publicar mi auto','¿Cuánto vale mi auto?','Toyota','Nissan','SUV familiar']);
}

function toggleAI(){
  aiOpen=!aiOpen;
  document.getElementById('aiPanel').classList.toggle('open',aiOpen);
  document.getElementById('aiFab').style.background=aiOpen
    ?'linear-gradient(135deg,#ef4444,#f59e0b)'
    :'linear-gradient(135deg,var(--accent),var(--purple))';
}
function openAI(){if(!aiOpen)toggleAI()}

function forceScrollBottom(el){
  if(!el) return;
  const run=()=>{el.scrollTop=el.scrollHeight;};
  requestAnimationFrame(run);
  setTimeout(run,60);
  setTimeout(run,220);
}
function scrollSellModalTop(){
  const m=document.querySelector('#sellOv .modal');
  if(m)requestAnimationFrame(()=>m.scrollTo({top:0,behavior:'smooth'}));
}
function showPayFailure(el,btn,msg){
  ferr(el,msg);
  if(btn){btn.disabled=false;btn.textContent=publishButtonLabel()}
  showToast(msg,'error');
  setTimeout(()=>{
    try{el.scrollIntoView({behavior:'smooth',block:'center'});}catch{}
    const m=document.querySelector('#sellOv .modal');
    if(m)m.scrollTo({top:m.scrollHeight,behavior:'smooth'});
  },60);
}

function aiMsg(role,text){
  const c=document.getElementById('aiMsgs');
  const d=document.createElement('div');
  d.className=`ai-msg ${role}`;d.textContent=text;
  c.appendChild(d);forceScrollBottom(c);
  return d;
}
async function aiTyping(){
  const c=document.getElementById('aiMsgs');
  const d=document.createElement('div');
  d.id='aidots';d.className='aidots';
  d.innerHTML='<div class="aidot"></div><div class="aidot"></div><div class="aidot"></div>';
  c.appendChild(d);forceScrollBottom(c);
  await new Promise(r=>setTimeout(r,380));
  d.remove();
}
function aiSuggShow(list){
  const c=document.getElementById('aiSuggs');
  c.innerHTML=list.slice(0,6).map(s=>`<button class="aisg" onclick="aiPickSugg(this,'${s.replace(/'/g,"\\'")}')">${s}</button>`).join('');
}
function aiPickSugg(btn,val){
  if(/buscar auto|suv familiar/i.test(String(val))){
    if(aiOpen)toggleAI();
    setTimeout(()=>openSearchAI(),120);
    return;
  }
  document.getElementById('aiInp').value=val.replace(/^\$|,/g,'');
  aiSend();
}

// PREDICTIVE: mientras el usuario escribe, muestra sugerencias relevantes
function aiPredict(){
  const v=document.getElementById('aiInp').value.toLowerCase().trim();
  if(!v){aiSuggShow([]);return}
  if(aiStep===1){// marca
    const f=MARCAS.filter(m=>m.toLowerCase().startsWith(v)).slice(0,5);
    if(f.length)aiSuggShow(f);
  }else if(aiStep===2){// modelo
    const mods=MODELOS[aiData.marca]||[];
    const f=mods.filter(m=>m.toLowerCase().includes(v)).slice(0,5);
    if(f.length)aiSuggShow(f);
  }else if(aiStep===4){// km
    const opts=['5,000','10,000','20,000','30,000','50,000','80,000','120,000','200,000'].filter(k=>k.startsWith(v));
    if(opts.length)aiSuggShow(opts);
  }else if(aiStep===5){// color
    const f=COLORES.filter(c=>c.toLowerCase().startsWith(v));
    if(f.length)aiSuggShow(f);
  }else if(aiStep===6){// ciudad
    const f=CIUDADES.filter(c=>c.toLowerCase().includes(v));
    if(f.length)aiSuggShow(f);
  }
}

async function aiSend(){
  const inp=document.getElementById('aiInp');
  const val=inp.value.trim();
  if(!val)return;
  inp.value='';
  aiMsg('user',val);
  document.getElementById('aiSuggs').innerHTML='';
  await aiTyping();
  await aiRespond(val);
}

async function aiRespond(val){
  const low=val.toLowerCase();
    // ── INICIO — detecta marca directo ──
  if(aiStep===0){
    const matchMarca=MARCAS.find(m=>m.toLowerCase()===low)||MARCAS.find(m=>low.includes(m.toLowerCase()));
    if(matchMarca){
      aiData={marca:matchMarca};aiStep=2;
      const mods=(MODELOS[matchMarca]||[]).slice(0,8);
      aiMsg('bot',matchMarca+' 👍 ¿Cuál modelo?');
      aiSuggShow(mods.length?mods:['Otro modelo']);
      return;
    }
    if(low.includes('vale')||low.includes('precio')||low.includes('cuanto')){
      aiMsg('bot','¿Qué marca y modelo es?\nTe doy el precio estimado al instante 💰');
      aiStep=1;aiData={valuation:true};
      aiSuggShow(MARCAS.slice(0,8));
      return;
    }
    aiStep=1;aiData={};
    aiMsg('bot','¿Qué marca es tu auto?');
    aiSuggShow(MARCAS.slice(0,8));
    return;
  }
  // ── MARCA ──
  if(aiStep===1){
    const match=MARCAS.find(m=>m.toLowerCase()===low)||MARCAS.find(m=>m.toLowerCase().startsWith(low));
    aiData.marca=match||val;aiStep=2;
    const mods=(MODELOS[aiData.marca]||[]).slice(0,8);
    aiMsg('bot',`${aiData.marca} 👍 ¿Cuál modelo?`);
    aiSuggShow(mods.length?mods:['Otro']);
    return;
  }
  // ── MODELO ──
  if(aiStep===2){
    aiData.modelo=val;aiStep=3;
    const yr=new Date().getFullYear();
    aiMsg('bot',`${aiData.marca} ${aiData.modelo} ✨\n¿De qué año?`);
    aiSuggShow([yr,yr-1,yr-2,yr-3,yr-4].map(String));
    return;
  }
  // ── AÑO ──
  if(aiStep===3){
    const yr=parseInt(val.replace(/\D/g,''));
    if(!yr||yr<1970||yr>2027){aiMsg('bot','Por favor ingresa un año válido (ej: 2021)');return}
    aiData.anio=yr;aiStep=4;
    const sp=suggestedPrice(aiData.marca,aiData.modelo,yr);
    if(aiData.valuation){
      aiMsg('bot',`💰 Estimado para ${aiData.marca} ${aiData.modelo} ${yr}:\n\n📊 Rango: $${Math.round(sp*.85).toLocaleString('es-MX')}k – $${Math.round(sp*1.15).toLocaleString('es-MX')}k MXN\n🎯 Precio sugerido: $${sp.toLocaleString('es-MX')},000 MXN\n\n¿Te ayudo a publicarlo?`);
      aiData.precioNum=sp*1000;
      aiSuggShow(['✅ Sí, publicar ahora','↩️ Empezar de nuevo']);
      aiStep=8;return;
    }
    aiMsg('bot',`Precio sugerido para ${yr}: ~$${sp.toLocaleString('es-MX')},000 MXN\n¿A cuánto lo vendes?`);
    const base=sp*1000;
    aiSuggShow([base,Math.round(base*.93),Math.round(base*1.08)].map(v=>'$'+v.toLocaleString('es-MX')));
    return;
  }
  // ── PRECIO ──
  if(aiStep===4){
    const p=parseInt(val.replace(/[^0-9]/g,''));
    if(!p||p<3000){aiMsg('bot','Ingresa un precio en pesos mexicanos (ej: 180000)');return}
    aiData.precio='$'+p.toLocaleString('es-MX');aiData.precioNum=p;aiStep=5;
    aiMsg('bot','¿Cuántos kilómetros tiene?');
    aiSuggShow(['5,000','15,000','30,000','50,000','80,000','120,000','200,000+']);
    return;
  }
  // ── KM ──
  if(aiStep===5){
    aiData.km=val;aiStep=6;
    aiMsg('bot','¿De qué color?');
    aiSuggShow(COLORES.slice(0,6));
    return;
  }
  // ── COLOR ──
  if(aiStep===6){
    aiData.color=val;aiStep=7;
    aiMsg('bot','¿En qué ciudad está el auto?');
    aiSuggShow(CIUDADES.slice(0,6));
    return;
  }
  // ── CIUDAD ──
  if(aiStep===7){
    aiData.ciudad=val;aiStep=8;
    const km=parseInt((aiData.km||'0').replace(/[^0-9]/g,''));
    const summary=`✅ ¡Todo listo! Resumen:\n\n🚗 ${aiData.anio} ${aiData.marca} ${aiData.modelo}\n💰 ${aiData.precio}\n${aiData.km} km\n🎨 ${aiData.color}\n${aiData.ciudad}\n\n¿Lo publico ahora?`;
    aiMsg('bot',summary);
    aiSuggShow(['🚀 Sí, publicar ahora','✏️ Editar algo','↩️ Empezar de nuevo']);
    return;
  }
  // ── LISTO ──
  if(aiStep===8){
    if(low.includes('sí')||low.includes('si')||low.includes('publicar')||low.includes('ahora')||low.includes('vamos')){
      aiMsg('bot','¡Abriendo el formulario con tus datos! 🚀');
      setTimeout(()=>{
        toggleAI();
        openSell({make:aiData.marca,model:aiData.modelo,year:aiData.anio,price:aiData.precioNum});
        setTimeout(()=>{
          const km=parseInt((aiData.km||'').replace(/[^0-9]/g,''));
          if(km)document.getElementById('sMileage').value=km;
          if(aiData.color)document.getElementById('sColor').value=aiData.color;
          if(aiData.ciudad)document.getElementById('sLoc').value=aiData.ciudad;
        },400);
      },700);
    }else if(low.includes('empezar')||low.includes('nuevo')||low.includes('otra')){
      aiStep=0;aiData={};
      aiMsg('bot','¡De nuevo! ¿Qué quieres hacer?');
      aiSuggShow(['📝 Publicar mi auto','💰 ¿Cuánto vale mi auto?']);
    }else{
      aiMsg('bot','¡Abriendo el formulario ahora! 🚗');
      setTimeout(()=>{toggleAI();openSell({make:aiData.marca,model:aiData.modelo,year:aiData.anio,price:aiData.precioNum})},500);
    }
    return;
  }
  // fallback
  aiMsg('bot','Lo siento, no entendí. ¿Empezamos de nuevo?');
  aiSuggShow(['📝 Publicar mi auto','💰 ¿Cuánto vale mi auto?']);
  aiStep=0;
}

// ── BÚSQUEDA CON IA (predictiva, conversacional) ──
// Estados: 0=inicio, 1=marca, 2=modelo, 3=año, 4=presupuesto, 5=transmisión, 6=listo
let saiStep=0, saiData={};

function saiLooksLikeAd(text){
  const raw=String(text||'').trim();
  return /^https?:\/\//i.test(raw)
    || raw.length>90
    || /\b(vendo|venta|trato|factura|whatsapp|telefono|tel[eé]fono|kilometraje|km|precio|mxn|publicacion|publicaci[oó]n|link|url|kavak|bbva|seminuevos|autocosmos|mercado\s*libre|mercadolibre|facebook|agencia|lote|conviene|recomiendas|fallas|que revisar|qu[eé] revisar)\b/i.test(raw)
    || /\$\s*\d[\d,.]*/.test(raw);
}

function openFullSearchAI(){
  const parts=[];
  const direct=(document.getElementById('saiInp')?.value||document.getElementById('aiInp')?.value||'').trim();
  if(direct)parts.push(direct);
  const q=(document.getElementById('fQ')?.value||'').trim();
  const pmin=(document.getElementById('fPMin')?.value||'').trim();
  const pmax=(document.getElementById('fPMax')?.value||'').trim();
  const city=(document.getElementById('fCity')?.value||'').trim();
  const year=(document.getElementById('fYear')?.value||'').trim();
  const trans=(document.getElementById('fTrans')?.value||'').trim();
  if(q)parts.push(q);
  if(city)parts.push('en '+city);
  if(year)parts.push('desde '+year);
  if(pmin)parts.push('desde '+pmin+' pesos');
  if(pmax)parts.push('hasta '+pmax+' pesos');
  if(trans)parts.push(trans);
  const url=parts.length
    ? '/buscar-con-ia.html?q='+encodeURIComponent(parts.join(' '))
    : '/buscar-con-ia.html';
  window.location.href=url;
}

function openSearchAI(){
  saiReset();
  openO('searchAIOv');
  setTimeout(()=>{const i=document.getElementById('saiInp'); if(i)i.focus();},150);
}
function saiReset(){
  saiStep=0; saiData={};
  const m=document.getElementById('saiMsgs');
  const s=document.getElementById('saiSummary');
  if(s){s.style.display='none';s.innerHTML='';}
  if(m){m.innerHTML='';}
  saiBot('Hola. Primero reviso autos de Tixuz. Si no hay suficientes, puedes abrir la IA completa para ampliar a internet o publicar un auto parecido.\n\nEjemplo: "SUV automatica en Zapopan menos de 400 mil".');
  saiSuggShow(['SUV familiar','Economico','Para Uber','Automatico','Menos de $250 mil','Pickup','Publicar mi auto','IA completa']);
}
function saiBot(text){
  const c=document.getElementById('saiMsgs');
  const d=document.createElement('div');
  d.style.cssText='align-self:flex-start;background:var(--bg3);color:var(--text);padding:8px 12px;border-radius:12px 12px 12px 2px;max-width:85%;font-size:.85rem;line-height:1.4;white-space:pre-wrap';
  d.textContent=text;
  c.appendChild(d); forceScrollBottom(c);
}
function saiUser(text){
  const c=document.getElementById('saiMsgs');
  const d=document.createElement('div');
  d.style.cssText='align-self:flex-end;background:linear-gradient(135deg,var(--accent),var(--purple));color:#fff;padding:8px 12px;border-radius:12px 12px 2px 12px;max-width:85%;font-size:.85rem;line-height:1.4';
  d.textContent=text;
  c.appendChild(d); forceScrollBottom(c);
}
async function saiTyping(){
  const c=document.getElementById('saiMsgs');
  const d=document.createElement('div');
  d.id='saiDots';
  d.style.cssText='align-self:flex-start;background:var(--bg3);padding:10px 14px;border-radius:12px 12px 12px 2px;display:flex;gap:4px';
  d.innerHTML='<div class="aidot"></div><div class="aidot"></div><div class="aidot"></div>';
  c.appendChild(d); forceScrollBottom(c);
  await new Promise(r=>setTimeout(r,400));
  d.remove();
}
function saiSuggShow(list){
  const c=document.getElementById('saiSuggs');
  c.innerHTML=list.slice(0,8).map(s=>`<button class="aisg" onclick="saiPick('${String(s).replace(/'/g,"\\'")}')">${s}</button>`).join('');
}
function saiPick(val){
  if(/aplicar/i.test(String(val))){saiApply();return;}
  if(/reiniciar/i.test(String(val))){saiReset();return;}
  if(/publicar/i.test(String(val))){openSellFromCurrentSearch();return;}
  if(/ia completa/i.test(String(val))){openFullSearchAI();return;}
  document.getElementById('saiInp').value=val;
  saiSend();
}
function saiUpdateSummary(){
  const s=document.getElementById('saiSummary');
  if(!s)return;
  const parts=[];
  if(saiData.keyword)parts.push(`<b>${saiData.keyword}</b>`);
  if(saiData.marca)parts.push(`<b>${saiData.marca}</b>`);
  if(saiData.modelo)parts.push(saiData.modelo);
  if(saiData.year)parts.push(`desde ${saiData.year}`);
  if(saiData.pmax)parts.push(`hasta $${Number(saiData.pmax).toLocaleString('es-MX')}`);
  if(saiData.pmin)parts.push(`desde $${Number(saiData.pmin).toLocaleString('es-MX')}`);
  if(saiData.trans)parts.push(saiData.trans);
  if(parts.length){
    s.style.display='block';
    s.innerHTML='Filtros: '+parts.join(' · ');
  }else{
    s.style.display='none';s.innerHTML='';
  }
}
// Predictivo mientras escribe
function saiPredict(){
  const v=(document.getElementById('saiInp').value||'').toLowerCase().trim();
  if(!v){return;}
  if(saiStep<=1){
    const f=MARCAS.filter(m=>m.toLowerCase().startsWith(v)).slice(0,8);
    if(f.length)saiSuggShow(f);
  }else if(saiStep===2 && saiData.marca){
    const mods=MODELOS[saiData.marca]||[];
    const f=mods.filter(m=>m.toLowerCase().includes(v)).slice(0,8);
    if(f.length)saiSuggShow(f);
  }
}
function saiStartVoice(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  const btn=document.getElementById('saiMicBtn');
  if(!SR){showToast('Tu navegador no permite dictado aquí. Escribe tu búsqueda.','error');return;}
  const rec=new SR();
  rec.lang='es-MX';rec.interimResults=false;rec.maxAlternatives=1;
  const old=btn?btn.textContent:'🎙️';
  if(btn){btn.disabled=true;btn.textContent='●';}
  rec.onresult=e=>{
    const txt=(e.results&&e.results[0]&&e.results[0][0]&&e.results[0][0].transcript)||'';
    const inp=document.getElementById('saiInp');
    if(inp&&txt){inp.value=txt;saiSend();}
  };
  rec.onerror=()=>showToast('No escuché bien. Intenta escribirlo.','error');
  rec.onend=()=>{if(btn){btn.disabled=false;btn.textContent=old;}};
  try{rec.start();showToast('Te escucho…','success');}catch{if(btn){btn.disabled=false;btn.textContent=old;}showToast('No pude activar el micrófono','error');}
}
function saiAskNext(){
  saiUpdateSummary();
  if(!saiData.marca&&!saiData.keyword){
    saiStep=1;
    saiBot('Perfecto. ¿Qué tipo de auto o marca buscas?');
    saiSuggShow(['SUV familiar','Económico','Para Uber','Pickup','Toyota','Nissan','Honda','Volkswagen']);
    return true;
  }
  if(saiData.marca&&!saiData.modelo){
    saiStep=2;
    const mods=(MODELOS[saiData.marca]||[]).slice(0,8);
    saiBot(`${saiData.marca} ¿Algún modelo en particular o te muestro todos?`);
    saiSuggShow(['Cualquier modelo'].concat(mods.length?mods:['Otro']));
    return true;
  }
  if(!saiData.pmax){
    saiStep=4;
    saiBot('¿Cuál es tu presupuesto máximo aproximado?');
    saiSuggShow(['$200,000','$250,000','$300,000','$400,000','$500,000','$700,000','Sin límite']);
    return true;
  }
  if(!saiData.trans){
    saiStep=5;
    saiBot('¿Prefieres automática, manual o cualquiera?');
    saiSuggShow(['Automática','Manual','CVT','Cualquiera']);
    return true;
  }
  saiStep=6;
  saiBot('Listo. Voy a buscar autos que coincidan con tus criterios.');
  setTimeout(saiApply,500);
  return true;
}
// Parser de "todo de una vez": detecta intención/marca/modelo/año/precio en el texto libre
function saiParseFreeText(txt){
  const low=normText(txt);
  const out={};
  const kw=[];
  if(/suv|camioneta|familiar/.test(low))kw.push('suv familiar');
  if(/pickup|pick up|troca|trabajo|carga/.test(low))kw.push('pickup');
  if(/uber|economico|barato|ahorrador|ciudad/.test(low))kw.push('uber economico');
  if(/sedan|sedán/.test(low))kw.push('sedan');
  if(kw.length)out.keyword=[...new Set(kw.join(' ').split(/\s+/))].join(' ');
  // Marca
  const marca=MARCAS.find(m=>low.includes(normText(m)));
  if(marca){
    out.marca=marca;
    // Modelo (buscar en lista de esa marca)
    const mods=MODELOS[marca]||[];
    const m=mods.find(mo=>low.includes(normText(mo)));
    if(m)out.modelo=m;
  }
  // Año (4 dígitos entre 1990 y 2030)
  const ym=txt.match(/\b(19[9]\d|20[0-3]\d)\b/);
  if(ym)out.year=parseInt(ym[1]);
  // Precio: "menos de 300", "menor a 300mil", "hasta 350,000", "300k"
  const priceRegex=/(?:menos de|menor a|hasta|maximo|máximo|max)\s*\$?\s*([\d.,]+)\s*(mil|k|m|millones?)?/i;
  const pm=txt.match(priceRegex);
  if(pm){
    let n=parseFloat(pm[1].replace(/[.,]/g,''));
    const u=(pm[2]||'').toLowerCase();
    if(u==='mil'||u==='k')n*=1000;
    else if(u==='m'||u.startsWith('millon'))n*=1000000;
    else if(n<10000 && /[.,]/.test(pm[1]))n*=1000; // "300.000" o "300,000"
    else if(n<10000)n*=1000; // "300" → asumimos 300mil
    if(n>0)out.pmax=Math.round(n);
  }
  // Transmisión
  if(/automatic/.test(low))out.trans='Automática';
  else if(/manual|estandar/.test(low))out.trans='Manual';
  else if(/cvt/.test(low))out.trans='CVT';
  return out;
}
async function saiSend(){
  const inp=document.getElementById('saiInp');
  const val=(inp.value||'').trim();
  if(!val)return;
  inp.value='';
  saiUser(val);
  document.getElementById('saiSuggs').innerHTML='';
  if(saiLooksLikeAd(val)){
    saiBot('Abro el veredicto Tixuz completo para analizar ese anuncio.');
    window.location.href='/buscar-con-ia.html?q='+encodeURIComponent(val);
    return;
  }
  await saiTyping();
  // Si parece texto libre o intención de comprador, parsearlo todo sin forzar marca.
  if(saiStep<=1){
    const parsed=saiParseFreeText(val);
    if(parsed.marca||parsed.year||parsed.pmax||parsed.trans||parsed.keyword){
      Object.assign(saiData,parsed);
      saiAskNext();
      return;
    }
  }
  // Conversacional paso a paso
  if(saiStep<=1){
    const m=MARCAS.find(x=>x.toLowerCase()===val.toLowerCase())||MARCAS.find(x=>val.toLowerCase().includes(x.toLowerCase()));
    saiData.marca=m||val;
    saiUpdateSummary();
    saiStep=2;
    const mods=(MODELOS[saiData.marca]||[]).slice(0,8);
    saiBot(`${saiData.marca} ¿Algún modelo en particular o te muestro todos?`);
    saiSuggShow(['Cualquier modelo'].concat(mods.length?mods:['Otro']));
    return;
  }
  if(saiStep===2){
    if(!/cualquier|todos|skip|cualquiera/i.test(val))saiData.modelo=val;
    saiUpdateSummary();
    saiStep=3;
    const cur=new Date().getFullYear()+1;
    const yrs=[];
    for(let y=cur;y>=cur-10;y--)yrs.push(String(y));
    saiBot('¿Desde qué año? (o "cualquiera")');
    saiSuggShow(['Cualquier año'].concat(yrs.slice(0,7)));
    return;
  }
  if(saiStep===3){
    const ym=val.match(/\b(19\d\d|20\d\d)\b/);
    if(ym)saiData.year=parseInt(ym[1]);
    saiUpdateSummary();
    saiStep=4;
    saiBot('¿Cuánto puedes pagar máximo?');
    saiSuggShow(['$200,000','$300,000','$400,000','$500,000','$700,000','$1,000,000','Sin límite']);
    return;
  }
  if(saiStep===4){
    if(!/sin l[ií]mite|cualquier|skip/i.test(val)){
      const n=parseFloat(val.replace(/[$,.\s]/g,''));
      if(!isNaN(n)&&n>0){
        let final=n;
        if(/k|mil/i.test(val))final=n*1000;
        else if(/m|millon/i.test(val))final=n*1000000;
        else if(n<10000)final=n*1000;
        saiData.pmax=Math.round(final);
      }
    }
    saiUpdateSummary();
    saiStep=5;
    saiBot('¿Tienes preferencia de transmisión?');
    saiSuggShow(['Automática','Manual','CVT','Cualquiera']);
    return;
  }
  if(saiStep===5){
    if(/autom/i.test(val))saiData.trans='Automática';
    else if(/manual/i.test(val))saiData.trans='Manual';
    else if(/cvt/i.test(val))saiData.trans='CVT';
    saiUpdateSummary();
    saiStep=6;
    saiBot('Listo. Voy a buscar autos que coincidan con tus criterios. Dale al botón de abajo "Aplicar filtros" o escribe algo más.');
    saiSuggShow(['✓ Aplicar ahora']);
    return;
  }
  // step 6+: por si quiere ajustar
  saiBot('Si quieres ajustar algo dímelo, o aplica los filtros con el botón de abajo.');
  saiSuggShow(['✓ Aplicar ahora','↺ Reiniciar']);
}
function saiApply(){
  // Volcar saiData en los filtros del marketplace
  const fQ=document.getElementById('fQ');
  const fY=document.getElementById('fYear');
  const fT=document.getElementById('fTrans');
  const fPMax=document.getElementById('fPMax');
  const fPMin=document.getElementById('fPMin');
  const q=[saiData.keyword||'',saiData.marca||'',saiData.modelo||''].join(' ').trim();
  if(fQ)fQ.value=q;
  if(fY)fY.value=saiData.year?String(saiData.year):'';
  if(fT)fT.value=saiData.trans||'';
  if(fPMax)fPMax.value=saiData.pmax?String(saiData.pmax):'';
  if(fPMin)fPMin.value=saiData.pmin?String(saiData.pmin):'';
  applyFilters();
  forceHybridSearch();
  closeO('searchAIOv');
  // Scroll al grid
  setTimeout(()=>{
    const g=document.getElementById('carsGrid');
    if(g)g.scrollIntoView({behavior:'smooth',block:'start'});
  },200);
  showToast('Filtros de IA aplicados','success');
}

function openSellFromCurrentSearch(){
  const pre={};
  const q=(document.getElementById('fQ')?.value||'').trim();
  const low=normText(q);
  const make=(typeof MARCAS!=='undefined'&&Array.isArray(MARCAS))
    ? MARCAS.find(m=>low.includes(normText(m)))
    : '';
  if(make){
    pre.make=make;
    const mods=(typeof MODELOS!=='undefined'&&MODELOS&&MODELOS[make])||[];
    const model=mods.find(m=>low.includes(normText(m)));
    if(model)pre.model=model;
  }else if(q){
    const parts=q.split(/\s+/).filter(Boolean);
    if(parts[0])pre.make=parts[0];
    if(parts.length>1)pre.model=parts.slice(1,4).join(' ');
  }
  const year=parseInt(document.getElementById('fYear')?.value||'');
  const pmax=parsePriceInput(document.getElementById('fPMax')?.value||'');
  if(year)pre.year=year;
  if(pmax)pre.price=pmax;
  openSell(pre);
}

// ── UTILS ──
function clearFilters(){
  ['fQ','fPMin','fPMax','fCity'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
  const yr=document.getElementById('fYear'); if(yr) yr.value='';
  const tr=document.getElementById('fTrans'); if(tr) tr.value='';
  const sort=document.getElementById('fSort'); if(sort) sort.value='default';
  const pr=document.getElementById('fPRange'); if(pr) pr.value='';
  const pcw=document.getElementById('fPCustom'); if(pcw) pcw.style.display='none';
  cancelPendingExternalSearch(true);
  applyFilters({skipExternalFetch:true});
}
function togglePin(inputId,btn){
  const i=document.getElementById(inputId);
  if(!i)return;
  if(i.type==='password'){i.type='text';btn.textContent='🙈';btn.title='Ocultar PIN';}
  else{i.type='password';btn.textContent='👁';btn.title='Mostrar PIN';}
}
function populateYearFilter(){
  const sel=document.getElementById('fYear');
  if(!sel)return;
  const cur=new Date().getFullYear()+1; // 2027
  let html='<option value="">Año desde</option>';
  for(let y=cur;y>=1990;y--){html+=`<option value="${y}">${y}</option>`;}
  sel.innerHTML=html;
}
function cityKey(v){
  const s=normText(v||'').replace(/\./g,'').trim();
  if(!s)return '';
  if(/cdmx|ciudad de mexico|cuauhtemoc|algarin|mexico city/.test(s))return 'cdmx';
  if(/guadalajara|zapopan|tlaquepaque|tonala|jal/.test(s))return 'guadalajara';
  if(/monterrey|nuevo leon|nl|san pedro|apodaca|guadalupe/.test(s))return 'monterrey';
  if(/queretaro|qro/.test(s))return 'queretaro';
  if(/puebla|pue/.test(s))return 'puebla';
  if(/tijuana|baja california|bc/.test(s))return 'tijuana';
  if(/leon|guanajuato|gto/.test(s))return 'leon';
  if(/merida|yucatan|yuc/.test(s))return 'merida';
  if(/toluca|edo mex|estado de mexico/.test(s))return 'toluca';
  return s.split(',')[0].slice(0,40);
}
function cityLabel(key){
  return ({cdmx:'CDMX',guadalajara:'Guadalajara',monterrey:'Monterrey',queretaro:'Querétaro',puebla:'Puebla',tijuana:'Tijuana',leon:'León',merida:'Mérida',toluca:'Toluca'}[key]||key||'México');
}
function populateCityFilter(){
  const sel=document.getElementById('fCity');
  if(!sel)return;
  const current=sel.value;
  const counts=new Map();
  (allCars||[]).forEach(c=>{
    const k=cityKey(c.location);
    if(k)counts.set(k,(counts.get(k)||0)+1);
  });
  const preferred=['guadalajara','cdmx','monterrey','queretaro','puebla','tijuana','leon','merida','toluca'];
  const keys=[...new Set([...preferred.filter(k=>counts.has(k)),...Array.from(counts.keys()).sort()])];
  sel.innerHTML='<option value="">Todas las ciudades</option>'+keys.map(k=>`<option value="${escAttr(k)}">${escHTML(cityLabel(k))} (${counts.get(k)||0})</option>`).join('');
  if([...sel.options].some(o=>o.value===current))sel.value=current;
}
function openO(id){
  const ov=document.getElementById(id);
  if(!ov)return;
  ov.classList.add('open');document.body.style.overflow='hidden'
}
function closeO(id){document.getElementById(id).classList.remove('open');document.body.style.overflow='';document.querySelectorAll('.field-error').forEach(n=>n.remove())}
document.querySelectorAll('.overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)closeO(o.id)}));
// Admin queda oculto en navegación pública; sigue disponible con /?admin=1 o #admin.
if(location.search.includes('admin=1')||location.hash==='#admin'){
  document.body.classList.add('show-admin');
  setTimeout(()=>{try{openAdmin()}catch{}},600);
}
if(lotIntakeRequested())setTimeout(()=>openLotIntake(),650);
if(sellRequested())setTimeout(()=>openSell(),650);
// Apertura única y blindada de ficha: marketplace + Mis Anuncios.
document.addEventListener('click',e=>{
  const el=e.target.closest&&e.target.closest('[data-detail-id],.car-card[data-id]');
  if(!el)return;
  const interactive=e.target.closest('button,a,input,select,textarea');
  if(interactive&&!(interactive.dataset&&interactive.dataset.detailId))return;
  const id=(el.dataset&&(el.dataset.detailId||el.dataset.id))||'';
  if(!id)return;
  if(el.tagName==='A'&&(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button===1))return;
  e.preventDefault();
  e.stopPropagation();
  if(e.stopImmediatePropagation)e.stopImmediatePropagation();
  const opened=document.querySelector('.overlay.open');
  if(opened&&opened.id!=='detailOv')closeO(opened.id);
  setTimeout(()=>openDetailById(id),40);
},true);
let tT;
function showToast(msg,type=''){
  const t=document.getElementById('toast');
  t.textContent=msg;t.className='toast show'+(type?' '+type:'');
  clearTimeout(tT);tT=setTimeout(()=>t.classList.remove('show'),4000);
}

try{init();}catch(e){console.error('Init falló, se conserva HTML directo de autos base:', e);}
