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
let allCars=[],step=1,uploadedImgs=[],selPlan='free_launch',plans=[],lotRows=[],lotFileTexts=[],prospects=[],activeProspectId=sessionStorage.getItem('tixuz_active_prospect')||'',opsAfterUnlock=null,adminTok=sessionStorage.getItem('ta_tok')||'';
const OPS_TOKEN_KEY='tixuz_ops_token_v1';
const DETAIL_CACHE=new Map();
function opsRequested(){return location.search.includes('ops=1')||location.hash==='#ops'}
function hasOpsAccess(){return !!sessionStorage.getItem(OPS_TOKEN_KEY)}
function unlockOps(token){
  if(token)sessionStorage.setItem(OPS_TOKEN_KEY,token);
  document.body.classList.add('show-ops','ops-unlocked');
}
function requestOpsUnlock(after){
  if(hasOpsAccess()){unlockOps();if(typeof after==='function')after();return true}
  document.body.classList.add('show-ops');
  opsAfterUnlock=typeof after==='function'?after:null;
  const err=document.getElementById('opsPinErr');
  if(err){err.style.display='none';err.textContent=''}
  openO('opsPinOv');
  setTimeout(()=>document.getElementById('opsPinInput')?.focus(),60);
  return false;
}
async function submitOpsPin(){
  const input=document.getElementById('opsPinInput');
  const err=document.getElementById('opsPinErr');
  const pin=String(input?.value||'').trim();
  if(!pin){if(err){err.textContent='Escribe el PIN';err.style.display='block'}return}
  try{
    const res=await fetch('/.netlify/functions/ops-auth',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({pin})
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok||!data.ok||!data.token)throw new Error(data.error||'PIN incorrecto');
    if(input)input.value='';
    if(err){err.style.display='none';err.textContent=''}
    unlockOps(data.token);
    closeO('opsPinOv');
    const next=opsAfterUnlock;opsAfterUnlock=null;
    if(typeof next==='function')setTimeout(next,50);
    showToast('Herramientas internas desbloqueadas','ok');
    return;
  }catch(e){
    if(err){err.textContent=e.message||'No se pudo validar el PIN';err.style.display='block'}
  }
}
function initOpsMode(){
  if(!opsRequested())return;
  document.body.classList.add('show-ops');
  if(hasOpsAccess()){unlockOps();setTimeout(()=>openProspects(),350);}
  else setTimeout(()=>requestOpsUnlock(openProspects),350);
}
function openOperatorEntry(){
  history.replaceState(null,'','?ops=1');
  requestOpsUnlock(openProspects);
}
const FREE_LAUNCH_PLAN={key:'free_launch',name:'Gratis lanzamiento',price_mxn:0,interval_type:'one_time',active_days:30,max_photos:5,badge:'launch'};
const DEFAULT_PLANS=[
  FREE_LAUNCH_PLAN,
  {key:'basic',name:'Básico',price_mxn:49,interval_type:'one_time',active_days:30,max_photos:5},
  {key:'featured',name:'Destacado',price_mxn:199,interval_type:'one_time',active_days:60,max_photos:12},
  {key:'pro',name:'PRO',price_mxn:499,interval_type:'recurring',active_days:30,max_photos:30}
];
function withLaunchPlan(list){
  const paid=Array.isArray(list)?list.filter(p=>p&&p.key&&p.key!=='free_launch'):[];
  return [FREE_LAUNCH_PLAN,...paid];
}
function planNameForListing(l){
  if(l&&l.payment_status==='not_required')return 'Gratis lanzamiento';
  return ({basic:'Básico',featured:'Destacado',pro:'PRO'}[l?.plan]||l?.plan||'Básico');
}
function publishButtonLabel(){return selPlan==='free_launch'?'Publicar gratis':'Ir a pagar';}
function updatePublishButton(){const b=document.getElementById('btnNext');if(b&&step===3)b.textContent=publishButtonLabel();}
const SEED_FALLBACK_LIMIT = 8;
const SEED_SEARCH_LIMIT = 24;
const SEED_CARS = [{"make":"Nissan","model":"Versa Advance","year":2022,"price":268000,"mileage":42000,"transmission":"Automática","fuel_type":"Gasolina","location":"Guadalajara, Jal.","featured":true,"plan":"basic","id":"seed-001","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-24T12:00:00Z","images":["assets/seed/demo01.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2022 Nissan Versa Advance."},{"make":"Volkswagen","model":"Jetta Comfortline","year":2021,"price":365000,"mileage":48000,"transmission":"Automática","fuel_type":"Gasolina","location":"CDMX","featured":false,"plan":"pro","id":"seed-002","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-24T11:00:00Z","images":["assets/seed/demo02.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2021 Volkswagen Jetta Comfortline."},{"make":"Toyota","model":"Corolla LE","year":2020,"price":332000,"mileage":58000,"transmission":"Automática","fuel_type":"Gasolina","location":"Querétaro, Qro.","featured":false,"plan":"basic","id":"seed-003","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-24T10:00:00Z","images":["assets/seed/demo03.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2020 Toyota Corolla LE."},{"make":"Kia","model":"Rio HB EX","year":2021,"price":245000,"mileage":53000,"transmission":"Automática","fuel_type":"Gasolina","location":"Monterrey, N.L.","featured":true,"plan":"basic","id":"seed-004","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-24T09:00:00Z","images":["assets/seed/demo04.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2021 Kia Rio HB EX."},{"make":"Mazda","model":"3 Sedán i Grand Touring","year":2021,"price":355000,"mileage":44000,"transmission":"Automática","fuel_type":"Gasolina","location":"Puebla, Pue.","featured":false,"plan":"basic","id":"seed-005","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-24T08:00:00Z","images":["assets/seed/demo05.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2021 Mazda 3 Sedán i Grand Touring."},{"make":"Nissan","model":"Sentra SR","year":2020,"price":329000,"mileage":61000,"transmission":"Automática","fuel_type":"Gasolina","location":"León, Gto.","featured":false,"plan":"basic","id":"seed-006","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-24T07:00:00Z","images":["assets/seed/demo06.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2020 Nissan Sentra SR."},{"make":"Honda","model":"Civic i-Style","year":2020,"price":372000,"mileage":64000,"transmission":"Automática","fuel_type":"Gasolina","location":"Mérida, Yuc.","featured":false,"plan":"basic","id":"seed-007","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-24T06:00:00Z","images":["assets/seed/demo07.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2020 Honda Civic i-Style."},{"make":"Hyundai","model":"Elantra GLS","year":2021,"price":315000,"mileage":49000,"transmission":"Automática","fuel_type":"Gasolina","location":"Aguascalientes, Ags.","featured":false,"plan":"basic","id":"seed-008","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-24T05:00:00Z","images":["assets/seed/demo08.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2021 Hyundai Elantra GLS."},{"make":"Nissan","model":"Kicks Advance","year":2021,"price":318000,"mileage":46000,"transmission":"Automática","fuel_type":"Gasolina","location":"Morelia, Mich.","featured":true,"plan":"basic","id":"seed-009","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-24T04:00:00Z","images":["assets/seed/demo09.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2021 Nissan Kicks Advance."},{"make":"Hyundai","model":"Tucson GLS","year":2021,"price":435000,"mileage":55000,"transmission":"Automática","fuel_type":"Gasolina","location":"Tijuana, B.C.","featured":false,"plan":"basic","id":"seed-010","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-24T03:00:00Z","images":["assets/seed/demo10.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2021 Hyundai Tucson GLS."},{"make":"Honda","model":"HR-V Touring","year":2023,"price":445000,"mileage":28000,"transmission":"Automática","fuel_type":"Gasolina","location":"Cancún, Q. Roo","featured":false,"plan":"pro","id":"seed-011","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-24T02:00:00Z","images":["assets/seed/demo11.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2023 Honda HR-V Touring."},{"make":"Mazda","model":"CX-30 i Sport","year":2021,"price":399000,"mileage":39000,"transmission":"Automática","fuel_type":"Gasolina","location":"San Luis Potosí, S.L.P.","featured":false,"plan":"basic","id":"seed-012","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-24T01:00:00Z","images":["assets/seed/demo12.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2021 Mazda CX-30 i Sport."},{"make":"Toyota","model":"Corolla Cross LE","year":2021,"price":438000,"mileage":41000,"transmission":"Automática","fuel_type":"Gasolina","location":"Chihuahua, Chih.","featured":true,"plan":"basic","id":"seed-013","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-24T00:00:00Z","images":["assets/seed/demo13.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2021 Toyota Corolla Cross LE."},{"make":"Kia","model":"Seltos EX","year":2021,"price":389000,"mileage":50000,"transmission":"Automática","fuel_type":"Gasolina","location":"Veracruz, Ver.","featured":false,"plan":"basic","id":"seed-014","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-23T23:00:00Z","images":["assets/seed/demo14.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2021 Kia Seltos EX."},{"make":"MG","model":"ZS Excite","year":2021,"price":285000,"mileage":52000,"transmission":"Automática","fuel_type":"Gasolina","location":"Toluca, Edo. Mex.","featured":false,"plan":"basic","id":"seed-015","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-23T22:00:00Z","images":["assets/seed/demo15.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2021 MG ZS Excite."},{"make":"Suzuki","model":"Vitara GLX","year":2021,"price":365000,"mileage":47000,"transmission":"Automática","fuel_type":"Gasolina","location":"Hermosillo, Son.","featured":false,"plan":"basic","id":"seed-016","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-23T21:00:00Z","images":["assets/seed/demo16.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2021 Suzuki Vitara GLX."},{"make":"Renault","model":"Duster Intens","year":2022,"price":312000,"mileage":36000,"transmission":"Manual","fuel_type":"Gasolina","location":"Oaxaca, Oax.","featured":false,"plan":"basic","id":"seed-017","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-23T20:00:00Z","images":["assets/seed/demo17.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2022 Renault Duster Intens."},{"make":"Suzuki","model":"Swift Boosterjet","year":2020,"price":238000,"mileage":59000,"transmission":"Automática","fuel_type":"Gasolina","location":"Culiacán, Sin.","featured":false,"plan":"basic","id":"seed-018","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-23T19:00:00Z","images":["assets/seed/demo18.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2020 Suzuki Swift Boosterjet."},{"make":"Suzuki","model":"Jimny GLX","year":2021,"price":498000,"mileage":32000,"transmission":"Manual","fuel_type":"Gasolina","location":"Saltillo, Coah.","featured":true,"plan":"basic","id":"seed-019","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-23T18:00:00Z","images":["assets/seed/demo19.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2021 Suzuki Jimny GLX."},{"make":"Volkswagen","model":"Polo Highline","year":2020,"price":244000,"mileage":62000,"transmission":"Automática","fuel_type":"Gasolina","location":"Durango, Dgo.","featured":false,"plan":"basic","id":"seed-020","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-23T17:00:00Z","images":["assets/seed/demo20.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2020 Volkswagen Polo Highline."},{"make":"Volkswagen","model":"Tiguan Allspace Comfortline","year":2022,"price":585000,"mileage":40000,"transmission":"Automática","fuel_type":"Gasolina","location":"Tuxtla Gutiérrez, Chis.","featured":false,"plan":"pro","id":"seed-021","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-23T16:00:00Z","images":["assets/seed/demo21.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2022 Volkswagen Tiguan Allspace Comfortline."},{"make":"Ford","model":"Ranger XLT","year":2021,"price":575000,"mileage":62000,"transmission":"Automática","fuel_type":"Diésel","location":"Mexicali, B.C.","featured":false,"plan":"basic","id":"seed-022","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-23T15:00:00Z","images":["assets/seed/demo22.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2021 Ford Ranger XLT."},{"make":"Toyota","model":"Hilux SR","year":2020,"price":495000,"mileage":78000,"transmission":"Manual","fuel_type":"Diésel","location":"Villahermosa, Tab.","featured":true,"plan":"basic","id":"seed-023","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-23T14:00:00Z","images":["assets/seed/demo23.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2020 Toyota Hilux SR."},{"make":"Mitsubishi","model":"Mirage G4 GLS","year":2020,"price":189000,"mileage":66000,"transmission":"Automática","fuel_type":"Gasolina","location":"Colima, Col.","featured":false,"plan":"basic","id":"seed-024","seller_name":"Vendedor particular","seller_type":"Particular","color":"Según foto","created_at":"2026-04-23T13:00:00Z","images":["assets/seed/demo24.jpg"],"description":"Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: 2020 Mitsubishi Mirage G4 GLS."}];

function escJS(v){return String(v ?? '').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,' ')}
function escAttr(v){return String(v ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function escHTML(v){return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function safeWaTarget(id){return 'waR_'+String(id ?? '').replace(/[^a-zA-Z0-9_-]/g,'_')}
function publicListingUrl(id){return '/autos/'+encodeURIComponent(String(id||'').trim())}
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
  out.created_at = out.created_at || new Date().toISOString();
  return out;
}
function mergeCars(list){
  const byId = new Map();
  [...(Array.isArray(list)?list:[]), ...allCars, ...SEED_CARS].forEach(c=>{
    const n = cacheCar(c);
    if(n.id && !byId.has(String(n.id))) byId.set(String(n.id), n);
  });
  allCars = Array.from(byId.values());
  return allCars;
}
async function fetchListingById(id){
  const sid=String(id||'').trim();
  if(!sid || sid.startsWith('seed-')||sid.startsWith('demo-'))return null;
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
  const so=document.getElementById('fSort'); if(so) so.value='new';
}
function clearAutofillFiltersIfNeeded(){
  const ids=['fQ','fPMin','fPMax','fCity','fYear','fTrans'];
  const dirty=ids.some(id=>{const el=document.getElementById(id);return el&&String(el.value||'').trim()});
  if(!dirty)return false;
  resetFiltersSilent();
  return true;
}
async function init(){
  populateYearFilter();
  resetFiltersSilent();
  allCars=cacheCars([...SEED_CARS]);
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
    const r=await fetch(SB_URL+'/rest/v1/public_listings?select=*&order=created_at.desc&limit=300',{
      signal:ctrl.signal,
      headers:{'apikey':SB_ANON,'Authorization':'Bearer '+SB_ANON,'Accept':'application/json'}
    });
    clearTimeout(tid);
    if(!r.ok)throw new Error('HTTP '+r.status);
    const realCars=await r.json();
    const cleanReal=(Array.isArray(realCars)?realCars:[]).filter(c=>c&&c.id).map(normalizeCar);
    // La base visual del marketplace son los autos base curados del ZIP.
    // Evita que registros viejos/mal sembrados en Supabase tapen estos autos base y causen fotos cruzadas.
    // Solo agregamos anuncios reales de alta confianza: subidos por el flujo real a Supabase Storage.
    const hasAnyPhoto=c=>Array.isArray(c.images)&&c.images.some(u=>/^https?:\/\//i.test(String(u||''))||String(u||'').includes('/storage/v1/object/public/marketplace-images/'));
    const hasSupabasePhoto=c=>Array.isArray(c.images)&&c.images.some(u=>String(u||'').includes('/storage/v1/object/public/marketplace-images/'));
    const isAuthorizedReal=c=>{
      const src=normText(c.source||'');
      const st=normText(c.seller_type||'');
      return hasSupabasePhoto(c) || ['agencia','lote','importado','autorizado','authorized','user'].some(v=>src.includes(v)||st.includes(v));
    };
    const remotePublished=cleanReal.filter(c=>!isSeedCar(c)&&hasAnyPhoto(c)&&isAuthorizedReal(c));
    const seen=new Set();
    allCars=cacheCars([...remotePublished,...SEED_CARS].filter(c=>{const k=String(c.id||c.make+'-'+c.model+'-'+c.year); if(seen.has(k))return false; seen.add(k); return true}));
    populateCityFilter();
    applyFilters();
  }catch(e){
    console.warn('Supabase no cargó; se quedan los autos base directos.', e);
    allCars=cacheCars([...SEED_CARS]);
    populateCityFilter();
    applyFilters();
  }
}

function isSeedCar(c){
  return (String(c&&c.id||'').startsWith('seed-')||String(c&&c.id||'').startsWith('demo-')) || String(c&&c.seller_type||'').toLowerCase()==='demo' || String(c&&c.seller_name||'').toLowerCase()==='tixuz autos';
}
function hasAnyActiveFilter(){
  const q=(document.getElementById('fQ')?.value||'').trim();
  const pmin=(document.getElementById('fPMin')?.value||'').trim();
  const pmax=(document.getElementById('fPMax')?.value||'').trim();
  const city=(document.getElementById('fCity')?.value||'').trim();
  const yr=(document.getElementById('fYear')?.value||'').trim();
  const tr=(document.getElementById('fTrans')?.value||'').trim();
  const sort=(document.getElementById('fSort')?.value||'new');
  return !!(q||pmin||pmax||city||yr||tr||sort!=='new');
}
function activeRealCount(){
  return (allCars||[]).filter(c=>!isSeedCar(c)).length;
}
function updateInventoryNotice(list, opts={}){
  const n=document.getElementById('inventoryNotice');
  if(!n)return;
  const real=activeRealCount();
  const filtered=!!opts.hasActiveFilters;
  if(!real && !filtered){
    n.style.display='block';
    n.innerHTML='<strong>Fase piloto por ciudad.</strong> Estamos formando inventario confiable con lotes fundadores y particulares revisados. <button onclick="openSell()">Publicar mi auto</button>';
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
    n.innerHTML=`<strong>${label}: ${count} autos visibles.</strong> Aún estamos construyendo densidad local. Prioridad operativa: sumar lotes fundadores en esta ciudad antes de empujar pagos.`;
  }else{
    n.innerHTML=`<strong>${label}: ${count} autos visibles.</strong> Ya hay base local; mide clics a WhatsApp y respuesta del vendedor antes de vender planes pagados.`;
  }
}
function normText(v){
  return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
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
function applyFilters(){
  const q=normText(document.getElementById('fQ').value);
  const stop=new Set(['de','del','la','el','los','las','para','en','con','y','o','un','una']);
  const qTokens=q.split(/\s+/).filter(t=>t&&!stop.has(t));
  const pmin=parseFloat(document.getElementById('fPMin').value)||0;
  const pmax=parseFloat(document.getElementById('fPMax').value)||1e9;
  const city=document.getElementById('fCity')?.value||'';
  const yr=parseInt(document.getElementById('fYear').value)||0;
  const tr=document.getElementById('fTrans').value;
  const sort=document.getElementById('fSort').value;
  let list=allCars.filter(c=>{
    const searchText=normText(`${c.make||''} ${c.model||''} ${c.description||''} ${c.location||''} ${c.transmission||''} ${c.fuel_type||''} ${carSmartTags(c)}`);
    if(qTokens.length&&!qTokens.every(t=>searchText.includes(t)))return false;
    if(city&&cityKey(c.location)!==city)return false;
    if(Number(c.price||0)<pmin||Number(c.price||0)>pmax)return false;
    if(Number(c.year||0)<yr)return false;
    if(tr&&(c.transmission||'')!==tr)return false;
    return true;
  });
  list.sort((a,b)=>{
    if(sort==='lo')return Number(a.price||0)-Number(b.price||0);
    if(sort==='hi')return Number(b.price||0)-Number(a.price||0);
    if(sort==='yr')return Number(b.year||0)-Number(a.year||0);
    if(sort==='km')return Number(a.mileage||0)-Number(b.mileage||0);
    return new Date(b.created_at||0)-new Date(a.created_at||0);
  });
  const hasFilters=hasAnyActiveFilter();
  const real=activeRealCount();
  if(!real && !hasFilters) list=list.slice(0,SEED_FALLBACK_LIMIT);
  renderGrid(list,{hasActiveFilters:hasFilters,city});
}

function ago(d){
  const s=Math.floor((Date.now()-new Date(d))/1000);
  if(s<3600)return'Hoy';if(s<172800)return'Ayer';return`Hace ${Math.floor(s/86400)} días`;
}

function renderGrid(list,opts={}){
  updateInventoryNotice(list,opts);
  updateDensityNotice(list,opts);
  document.getElementById('gc').innerHTML=`<strong>${list.length}</strong> <span>autos encontrados</span>`;
  if(!list.length){document.getElementById('carsGrid').innerHTML='<div class="empty" style="grid-column:1/-1"><h3>Demanda detectada, inventario faltante</h3><p>No hay autos de Tixuz con esos filtros todavia. Puedes ampliar la busqueda con IA o publicar un auto parecido para aparecer cuando alguien busque esto.</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px"><button class="btn btn-primary" onclick="openFullSearchAI()">Buscar tambien fuera de Tixuz</button><button class="btn btn-green" onclick="openSellFromCurrentSearch()">Publicar auto parecido</button><button class="btn btn-ghost" onclick="openSearchAI()">Ajustar filtros</button></div></div>';return}
  document.getElementById('carsGrid').innerHTML=list.map((c,idx)=>{
    c=cacheCar(c);
    const sid=escJS(c.id);
    const sidAttr=escAttr(c.id);
    const loading=idx<4?'eager':'lazy';
    const priority=idx===0?' fetchpriority="high"':'';
    const img=c.images?.[0]?`<img src="${c.images[0]}" alt="${c.make} ${c.model}" loading="${loading}" decoding="async"${priority} onerror="this.style.display='none'">`:`<div class="cimg-ph">🚗</div>`;
    const isSeed=isSeedCar(c);
    const badge=c.plan==='pro'?'<span class="cbadge bp">PRO</span>':c.featured?'<span class="cbadge bf">Destacado</span>':'';
    const srcName=normText(c.source||c.seller_type||'');
    const sourceBadge=srcName.includes('mercadolibre')?'<span class="cbadge bf" style="left:8px;right:auto;background:rgba(255,255,255,.92);color:#111">MercadoLibre</span>':(!isSeed?'<span class="cbadge bf" style="left:8px;right:auto;background:rgba(16,185,129,.92);color:#04130d">Revisión Tixuz</span>':'');
    const displaySellerType=isSeed?'Particular':(c.seller_type||'Particular');
    const p=Number(c.price).toLocaleString('es-MX');
    const km=Number(c.mileage||0).toLocaleString('es-MX');
    return`<a class="car-card" href="${escAttr(publicListingUrl(c.id))}" data-id="${sidAttr}" data-detail-id="${sidAttr}" aria-label="Ver ${escAttr(c.year+' '+c.make+' '+c.model)}">
      <div class="cimg">${img}${sourceBadge}${badge}<span class="cstype">${displaySellerType}</span></div>
      <div class="cbody">
        <div class="ctitle">${c.year} ${c.make} ${c.model}</div>
        <div class="cprice">$${p}</div>
        <div class="cmeta"><span>${km} km</span><span>${c.transmission||'—'}</span><span>${c.fuel_type||'—'}</span></div>
        <div class="cloc"><span>${c.location||'México'}</span><span>${ago(c.created_at)}</span></div>
      </div></a>`;
  }).join('');
}

// ── DETAIL ──
async function openDetailById(id){
  const sid=String(id||'').trim();
  if(!sid){showToast('No se encontró la ficha del auto','error');return;}
  try{
    let car = DETAIL_CACHE.get(sid)
      || allCars.find(c => String(c.id) === sid)
      || SEED_CARS.find(c => String(c.id) === sid);
    if(!car) car = await fetchListingById(sid);
    if(!car){showToast('No se encontró la ficha del auto','error');return;}
    car=cacheCar(car);
    openDetail(car);
  }catch(err){
    console.error('Error abriendo ficha:',err);
    showToast('No pude abrir la ficha del auto','error');
    try{
      const fallback = DETAIL_CACHE.get(sid) || allCars.find(c => String(c.id) === sid) || SEED_CARS.find(c => String(c.id) === sid);
      if(fallback) openDetailFallback(fallback);
    }catch(e2){console.error('Fallback ficha falló:',e2)}
  }
}
window.openDetailById=openDetailById;
function bumpViewSafely(car){
  try{
    if(!car || !car.id)return;
    const client=getDb();
    if(!client || typeof client.rpc!=='function')return;
    const req=client.rpc('increment_view',{p_listing_id:car.id});
    if(req && typeof req.catch==='function')req.catch(()=>{});
  }catch(e){console.warn('Vista no incrementada, pero ficha abierta:',e)}
}
function openDetailFallback(car){
  car=normalizeCar(car);
  const title=`${car.year||''} ${car.make||'Auto'} ${car.model||''}`.trim();
  document.getElementById('detailTitle').textContent=title||'Detalle del auto';
  const p=Number(car.price||0).toLocaleString('es-MX');
  document.getElementById('detailBody').innerHTML=`
    <div style="height:110px;background:var(--bg3);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:2.5rem;margin-bottom:12px">🚗</div>
    <h3 style="font-size:1.15rem;font-weight:800;margin-bottom:6px">${escHTML(title)}</h3>
    <div style="font-size:1.45rem;font-weight:800;color:var(--accent);margin-bottom:12px">$${p} MXN</div>
    <div class="dgrid">
      <div class="di"><label>Kilometraje</label><span>${Number(car.mileage||0).toLocaleString('es-MX')} km</span></div>
      <div class="di"><label>Transmisión</label><span>${escHTML(car.transmission||'—')}</span></div>
      <div class="di"><label>Ubicación</label><span>${escHTML(car.location||'México')}</span></div>
      <div class="di"><label>Vendedor</label><span>${escHTML(car.seller_name||'—')} · ${escHTML(car.seller_type||'—')}</span></div>
    </div>
    <div style="border:1px solid var(--border);background:rgba(59,130,246,.08);border-radius:12px;padding:12px;margin-top:12px;color:var(--text2);font-size:.84rem;line-height:1.5">
      La ficha se abrió en modo seguro porque el registro trae algún dato irregular. El anuncio no se pierde.
    </div>`;
  openO('detailOv');
}
function openDetail(car){
  if(typeof car==='string')try{car=JSON.parse(car)}catch{return}
  car=normalizeCar(car);
  window.__lastDetailCar = car; // v65: guardar para mensaje WhatsApp pre-llenado
  const isDemo = isSeedCar(car);
  const title=`${car.year||''} ${car.make||'Auto'} ${car.model||''}`.trim();
  document.getElementById('detailTitle').textContent=title;
  const imgs=(car.images||[]).filter(Boolean);
  const gal=imgs.length?`<div class="dgal">${imgs.map(u=>`<img src="${escAttr(u)}" alt="" onerror="this.style.display='none'">`).join('')}</div>`:`<div style="height:110px;background:var(--bg3);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:2.5rem;margin-bottom:12px">🚗</div>`;
  const p=Number(car.price||0).toLocaleString('es-MX');
  const km=Number(car.mileage||0).toLocaleString('es-MX');
  const b=car.plan==='pro'?'<span class="cbadge bp" style="position:static;display:inline-block">PRO</span>':car.featured?'<span class="cbadge bf" style="position:static;display:inline-block">Destacado</span>':'';
  const waTarget=safeWaTarget(car.id);
  const displaySellerName=isDemo?'Vendedor particular':(car.seller_name||'—');
  const displaySellerType=isDemo?'Particular':(car.seller_type||'—');
  const trust=isDemo?'<div class="trust-row"><span class="trust-chip warn">Ficha de referencia</span><span class="trust-chip warn">Inventario inicial</span><span class="trust-chip">No enviar anticipos</span></div>':'<div class="trust-row"><span class="trust-chip good">Revision manual Tixuz</span><span class="trust-chip good">WhatsApp protegido</span><span class="trust-chip">Reporte disponible</span></div>';
  const descText = isDemo ? `Seminuevo del mercado mexicano. Foto y descripción corresponden al modelo: ${title}.` : (car.description||'');
  const originalLink = (!isDemo && car.source_url) ? `<a href="${escAttr(car.source_url)}" target="_blank" rel="noopener" class="btn btn-ghost" style="width:100%;justify-content:center;margin-top:7px;text-decoration:none">Ver publicación original</a>` : '';
  const safetyNote = `
    <div class="detail-note">
      <strong style="color:var(--text)">Compra segura:</strong> revisa documentos, evita anticipos y verifica el auto antes de pagar.
      <a href="mailto:soporte@tixuzautos.com?subject=Reporte%20de%20anuncio%20${encodeURIComponent(title)}" style="color:var(--accent);font-weight:700;text-decoration:none">Reportar anuncio</a>
    </div>`;
  const actionBlock = isDemo ? `
    <div class="detail-note">
      <strong style="color:var(--text)">Inventario inicial de Tixuz Autos.</strong><br>
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
    ${trust}
    <div class="dgrid">
      <div class="di"><label>Kilometraje</label><span>${km} km</span></div>
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
    const r=await fetch('/.netlify/functions/reveal-whatsapp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({listing_id:id}),signal:ctrl.signal});
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

// ── LOT PROSPECTING ──
const PROSPECT_KEY='tixuz_lot_prospects_v1';
const PROSPECT_DAILY_GOAL=10;
const LOT_LANDING_PUBLIC_URL='https://tixuzautos.com/publicar-auto/lotes?inv=prospectos-lotes';
const LOT_INTAKE_PUBLIC_URL='https://tixuzautos.com/?lote=1&inv=prospectos-lotes';
const PROSPECT_TEMPLATES={
  founder:`Hola, son {nombre}? Soy del programa de Tixuz Autos en YouTube. Estamos armando inventario real por ciudad e invitando lotes fundadores esta semana.\n\nPueden publicar hasta 20 autos gratis por 90 dias, sin comision por venta, con compradores directo a su WhatsApp y revision humana antes de activar.\n\nPrimero revisen la invitacion aqui:\n${LOT_LANDING_PUBLIC_URL}`,
  followup:`Buen dia, le doy seguimiento a la invitacion de Tixuz Autos. La etapa de lotes fundadores sigue abierta esta semana: hasta 20 autos gratis por 90 dias, sin comision y con contacto directo a su WhatsApp.\n\nSi les interesa, aqui pueden revisar como funciona:\n${LOT_LANDING_PUBLIC_URL}`,
  inventory:`Para cargar su inventario en Tixuz Autos, entren aqui:\n${LOT_INTAKE_PUBLIC_URL}\n\nNecesitan: nombre del lote, WhatsApp, ciudad, un PIN de 4 digitos para gestionar su carga y la lista/archivo de autos con marca, modelo, ano, precio y fotos si las tienen.\n\nNo pedimos tarjeta ni datos bancarios. Revision estimada: 24 a 48 horas.`,
  cost:`Por ahora cuesta $0 porque estamos en etapa piloto y queremos sumar inventario real antes de cobrar planes. La invitacion cubre hasta 20 autos gratis por 90 dias, sin comision por venta y sin pedir tarjeta.\n\nPueden revisar primero aqui:\n${LOT_LANDING_PUBLIC_URL}`,
  trust:`Entiendo perfecto la duda. Para cuidarlos: no pedimos dinero, tarjeta, contrasenas ni datos bancarios. El PIN solo sirve para gestionar su carga, y los autos quedan en revision humana antes de activarse.\n\nPueden revisar la invitacion y decidir aqui:\n${LOT_LANDING_PUBLIC_URL}`
};
const PROSPECT_STATUS_LABELS={pendiente:'pendiente',contactado:'contactado',interesado:'interesado',no:'no'};
function loadProspects(){
  try{prospects=(JSON.parse(localStorage.getItem(PROSPECT_KEY)||'[]')||[]).map(normalizeProspect)}catch{prospects=[]}
  return prospects;
}
function saveProspects(){localStorage.setItem(PROSPECT_KEY,JSON.stringify(prospects));}
function prospectId(){return 'p_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7)}
function localISODate(offset=0){
  const d=new Date();
  d.setDate(d.getDate()+Number(offset||0));
  d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
  return d.toISOString().slice(0,10);
}
function shortDate(iso){
  const s=String(iso||'').slice(0,10);
  const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?`${m[3]}/${m[2]}`:'';
}
function isDueProspect(p){
  return p.status==='contactado'&&p.next_followup&&p.next_followup<=localISODate(0);
}
function isProspectTouchedToday(p){
  return String(p?.last_contact||'').slice(0,10)===localISODate(0);
}
function openProspects(){
  if(!hasOpsAccess())return requestOpsUnlock(openProspects);
  loadProspects();
  syncProspectTemplateText(false);
  renderProspectSources();
  renderProspects();
  openO('prospectOv');
}
function openOperatorGuide(){
  if(!hasOpsAccess())return requestOpsUnlock(openOperatorGuide);
  openO('operatorGuideOv');
}
function prospectMsg(text,type=''){
  const el=document.getElementById('prospectStatus');
  if(!el)return;
  el.textContent=text;
  el.style.color=type==='bad'?'var(--danger)':type==='ok'?'var(--green)':type==='warn'?'var(--gold)':'var(--text3)';
}
function syncProspectTemplateText(force=false){
  const key=document.getElementById('prospectTemplate')?.value||'founder';
  const box=document.getElementById('prospectTemplateText');
  if(!box)return;
  if(force||!box.value.trim())box.value=PROSPECT_TEMPLATES[key]||PROSPECT_TEMPLATES.founder;
}
function changeProspectTemplate(){syncProspectTemplateText(true);renderProspects()}
function resetProspectTemplate(){syncProspectTemplateText(true);renderProspects();prospectMsg('Plantilla restaurada.','ok')}
function currentProspectTemplate(){
  const key=document.getElementById('prospectTemplate')?.value||'founder';
  return document.getElementById('prospectTemplateText')?.value.trim()||PROSPECT_TEMPLATES[key]||PROSPECT_TEMPLATES.founder;
}
function prospectSourceQueries(city){
  const place=(city||'Mexico').trim();
  return [
    {label:'Google Maps',hint:'lotes con telefono publico',query:`lotes de autos usados ${place}`,url:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`lotes de autos usados ${place}`)}`},
    {label:'Google',hint:'directorios y paginas propias',query:`lotes autos usados ${place} WhatsApp`,url:`https://www.google.com/search?q=${encodeURIComponent(`lotes autos usados ${place} WhatsApp`)}`},
    {label:'Seminuevos',hint:'lotes con inventario activo',query:`site:seminuevos.com lote autos ${place}`,url:`https://www.google.com/search?q=${encodeURIComponent(`site:seminuevos.com lote autos ${place}`)}`},
    {label:'Facebook publico',hint:'paginas de negocio, no mensajes masivos',query:`site:facebook.com lote autos usados ${place}`,url:`https://www.google.com/search?q=${encodeURIComponent(`site:facebook.com lote autos usados ${place}`)}`}
  ];
}
function renderProspectSources(){
  const box=document.getElementById('prospectSources');
  if(!box)return;
  const city=document.getElementById('prospectCityFocus')?.value||'';
  box.innerHTML=prospectSourceQueries(city).map(s=>`<a class="psource" href="${escAttr(s.url)}" target="_blank" rel="noopener"><strong>${escHTML(s.label)}</strong>${escHTML(s.hint)}<br><span style="color:var(--text3)">${escHTML(s.query)}</span></a>`).join('');
}
function openProspectSource(kind='maps'){
  const city=document.getElementById('prospectCityFocus')?.value||'Mexico';
  const sources=prospectSourceQueries(city);
  const picked=sources.find(s=>String(s.label).toLowerCase().includes(kind))||sources[0];
  window.open(picked.url,'_blank','noopener');
  prospectMsg(`Búsqueda abierta para ${city||'Mexico'}. Copia fichas de lotes y vuelve a pegar.`, 'ok');
}
function prospectPhone10(v){
  let d=String(v||'').replace(/\D/g,'');
  if(d.startsWith('521')&&d.length>=13)d=d.slice(3);
  else if(d.startsWith('52')&&d.length>=12)d=d.slice(2);
  if(d.length>10)d=d.slice(-10);
  return d;
}
function prospectEmail(v){
  const m=String(v||'').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m?m[0].toLowerCase():'';
}
function normalizeProspectUrl(raw){
  let u=String(raw||'').trim().replace(/[),.;]+$/,'');
  if(!u)return '';
  if(!/^https?:\/\//i.test(u))u='https://'+u;
  try{return new URL(u).toString()}catch(e){return ''}
}
function prospectUrls(v){
  const s=String(v||'');
  const matches=s.match(/(?:https?:\/\/|www\.)[^\s<>"']+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"']*)?/ig)||[];
  const seen=new Set(), out=[];
  matches.forEach(raw=>{
    if(raw.includes('@'))return;
    if(/\b(?:p\.?m|a\.?m)\b/i.test(raw))return;
    const u=normalizeProspectUrl(raw);
    if(!u||seen.has(u))return;
    seen.add(u);out.push(u);
  });
  return out.slice(0,8);
}
function prospectContactDetails(text){
  const urls=prospectUrls(text);
  const email=prospectEmail(text);
  const facebook=urls.find(u=>/\/\/(?:www\.)?(facebook|fb)\.com\//i.test(u))||'';
  const instagram=urls.find(u=>/\/\/(?:www\.)?instagram\.com\//i.test(u))||'';
  const link=urls.find(u=>!u.includes('google.com/maps')&&!u.includes('maps.app.goo.gl')&&!/\/\/(?:www\.)?(facebook|fb)\.com\//i.test(u)&&!/\/\/(?:www\.)?instagram\.com\//i.test(u))||'';
  return {email,link,facebook,instagram,urls};
}
function parseProspectLine(line){
  const cells=csvLine(line, line.includes('\t')?'\t':',');
  if(cells.length>=2){
    const details=prospectContactDetails(cells.join(' '));
    return {name:cells[0],whatsapp:cells[1],city:cells[2]||'',source:cells[3]||'',link:cells[4]||details.link,autos:cells[5]||'',notes:cells.slice(6).join(' '),email:details.email,facebook:details.facebook,instagram:details.instagram};
  }
  const details=prospectContactDetails(line);
  const wa=mapsPhone(line)||prospectPhone10((line.match(/(?:\+?52)?[\s.-]*(?:\(?\d{2,3}\)?[\s.-]*)?\d{3,4}[\s.-]*\d{4}\b/)||[])[0]||'');
  const clean=line.replace(/(?:\+?52)?[\s.-]*(?:\(?\d{2,3}\)?[\s.-]*)?\d{3,4}[\s.-]*\d{4}\b/g,'').replace(/\s+/g,' ').trim();
  return {name:clean,whatsapp:wa,city:'',source:'manual',link:details.link,autos:'',notes:line,email:details.email,facebook:details.facebook,instagram:details.instagram};
}
function parseProspectRows(text){
  const lines=String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!lines.length)return [];
  const first=lines[0].toLowerCase();
  const hasHeader=/nombre|lote|whatsapp|telefono|tel[eé]fono|ciudad|fuente|link|email|correo|facebook|instagram|web/.test(first);
  if(hasHeader){
    const sep=lines[0].includes('\t')?'\t':',';
    const headers=csvLine(lines[0],sep).map(normalizeHeader);
    return lines.slice(1).map(line=>{
      const cells=csvLine(line,sep),r={};
      headers.forEach((h,i)=>r[h]=cells[i]||'');
      return {
        name:findVal(r,['nombre','lote','name','dealer','agencia'])||'',
        whatsapp:findVal(r,['whatsapp','telefono','teléfono','phone','celular'])||'',
        city:findVal(r,['ciudad','city','ubicacion','ubicación'])||'',
        source:findVal(r,['fuente','source'])||'',
        link:findVal(r,['link','url','web'])||'',
        email:findVal(r,['email','correo','mail'])||'',
        facebook:findVal(r,['facebook','fb'])||'',
        instagram:findVal(r,['instagram','ig'])||'',
        autos:findVal(r,['autos','inventario','cantidad'])||'',
        notes:findVal(r,['notas','notes'])||'',
        status:findVal(r,['estado','status'])||'',
        next_followup:findVal(r,['proximo_seguimiento','seguimiento','followup','next_followup'])||'',
        last_contact:findVal(r,['ultimo_contacto','last_contact'])||'',
      };
    });
  }
  return lines.map(parseProspectLine);
}
const MAPS_NOISE_RE=/^(indicaciones|directions|guardar|save|compartir|share|llamar|call|sitio web|website|enviar|send to|copiar|copy|reservar|menu|ordenar|cerrado|abierto|open|closed|closes|horario|hours|fotos|photos|reseñas|reviews|vista|street view|suggest|sugerir|reclamar|claim|ver todo|more|route|cómo llegar|como llegar|más información|mas información|tu historial de google maps|historial de google maps|índices|indices|añadir una etiqueta|anadir una etiqueta|servicios)$/i;
const MAPS_CATEGORY_RE=/\b(auto|autos|seminuevo|seminuevos|usado|usados|car|cars|dealer|dealership|concesionario|agencia|lote|automotriz|veh[ií]culo|vehiculos)\b/i;
function mapsCleanLine(line){
  return String(line||'').replace(/[\uE000-\uF8FF]/g,' ').replace(/[^\S\r\n]+/g,' ').trim();
}
function mapsAddressLike(line){
  const l=mapsCleanLine(line).toLowerCase();
  return /\b(av\.?|avenida|calle|c\.|blvd|boulevard|carr\.?|carretera|piso|local|col\.?|colonia|alcald[ií]a|municipio|cp|c\.p\.|ciudad de m[eé]xico|cdmx|m[eé]xico|edo\.?|estado)\b/.test(l) || /^[a-z0-9]{3,}\+[a-z0-9]{2,}/i.test(l);
}
function mapsUrl(line){
  return prospectContactDetails(line).link||prospectContactDetails(line).facebook||prospectContactDetails(line).instagram||'';
}
function mapsPhone(line){
  const matches=String(line||'').match(/(?:\+?52[\s.-]*)?(?:\(?\d{2,3}\)?[\s.-]*)?\d{3,4}[\s.-]*\d{4}\b/g)||[];
  for(const m of matches){
    const d=prospectPhone10(m);
    if(d.length===10)return d;
  }
  return '';
}
function mapsNameCandidate(line){
  const l=mapsCleanLine(line);
  if(l.length<3||l.length>90)return false;
  if(!/[a-záéíóúñ]/i.test(l))return false;
  if(MAPS_NOISE_RE.test(l))return false;
  if(mapsAddressLike(l))return false;
  if(mapsUrl(l)||mapsPhone(l))return false;
  if(/\b(abierto|cerrado|cierra|abre|horario|p\.?m\.?|a\.?m\.?)\b/i.test(l))return false;
  if(/\b(etiqueta|historial|google maps|sugerir|cambio|anadir|a.adir)\b/i.test(l))return false;
  if(/^\d(?:\.\d)?(?:\s|\(|$)/.test(l))return false;
  if(/^\(?\d+[\d,.\s]*\)?$/.test(l))return false;
  if(/^(concesionario|agencia|tienda|automobile|used car|car dealer|lote de autos|autos usados|servicio|servicios|taller)\b/i.test(l))return false;
  return true;
}
function mapsCityFromLines(lines,fallback=''){
  const joined=normText((Array.isArray(lines)?lines:[String(lines||'')]).join(' '));
  const cities=[
    ['Guadalajara',/\b(guadalajara|zapopan|tlaquepaque|tonala|jal|jalisco|gdl)\b/],
    ['CDMX',/\b(cdmx|ciudad de mexico|cuauhtemoc|algarin|mexico city)\b/],
    ['Monterrey',/\b(monterrey|nuevo leon|san pedro|apodaca|guadalupe)\b/],
    ['Querétaro',/\b(queretaro|qro)\b/],
    ['Puebla',/\b(puebla|pue)\b/],
    ['Tijuana',/\b(tijuana|baja california)\b/],
    ['León',/\b(leon|guanajuato)\b/],
    ['Mérida',/\b(merida|yucatan)\b/],
    ['Toluca',/\b(toluca|estado de mexico|edo mex)\b/]
  ];
  const hit=cities.find(([,re])=>re.test(joined));
  return hit?hit[0]:(fallback||'');
}
function titleFromDomain(link){
  try{
    const host=new URL(link).hostname.replace(/^www\./,'');
    const base=host.split('.')[0].replace(/gdl$/i,' gdl').replace(/[-_]+/g,' ');
    return base.split(/\s+/).filter(Boolean).map(w=>w.toLowerCase()==='gdl'?'GDL':w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' ');
  }catch(e){return ''}
}
function prospectFallbackName(whatsapp='',city=''){
  const wa=prospectPhone10(whatsapp);
  const place=String(city||document.getElementById('prospectCityFocus')?.value||'').trim();
  return `${place?`Prospecto ${place}`:'Prospecto'}${wa?` ${wa.slice(-4)}`:''}`.trim();
}
function mapsFallbackName(clean,phone,link,city){
  const name=clean.find(mapsNameCandidate)||titleFromDomain(link);
  return name||prospectFallbackName(phone,city);
}
function parseMapsBlock(lines){
  const city=mapsCityFromLines(lines,document.getElementById('prospectCityFocus')?.value||'');
  const clean=lines.map(mapsCleanLine).filter(Boolean).filter(l=>!MAPS_NOISE_RE.test(l));
  if(!clean.length)return null;
  const details=prospectContactDetails(clean.join('\n'));
  const phone=clean.map(mapsPhone).find(Boolean)||'';
  const link=details.link||clean.map(mapsUrl).find(Boolean)||'';
  const name=mapsFallbackName(clean,phone,link,city);
  const category=clean.find(l=>MAPS_CATEGORY_RE.test(l)&&!mapsNameCandidate(l))||'';
  if(!phone)return null;
  return {name,whatsapp:phone,city,source:'Google Maps',link,autos:'',notes:category,email:details.email,facebook:details.facebook,instagram:details.instagram};
}
function parseMapsByBlocks(text){
  return String(text||'').split(/\n\s*\n+/).map(block=>parseMapsBlock(block.split(/\r?\n/))).filter(Boolean);
}
function parseMapsByScan(text){
  const lines=String(text||'').split(/\r?\n/).map(mapsCleanLine).filter(Boolean).filter(l=>!MAPS_NOISE_RE.test(l));
  const city=mapsCityFromLines(lines,document.getElementById('prospectCityFocus')?.value||'');
  const rows=[];
  let current=null;
  lines.forEach((line,i)=>{
    const next=lines.slice(i+1,i+6).join(' ');
    const startsRecord=mapsNameCandidate(line)&&(MAPS_CATEGORY_RE.test(next)||mapsPhone(next)||/^\d(?:\.\d)?(?:\s|\(|$)/.test(lines[i+1]||'')||MAPS_CATEGORY_RE.test(line));
    if(startsRecord){
      if(current&&current.name&&current.whatsapp)rows.push(current);
      current={name:line,whatsapp:'',city,source:'Google Maps',link:'',autos:'',notes:''};
      return;
    }
    if(!current)return;
    const phone=mapsPhone(line),link=mapsUrl(line);
    if(phone&&!current.whatsapp)current.whatsapp=phone;
    if(link&&!current.link)current.link=link;
    if(MAPS_CATEGORY_RE.test(line)&&!current.notes&&!mapsNameCandidate(line))current.notes=line;
  });
  if(current&&current.name&&current.whatsapp)rows.push(current);
  return rows;
}
function parseMapsLooseProspect(text){
  const lines=String(text||'').split(/\r?\n/).map(mapsCleanLine).filter(Boolean).filter(l=>!MAPS_NOISE_RE.test(l));
  if(!lines.length)return null;
  const details=prospectContactDetails(lines.join('\n'));
  const phone=lines.map(mapsPhone).find(Boolean)||'';
  const link=details.link||lines.map(mapsUrl).find(Boolean)||'';
  if(!phone&&!details.email&&!link&&!details.facebook&&!details.instagram)return null;
  const city=mapsCityFromLines(lines,document.getElementById('prospectCityFocus')?.value||'');
  const name=mapsFallbackName(lines,phone,link,city);
  const category=lines.find(l=>MAPS_CATEGORY_RE.test(l)&&!mapsNameCandidate(l))||'';
  return {name,whatsapp:phone,city,source:'Google Maps',link,autos:'',notes:category||'Importado desde ficha de Maps',email:details.email,facebook:details.facebook,instagram:details.instagram};
}
function parseMapsProspectRows(text){
  const blockRows=parseMapsByBlocks(text);
  const hasBlankBlocks=/\n\s*\n+/.test(String(text||''));
  let rows=(blockRows.length&&(hasBlankBlocks||blockRows.some(r=>r.whatsapp)))?blockRows:[...blockRows,...parseMapsByScan(text)];
  const loose=parseMapsLooseProspect(text);
  if(!rows.length&&loose)rows=[loose];
  else if(loose){
    rows=rows.map(r=>{
      if(prospectPhone10(r.whatsapp)!==prospectPhone10(loose.whatsapp))return r;
      const fallbackLike=!r.name||/^Prospecto(?:\s|$)/i.test(r.name);
      return {...r,name:fallbackLike?loose.name:r.name,city:r.city||loose.city,link:r.link||loose.link,email:r.email||loose.email,facebook:r.facebook||loose.facebook,instagram:r.instagram||loose.instagram,notes:r.notes||loose.notes};
    });
  }
  const seen=new Set();
  return rows.filter(r=>{
    const nr=normalizeProspect(r);
    if(!prospectHasAnyChannel(nr))return false;
    const key=prospectUniqueKey(nr);
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}
function normalizeProspect(p){
  const whatsapp=prospectPhone10(p.whatsapp||'');
  const city=String(p.city||document.getElementById('prospectCityFocus')?.value||'').trim().slice(0,120);
  const name=String(p.name||'').trim()||prospectFallbackName(whatsapp,city);
  const details=prospectContactDetails([p.email,p.link,p.facebook,p.instagram,p.notes].join(' '));
  const rawLink=normalizeProspectUrl(p.link);
  const rawFacebook=normalizeProspectUrl(p.facebook)||details.facebook||(/\/\/(?:www\.)?(facebook|fb)\.com\//i.test(rawLink)?rawLink:'');
  const rawInstagram=normalizeProspectUrl(p.instagram)||details.instagram||(/\/\/(?:www\.)?instagram\.com\//i.test(rawLink)?rawLink:'');
  const cleanLink=(rawLink&&!/\/\/(?:www\.)?(facebook|fb)\.com\//i.test(rawLink)&&!/\/\/(?:www\.)?instagram\.com\//i.test(rawLink))?rawLink:details.link;
  return {
    id:p.id||prospectId(),
    name:name.slice(0,120),
    whatsapp,
    city,
    source:String(p.source||'manual').trim().slice(0,120),
    link:(cleanLink||'').slice(0,500),
    email:(prospectEmail(p.email)||details.email).slice(0,160),
    facebook:(rawFacebook||'').slice(0,500),
    instagram:(rawInstagram||'').slice(0,500),
    no_whatsapp:!!p.no_whatsapp,
    last_channel:String(p.last_channel||'').slice(0,40),
    autos:String(p.autos||'').replace(/[^\d]/g,'').slice(0,4),
    notes:String(p.notes||'').trim().slice(0,500),
    status:PROSPECT_STATUS_LABELS[p.status]?p.status:'pendiente',
    created_at:p.created_at||new Date().toISOString(),
    last_contact:p.last_contact||'',
    next_followup:String(p.next_followup||'').slice(0,10),
    last_message:String(p.last_message||'').slice(0,1000),
  };
}
function prospectCleanSummary(p){
  if(!p)return '';
  return [
    `Nombre: ${p.name||'Sin nombre'}`,
    p.whatsapp?`Telefono: ${p.whatsapp}${p.no_whatsapp?' (sin WhatsApp)':''}`:'',
    p.city?`Ciudad: ${p.city}`:'',
    p.email?`Email: ${p.email}`:'',
    p.link?`Web: ${p.link}`:'',
    p.facebook?`Facebook: ${p.facebook}`:'',
    p.instagram?`Instagram: ${p.instagram}`:'',
    `Mejor canal: ${prospectChannelLabel(bestProspectChannel(p))}`,
    p.source?`Fuente: ${p.source}`:''
  ].filter(Boolean).join('\n');
}
function showImportedProspect(p){
  if(!p)return;
  setActiveProspect(p.id);
  const box=document.getElementById('prospectPaste');
  if(box)box.value=prospectCleanSummary(p);
}
function addProspectRows(rawRows,label='prospectos'){
  const rows=rawRows.map(normalizeProspect).filter(prospectHasAnyChannel);
  if(!rows.length)return prospectMsg('No pude importar. Necesito al menos un teléfono, email, web, Facebook o Instagram.','bad');
  loadProspects();
  const seen=new Set(prospects.map(prospectUniqueKey));
  let added=0, target=null;
  rows.forEach(p=>{
    const key=prospectUniqueKey(p);
    if(seen.has(key)){
      if(!target)target=prospects.find(x=>prospectUniqueKey(x)===key)||p;
      return;
    }
    seen.add(key);prospects.push(p);added++;
    if(!target)target=p;
  });
  saveProspects();renderProspects();
  if(target)showImportedProspect(target);
  prospectMsg(`${added} ${label} nuevos importados · ${rows.length-added} duplicados omitidos`, added?'ok':'warn');
}
function importPastedProspectsUnified(){
  const text=document.getElementById('prospectPaste')?.value||'';
  if(!text.trim())return prospectMsg('Pega primero el texto copiado de Google Maps.','bad');
  return smartImportPasted(true);
}
function looksDelimitedProspects(text){
  const lines=String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const first=(lines[0]||'').toLowerCase();
  if(/nombre|lote|whatsapp|telefono|tel[eé]fono|ciudad|fuente|link/.test(first))return true;
  return lines.some(line=>{
    const sep=line.includes('\t')?'\t':',';
    const cells=csvLine(line,sep);
    return cells.length>=3&&prospectPhone10(cells[1]).length===10;
  });
}
function looksLikeMapsText(text){
  return /maps\.app\.goo\.gl|google\.com\/maps|c[oó]mo llegar|indicaciones|concesionario|lote de autos|reseñas|reviews|compartir/i.test(String(text||''));
}
function detectProspectRows(text,preferMaps=false){
  const mapsRows=parseMapsProspectRows(text);
  const csvRows=parseProspectRows(text);
  if((preferMaps||looksLikeMapsText(text))&&mapsRows.length)return {rows:mapsRows,label:'prospectos de Maps'};
  if(looksDelimitedProspects(text)&&csvRows.length)return {rows:csvRows,label:'prospectos'};
  if(mapsRows.length)return {rows:mapsRows,label:'prospectos de Maps'};
  return {rows:csvRows,label:'prospectos'};
}
function smartImportPasted(preferMaps=false){
  const text=document.getElementById('prospectPaste').value;
  const found=detectProspectRows(text,preferMaps);
  if(found.label==='prospectos de Maps'&&!found.rows.length){
    return prospectMsg('No detecté teléfono válido. Puedes borrar todo y dejar solo el teléfono de 10 dígitos; el nombre es opcional.','bad');
  }
  return addProspectRows(found.rows,found.label);
}
async function pasteClipboardAndImportProspects(preferMaps=true){
  if(!navigator.clipboard||!navigator.clipboard.readText){
    return prospectMsg('Tu navegador no dejó leer el portapapeles. Pega el texto en el cuadro y usa Importar lo pegado.','warn');
  }
  try{
    const text=await navigator.clipboard.readText();
    if(!text.trim())return prospectMsg('El portapapeles está vacío. Copia primero la ficha o lista.','warn');
    document.getElementById('prospectPaste').value=text;
    smartImportPasted(preferMaps);
  }catch(e){
    prospectMsg('No pude leer el portapapeles. Pega manualmente y usa Importar lo pegado.','warn');
  }
}
function importProspects(){
  const text=document.getElementById('prospectPaste').value;
  return addProspectRows(parseProspectRows(text),'prospectos');
}
function importMapsProspects(){
  const text=document.getElementById('prospectPaste').value;
  const rows=parseMapsProspectRows(text);
  if(!rows.length)return prospectMsg('No detecté teléfono válido. Puedes borrar todo y dejar solo el teléfono de 10 dígitos; el nombre es opcional.','bad');
  return addProspectRows(rows,'prospectos de Maps');
}
function clearProspectInput(){document.getElementById('prospectPaste').value=''}
function addManualProspectFromFields(){
  const name=(document.getElementById('manualProspectName')?.value||'').trim();
  const whatsapp=prospectPhone10(document.getElementById('manualProspectPhone')?.value||'');
  const city=(document.getElementById('manualProspectCity')?.value||document.getElementById('prospectCityFocus')?.value||'').trim();
  const email=(document.getElementById('manualProspectEmail')?.value||'').trim();
  const alt=(document.getElementById('manualProspectAlt')?.value||'').trim();
  const details=prospectContactDetails([email,alt].join(' '));
  if(whatsapp&&whatsapp.length!==10)return prospectMsg('El teléfono debe tener 10 dígitos. Ejemplo: 5515104493','bad');
  addProspectRows([{name:name||prospectFallbackName(whatsapp,city),whatsapp,city,source:'manual',link:details.link,autos:'',notes:'',email:details.email||email,facebook:details.facebook,instagram:details.instagram}],'prospectos manuales');
  ['manualProspectName','manualProspectPhone','manualProspectCity','manualProspectEmail','manualProspectAlt'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
}
function lotIntakeLink(p={}){
  try{
    const u=new URL(LOT_INTAKE_PUBLIC_URL);
    if(p.name)u.searchParams.set('nombre',p.name);
    if(p.whatsapp)u.searchParams.set('wa',p.whatsapp);
    if(p.city)u.searchParams.set('ciudad',p.city);
    return u.toString();
  }catch(e){return LOT_INTAKE_PUBLIC_URL}
}
async function copyLotIntakeLinkForProspect(id){
  loadProspects();
  const p=prospects.find(x=>x.id===id)||activeProspect()||nextProspect()||{};
  const link=lotIntakeLink(p);
  try{
    await navigator.clipboard.writeText(link);
    prospectMsg(`Link de carga copiado: ${link}`,'ok');
  }catch(e){
    prospectMsg(`Link de carga: ${link}`,'ok');
  }
}
function copyActiveLotIntakeLink(){
  const p=activeProspect()||nextProspect();
  if(!p)return prospectMsg(`Link de carga: ${LOT_INTAKE_PUBLIC_URL}`,'ok');
  copyLotIntakeLinkForProspect(p.id);
}
function removeProspectsWithoutPhone(){
  loadProspects();
  const before=prospects.length;
  prospects=prospects.filter(prospectHasAnyChannel);
  const removed=before-prospects.length;
  if(activeProspectId&&!prospects.some(p=>p.id===activeProspectId))setActiveProspect('');
  saveProspects();renderProspects();
  prospectMsg(removed?`${removed} prospectos sin canal eliminados.`:'No habia prospectos sin canal.','ok');
}
function fillTemplate(t,p){
  const city=p.city||document.getElementById('prospectCityFocus')?.value||'tu ciudad';
  return String(t||'').replaceAll('{nombre}',p.name||'').replaceAll('{ciudad}',city||'tu ciudad').replaceAll('{autos}',p.autos||'varios').replaceAll('{linkCarga}',lotIntakeLink(p)).replaceAll('{link}',p.link||'').replaceAll('{email}',p.email||'').trim();
}
function prospectMessage(p){
  return fillTemplate(currentProspectTemplate(),p);
}
function prospectWaUrl(p){
  if(!p.whatsapp||p.whatsapp.length!==10||p.no_whatsapp)return '';
  return `https://web.whatsapp.com/send?phone=52${p.whatsapp}&text=${encodeURIComponent(prospectMessage(p))}&type=phone_number&app_absent=0`;
}
function prospectSafeLink(url){
  const u=String(url||'').trim();
  return /^https?:\/\//i.test(u)?u:'';
}
function prospectUniqueKey(p){
  if(p.whatsapp)return 'tel:'+p.whatsapp;
  if(p.email)return 'email:'+String(p.email).toLowerCase();
  if(p.link)return 'web:'+String(p.link).toLowerCase();
  if(p.facebook)return 'fb:'+String(p.facebook).toLowerCase();
  if(p.instagram)return 'ig:'+String(p.instagram).toLowerCase();
  return `name:${String(p.name||'')}|${String(p.city||'')}`.toLowerCase();
}
function prospectHasAnyChannel(p){
  return !!(p&&((p.whatsapp&&p.whatsapp.length===10)||p.email||p.link||p.facebook||p.instagram));
}
function bestProspectChannel(p){
  if(!p)return 'none';
  if(p.whatsapp&&p.whatsapp.length===10&&!p.no_whatsapp)return 'whatsapp';
  if(p.email)return 'email';
  if(p.link)return 'web';
  if(p.facebook)return 'facebook';
  if(p.instagram)return 'instagram';
  if(p.whatsapp&&p.whatsapp.length===10)return 'call';
  return 'none';
}
function prospectChannelLabel(ch){
  return ({whatsapp:'WhatsApp',email:'Email',web:'Web',facebook:'Facebook',instagram:'Instagram',call:'Llamada',sin_whatsapp:'Sin WhatsApp',none:'Sin canal'}[ch]||ch||'Sin canal');
}
function prospectEmailSubject(p){return `Invitación Tixuz Autos${p.city?' - '+p.city:''}`;}
function prospectEmailUrl(p){
  if(!p.email)return '';
  return `mailto:${encodeURIComponent(p.email)}?subject=${encodeURIComponent(prospectEmailSubject(p))}&body=${encodeURIComponent(prospectMessage(p))}`;
}
function prospectCallScript(p){
  return `Hola, soy del programa de Tixuz Autos en YouTube. Estamos invitando lotes fundadores a publicar hasta 20 autos gratis por 90 dias, sin comision y con contacto directo a su WhatsApp. ¿Me puede pasar con la persona que ve publicaciones de inventario?`;
}
function saveProspectTouch(p,channel){
  if(!p)return;
  p.last_channel=channel||bestProspectChannel(p);
  saveProspects();
  setActiveProspect(p.id);
}
async function copyProspectText(text){
  try{await navigator.clipboard.writeText(text);return true}catch(e){return false}
}
async function openProspectEmail(id){
  const p=prospects.find(x=>x.id===id);if(!p)return;
  saveProspectTouch(p,'email');
  await copyProspectText(prospectMessage(p));
  window.open(prospectEmailUrl(p),'_blank','noopener');
  prospectMsg(`Email preparado para ${p.name}. Mensaje copiado; revisa y manda manualmente.`,'ok');
}
async function openProspectWeb(id){
  const p=prospects.find(x=>x.id===id);if(!p)return;
  saveProspectTouch(p,'web');
  await copyProspectText(prospectMessage(p));
  if(p.link)window.open(p.link,'_blank','noopener');
  prospectMsg(`Web abierta para ${p.name}. Mensaje copiado; busca contacto, formulario, correo o WhatsApp alterno.`,'ok');
}
async function openProspectSocial(id,kind){
  const p=prospects.find(x=>x.id===id);if(!p)return;
  const url=kind==='instagram'?p.instagram:p.facebook;
  if(!url)return openPreferredProspectContact(id);
  saveProspectTouch(p,kind);
  await copyProspectText(prospectMessage(p));
  window.open(url,'_blank','noopener');
  prospectMsg(`${prospectChannelLabel(kind)} abierto para ${p.name}. Mensaje copiado; pega y manda manualmente si corresponde.`,'ok');
}
async function openProspectCall(id){
  const p=prospects.find(x=>x.id===id);if(!p)return;
  saveProspectTouch(p,'call');
  await copyProspectText(prospectCallScript(p));
  prospectMsg(`Guion de llamada copiado para ${p.name}: ${p.whatsapp||'sin telefono'}. Pide WhatsApp o correo del encargado.`,'ok');
}
function markProspectNoWhatsApp(id){
  loadProspects();
  const p=prospects.find(x=>x.id===id);if(!p)return;
  p.no_whatsapp=true;
  p.last_channel='sin_whatsapp';
  saveProspects();renderProspects();
  prospectMsg(`${p.name} marcado sin WhatsApp. Siguiente mejor canal: ${prospectChannelLabel(bestProspectChannel(p))}.`,'warn');
}
function openPreferredProspectContact(id){
  loadProspects();
  const p=prospects.find(x=>x.id===id);if(!p)return prospectMsg('No encontré ese prospecto.','bad');
  const ch=bestProspectChannel(p);
  if(ch==='whatsapp')return openProspectWhatsApp(id);
  if(ch==='email')return openProspectEmail(id);
  if(ch==='web')return openProspectWeb(id);
  if(ch==='facebook')return openProspectSocial(id,'facebook');
  if(ch==='instagram')return openProspectSocial(id,'instagram');
  if(ch==='call')return openProspectCall(id);
  return copyProspect(id);
}
function setActiveProspect(id){
  activeProspectId=id||'';
  if(activeProspectId)sessionStorage.setItem('tixuz_active_prospect',activeProspectId);
  else sessionStorage.removeItem('tixuz_active_prospect');
  renderProspectActive();
}
function activeProspect(){
  loadProspects();
  const p=prospects.find(p=>p.id===activeProspectId)||null;
  if(!p)return null;
  if(p.status==='pendiente'||p.status==='interesado'||isDueProspect(p))return p;
  return null;
}
function renderProspectActive(){
  const el=document.getElementById('prospectActive');
  const pv=document.getElementById('prospectPreview');
  const qr=document.getElementById('prospectQuickReplies');
  if(!el)return;
  const active=activeProspect();
  const next=active||nextProspect();
  if(!next){
    el.innerHTML='Siguiente: sin prospectos.';
    if(pv)pv.textContent='El mensaje se llena cuando importes un lote.';
    if(qr)qr.style.display='none';
    return;
  }
  if(qr)qr.style.display='flex';
  const label=active?'Activo':'Siguiente';
  const ch=bestProspectChannel(next);
  const phone=next.whatsapp?` · ${escHTML(next.whatsapp)}${next.no_whatsapp?' sin WhatsApp':''}`:' · sin telefono';
  const follow=next.next_followup?` · sigue ${escHTML(shortDate(next.next_followup))}`:'';
  el.innerHTML=`${label}: <strong>${escHTML(next.name)}</strong> · ${escHTML(next.city||'sin ciudad')}${phone}${follow} <span class="channel-badge ${ch==='call'?'warn':''}">${escHTML(prospectChannelLabel(ch))}</span>`;
  const contactBits=[next.email&&`Email ${next.email}`,next.link&&'Web',next.facebook&&'Facebook',next.instagram&&'Instagram'].filter(Boolean).join(' · ');
  if(pv)pv.textContent=`Siguiente acción: ${prospectChannelLabel(ch)}${contactBits?' · '+contactBits:''}. Mensaje: ${prospectMessage(next).slice(0,190)}${prospectMessage(next).length>190?'...':''}`;
}
async function copyActiveProspectReply(kind='followup'){
  loadProspects();
  const p=activeProspect()||nextProspect();
  if(!p)return prospectMsg('No hay prospecto activo para responder.','warn');
  const key=PROSPECT_TEMPLATES[kind]?kind:'followup';
  const msg=fillTemplate(PROSPECT_TEMPLATES[key],p);
  const ok=await copyProspectText(msg);
  p.last_message=msg.slice(0,1000);
  p.last_contact=new Date().toISOString();
  if(key==='inventory'){
    p.status='interesado';
    p.next_followup=localISODate(1);
  }else if(key==='followup'){
    p.status='contactado';
    p.next_followup=localISODate(2);
  }else if(p.status==='pendiente'){
    p.status='contactado';
    p.next_followup=localISODate(1);
  }
  p.last_channel=p.last_channel||bestProspectChannel(p);
  activeProspectId=p.id;
  sessionStorage.setItem('tixuz_active_prospect',activeProspectId);
  saveProspects();renderProspects();
  const labels={followup:'seguimiento',cost:'costo $0',trust:'confianza',inventory:'link de carga'};
  prospectMsg(`${ok?'Copiada':'Respuesta lista'}: ${labels[key]||key} para ${p.name}.`, ok?'ok':'warn');
}
async function copyProspect(id){
  const p=prospects.find(x=>x.id===id);if(!p)return;
  const msg=prospectMessage(p);
  await navigator.clipboard.writeText(msg);
  p.last_message=msg.slice(0,1000);
  saveProspects();
  setActiveProspect(id);
  prospectMsg(`Mensaje copiado para ${p.name}`,'ok');
}
function openProspectWhatsApp(id){
  const p=prospects.find(x=>x.id===id);if(!p)return;
  const url=prospectWaUrl(p);
  if(!url)return copyProspect(id);
  saveProspectTouch(p,'whatsapp');
  navigator.clipboard?.writeText(prospectMessage(p)).catch(()=>{});
  window.open(url,'_blank','noopener');
  prospectMsg(`WhatsApp abierto y mensaje copiado para ${p.name}. Si WhatsApp dice que el número no existe, ese teléfono no tiene WhatsApp; marca No / descartar o intenta otro teléfono público.`,'ok');
}
function setProspectStatus(id,status){
  loadProspects();
  const p=prospects.find(x=>x.id===id);if(!p)return;
  p.status=status;
  if(status==='contactado'){
    p.last_contact=new Date().toISOString();
    if(!p.next_followup)p.next_followup=localISODate(2);
  }
  if(status==='interesado'||status==='no'){
    p.last_contact=new Date().toISOString();
    p.next_followup='';
  }
  saveProspects();renderProspects();
}
function setProspectFollowup(id,days){
  loadProspects();
  const p=prospects.find(x=>x.id===id);if(!p)return;
  p.next_followup=localISODate(days);
  if(p.status==='pendiente')p.status='contactado';
  saveProspects();renderProspects();
  prospectMsg(`Seguimiento para ${p.name}: ${days===0?'hoy':shortDate(p.next_followup)}`,'ok');
}
function editProspectNotes(id){
  loadProspects();
  const p=prospects.find(x=>x.id===id);if(!p)return;
  const next=prompt('Notas del prospecto',p.notes||'');
  if(next===null)return;
  p.notes=String(next||'').trim().slice(0,500);
  saveProspects();renderProspects();
}
function nextProspect(){
  loadProspects();
  return prospects.find(p=>prospectHasAnyChannel(p)&&isDueProspect(p))||
    prospects.find(p=>p.status==='pendiente'&&prospectHasAnyChannel(p))||null;
}
function advanceActiveProspect(){
  const next=nextProspect();
  activeProspectId=next?.id||'';
  if(activeProspectId)sessionStorage.setItem('tixuz_active_prospect',activeProspectId);
  else sessionStorage.removeItem('tixuz_active_prospect');
  return next;
}
function openNextProspect(){
  const p=nextProspect();
  if(!p)return prospectMsg('No hay prospectos pendientes con canal de contacto.','warn');
  openPreferredProspectContact(p.id);
}
async function copyNextProspect(){
  const p=nextProspect();
  if(!p)return prospectMsg('No hay prospectos pendientes.','warn');
  setActiveProspect(p.id);
  await copyProspect(p.id);
}
function prepareNextProspect(){
  const p=activeProspect()||nextProspect();
  if(!p)return prospectMsg('No hay prospectos pendientes con canal de contacto.','warn');
  openPreferredProspectContact(p.id);
}
function markActiveProspectSent(days=1){
  loadProspects();
  const p=activeProspect()||nextProspect();
  if(!p)return prospectMsg('No hay prospecto activo. Primero prepara el siguiente.','warn');
  p.status='contactado';
  p.last_contact=new Date().toISOString();
  p.next_followup=localISODate(days);
  p.last_channel=p.last_channel||bestProspectChannel(p);
  saveProspects();
  const next=advanceActiveProspect();
  renderProspects();
  prospectMsg(`${p.name} marcado como enviado. Seguimiento: ${shortDate(p.next_followup)}.${next?` Siguiente: ${next.name}.`:' Ya no quedan pendientes con canal.'}`, 'ok');
}
function prospectToLot(id){
  const p=prospects.find(x=>x.id===id);if(!p)return;
  closeO('prospectOv');openLotIntake();
  document.getElementById('lotName').value=p.name||'';
  document.getElementById('lotWA').value=p.whatsapp||'';
  document.getElementById('lotCity').value=p.city||'';
  setProspectStatus(id,'interesado');
}
function removeProspect(id){
  prospects=prospects.filter(p=>p.id!==id);saveProspects();renderProspects();
}
function exportProspects(){
  loadProspects();
  const headers=['nombre','whatsapp','sin_whatsapp','email','web','facebook','instagram','mejor_canal','ciudad','fuente','autos','estado','ultimo_contacto','proximo_seguimiento','ultimo_canal','notas','ultimo_mensaje'];
  const lines=[headers.join(',')].concat(prospects.map(p=>[p.name,p.whatsapp,p.no_whatsapp?'si':'',p.email,p.link,p.facebook,p.instagram,prospectChannelLabel(bestProspectChannel(p)),p.city,p.source,p.autos,p.status,p.last_contact,p.next_followup,p.last_channel,p.notes,p.last_message].map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(',')));
  const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='tixuz-prospectos-lotes.csv';a.click();URL.revokeObjectURL(a.href);
}
function prospectMatchesView(p){
  const filter=document.getElementById('prospectFilter')?.value||'all';
  if(filter==='due'&&!isDueProspect(p))return false;
  if(filter!=='all'&&filter!=='due'&&p.status!==filter)return false;
  const q=(document.getElementById('prospectSearch')?.value||'').trim().toLowerCase();
  if(!q)return true;
  return [p.name,p.whatsapp,p.email,p.link,p.facebook,p.instagram,p.city,p.source,p.autos,p.status,p.notes,p.next_followup,bestProspectChannel(p)].join(' ').toLowerCase().includes(q);
}
function prospectRank(p){
  if(isDueProspect(p))return 0;
  if(p.status==='pendiente')return 1;
  if(p.status==='contactado')return 2;
  if(p.status==='interesado')return 3;
  return 4;
}
function todayProspectQueue(limit=PROSPECT_DAILY_GOAL){
  loadProspects();
  return prospects
    .filter(p=>prospectHasAnyChannel(p)&&(isDueProspect(p)||p.status==='pendiente'))
    .sort((a,b)=>prospectRank(a)-prospectRank(b)||String(a.created_at).localeCompare(String(b.created_at)))
    .slice(0,Math.max(1,Number(limit)||PROSPECT_DAILY_GOAL));
}
function renderProspectTodayPlan(stats={}){
  const box=document.getElementById('prospectTodayPlan');
  if(!box)return;
  const touched=Number(stats.today||0);
  const remaining=Math.max(PROSPECT_DAILY_GOAL-touched,0);
  if(!prospects.length){
    box.innerHTML='<strong>Plan de hoy</strong><p>Carga prospectos para que Tixuz arme la cola diaria.</p>';
    return;
  }
  const limit=remaining>0?Math.min(PROSPECT_DAILY_GOAL,Math.max(remaining,3)):3;
  const queue=todayProspectQueue(limit);
  if(!queue.length){
    box.innerHTML=`<strong>Plan de hoy: ${touched}/${PROSPECT_DAILY_GOAL}</strong><p>No hay prospectos pendientes con canal. Importa mas lotes o revisa interesados.</p>`;
    return;
  }
  const title=remaining>0?`Plan de hoy: faltan ${remaining} contactos`:`Meta de hoy completa: ${touched}/${PROSPECT_DAILY_GOAL}`;
  box.innerHTML=`<strong>${escHTML(title)}</strong><p>Trabaja de arriba hacia abajo: preparar contacto, enviar, marcar enviado y dejar seguimiento para manana.</p><div class="today-list">${queue.map((p,i)=>`<div class="today-pill"><b>${i+1}. ${escHTML(p.name)}</b>${escHTML(p.city||'Sin ciudad')} · ${escHTML(prospectChannelLabel(bestProspectChannel(p)))}${isDueProspect(p)?' · seguimiento hoy':''}</div>`).join('')}</div>`;
}
function todayProspectPlanText(){
  loadProspects();
  const touched=prospects.filter(isProspectTouchedToday).length;
  const remaining=Math.max(PROSPECT_DAILY_GOAL-touched,0);
  const queue=todayProspectQueue(remaining>0?Math.min(PROSPECT_DAILY_GOAL,Math.max(remaining,3)):3);
  const lines=[
    `Plan Tixuz Prospectos ${localISODate(0)}`,
    `Enviados hoy: ${touched}/${PROSPECT_DAILY_GOAL}`,
    remaining>0?`Faltan: ${remaining}`:'Meta diaria completa',
    ''
  ];
  queue.forEach((p,i)=>{
    lines.push(`${i+1}. ${p.name} | ${p.city||'sin ciudad'} | ${prospectChannelLabel(bestProspectChannel(p))} | ${p.whatsapp||p.email||p.link||p.facebook||p.instagram||''}`);
  });
  return lines.join('\n').trim();
}
async function copyTodayProspectPlan(){
  const text=todayProspectPlanText();
  await copyProspectText(text);
  prospectMsg('Plan de hoy copiado. Trabaja la lista y marca cada envio.', 'ok');
}
function renderProspects(){
  loadProspects();
  renderProspectSources();
  const stats={pendiente:0,contactado:0,interesado:0,no:0,due:0};
  prospects.forEach(p=>stats[p.status]=(stats[p.status]||0)+1);
  stats.due=prospects.filter(isDueProspect).length;
  stats.today=prospects.filter(isProspectTouchedToday).length;
  const s=document.getElementById('prospectStats');
  if(s)s.innerHTML=`<div class="pstat"><strong>${stats.today||0}/${PROSPECT_DAILY_GOAL}</strong><span>Enviados hoy</span></div><div class="pstat"><strong>${stats.pendiente||0}</strong><span>Pendientes</span></div><div class="pstat"><strong>${stats.due||0}</strong><span>Tocan hoy</span></div><div class="pstat"><strong>${stats.contactado||0}</strong><span>Contactados</span></div><div class="pstat"><strong>${stats.interesado||0}</strong><span>Interesados</span></div><div class="pstat"><strong>${stats.no||0}</strong><span>No / descartar</span></div>`;
  renderProspectTodayPlan(stats);
  renderProspectActive();
  const table=document.getElementById('prospectTable');
  if(!table)return;
  if(!prospects.length){table.innerHTML='<div style="padding:16px;color:var(--text3);font-size:.82rem">Carga prospectos para empezar la cola.</div>';prospectMsg('Sin prospectos todavía.');return}
  const rows=prospects.filter(prospectMatchesView).sort((a,b)=>prospectRank(a)-prospectRank(b)||String(a.created_at).localeCompare(String(b.created_at)));
  prospectMsg(`${prospects.length} prospectos cargados · ${rows.length} visibles · siguiente: ${(nextProspect()?.name)||'ninguno'}.`);
  if(!rows.length){table.innerHTML='<div style="padding:16px;color:var(--text3);font-size:.82rem">No hay prospectos con ese filtro.</div>';return}
  table.innerHTML=`<table><thead><tr><th>Estado</th><th>Lote</th><th>Fuente</th><th>Seguimiento</th><th>Mensaje / acciones</th></tr></thead><tbody>${rows.map(p=>{
    const wa=prospectWaUrl(p);
    const sourceUrl=prospectSafeLink(p.link);
    const due=isDueProspect(p);
    const ch=bestProspectChannel(p);
    const channelClass=ch==='call'?'warn':'';
    const contacts=[p.whatsapp&&`Tel ${p.whatsapp}${p.no_whatsapp?' sin WA':''}`,p.email&&`Email`,p.link&&`Web`,p.facebook&&`Facebook`,p.instagram&&`Instagram`].filter(Boolean).map(x=>`<span>${escHTML(x)}</span>`).join('');
    return `<tr>
      <td><span class="pstatus ${escAttr(p.status)}">${escHTML(p.status)}</span></td>
      <td><strong>${escHTML(p.name)}</strong><br><span class="pmeta">${escHTML(p.city||'Sin ciudad')} · ${escHTML(p.autos||'?')} autos</span><br><span class="channel-badge ${channelClass}">${escHTML(prospectChannelLabel(ch))}</span>${contacts?`<div class="contact-list">${contacts}</div>`:''}${p.notes?`<div class="pmeta">${escHTML(p.notes)}</div>`:''}</td>
      <td>${sourceUrl?`<a href="${escAttr(sourceUrl)}" target="_blank" rel="noopener" style="color:var(--accent)">web</a>`:escHTML(p.source||'manual')}${p.email?`<div class="pmeta">${escHTML(p.email)}</div>`:''}${p.facebook?`<div><a href="${escAttr(p.facebook)}" target="_blank" rel="noopener" style="color:var(--accent)">Facebook</a></div>`:''}${p.instagram?`<div><a href="${escAttr(p.instagram)}" target="_blank" rel="noopener" style="color:var(--accent)">Instagram</a></div>`:''}</td>
      <td><span class="pdue ${due?'due':''}">${p.next_followup?(due?'Toca hoy ':'Sigue ')+shortDate(p.next_followup):'Sin fecha'}</span>${p.last_contact?`<div class="pmeta">Ultimo ${shortDate(p.last_contact)}</div>`:''}${p.last_channel?`<div class="pmeta">Canal: ${escHTML(prospectChannelLabel(p.last_channel))}</div>`:''}</td>
      <td><div class="pactions">
        <button onclick="openPreferredProspectContact('${escJS(p.id)}')">Preparar</button>
        ${wa?`<button onclick="openProspectWhatsApp('${escJS(p.id)}')">WhatsApp</button>`:''}
        ${p.whatsapp?`<button onclick="markProspectNoWhatsApp('${escJS(p.id)}')">Sin WhatsApp</button>`:''}
        ${p.email?`<button onclick="openProspectEmail('${escJS(p.id)}')">Email</button>`:''}
        ${p.link?`<button onclick="openProspectWeb('${escJS(p.id)}')">Web</button>`:''}
        ${p.facebook?`<button onclick="openProspectSocial('${escJS(p.id)}','facebook')">Facebook</button>`:''}
        ${p.instagram?`<button onclick="openProspectSocial('${escJS(p.id)}','instagram')">Instagram</button>`:''}
        ${p.whatsapp?`<button onclick="openProspectCall('${escJS(p.id)}')">Llamar</button>`:''}
        <button onclick="copyProspect('${escJS(p.id)}')">Copiar</button>
        <button onclick="setProspectStatus('${escJS(p.id)}','contactado')">Contactado</button>
        <button onclick="setProspectFollowup('${escJS(p.id)}',1)">Mañana</button>
        <button onclick="setProspectFollowup('${escJS(p.id)}',3)">3 días</button>
        <button onclick="editProspectNotes('${escJS(p.id)}')">Nota</button>
        <button onclick="setProspectStatus('${escJS(p.id)}','interesado')">Interesado</button>
        <button onclick="copyLotIntakeLinkForProspect('${escJS(p.id)}')">Link carga</button>
        <button onclick="setProspectStatus('${escJS(p.id)}','no')">No</button>
        <button onclick="removeProspect('${escJS(p.id)}')">Quitar</button>
      </div></td>
    </tr>`;
  }).join('')}</tbody></table>`;
}

// ── LOT FOUNDER INTAKE ──
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
    description:String(findVal(raw,['description','descripcion','descripción'])||title||'Inventario de lote fundador Tixuz Autos.').trim(),
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
async function submitLotFounder(){
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
    const r=await fetch('/.netlify/functions/lot-founder-intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lot,listings:valid,authorized:true})});
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
  step=1;uploadedImgs=[];selPlan='free_launch';
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
  renderPhotoGrid();plans = plans.length ? withLaunchPlan(plans) : [...DEFAULT_PLANS];renderPlanCards();loadPlans();openO('sellOv');scrollSellModalTop();
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
  if(n===3){plans = plans.length ? withLaunchPlan(plans) : [...DEFAULT_PLANS];renderPlanCards();updatePublishButton();}
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
function renderPhotoGrid(){
  let h='';
  for(let i=0;i<8;i++){
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
  const files=Array.from(ev.target.files).slice(0,8-uploadedImgs.length);
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
    if(Array.isArray(data)&&data.length){plans=withLaunchPlan(data);renderPlanCards();renderPlansBody();updatePublishButton()}
  }catch(err){console.warn('Usando planes locales por fallback',err)}
}
function planBullets(p,compact=false){
  if(p.key==='free_launch')return `<li>${p.max_photos} fotos</li><li>${p.active_days} días activo</li><li>Sin pago por lanzamiento</li><li>Revisión humana antes de publicar</li><li>Contacto directo por WhatsApp</li>`;
  return `<li>${p.max_photos} fotos</li><li>${p.active_days} días${compact?'':' activo'}</li>${p.key==='featured'?'<li>Destacado en grid</li>':''}${p.key==='pro'?'<li>Siempre arriba</li><li>Estadísticas</li>':''}`;
}
function renderPlanCards(){
  const c=document.getElementById('planCards');
  if(!plans.length)plans=[...DEFAULT_PLANS];
  plans=withLaunchPlan(plans);
  if(!plans.some(p=>p.key===selPlan))selPlan=plans[0]?.key||'free_launch';
  if(!plans.length){c.innerHTML='<div style="color:var(--text3);grid-column:1/-1;text-align:center">Sin planes</div>';return}
  c.innerHTML=plans.map(p=>`<div class="pcard ${p.key===selPlan?'sel':''}" onclick="selPlanFn('${escJS(p.key)}')">
    <h4>${escHTML(p.name)}</h4>
    <div class="pp">$${Number(p.price_mxn)||0}<sub> MXN${p.interval_type==='recurring'?'/mes':''}</sub></div>
    <ul>${planBullets(p,true)}</ul>
  </div>`).join('');
  updatePublishButton();
}
function selPlanFn(k){selPlan=k;renderPlanCards();updatePublishButton()}
function renderPlansBody(){
  const planList = withLaunchPlan((plans && plans.length) ? plans : DEFAULT_PLANS);
  document.getElementById('plansBody').innerHTML=`<div class="pcards">${planList.map(p=>`<div class="pcard">
    <h4>${p.name}</h4>
    <div class="pp">$${p.price_mxn}<sub> MXN${p.interval_type==='recurring'?'/mes':''}</sub></div>
    <ul>${planBullets(p)}</ul>
  </div>`).join('')}</div>`;
}
function openPlans(){plans = plans.length ? withLaunchPlan(plans) : [...DEFAULT_PLANS];renderPlansBody();openO('plansOv')}

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
  btn.disabled=true;btn.innerHTML=selPlan==='free_launch'?'<div class="spin"></div> Enviando a revisión…':'<div class="spin"></div> Conectando con Stripe…';
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
  if(selPlan==='free_launch'){
    try{
      const ctrl = new AbortController();
      const tid = setTimeout(()=>ctrl.abort(), 12000);
      const r=await fetch('/.netlify/functions/create-free-listing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({listingData}),signal:ctrl.signal});
      clearTimeout(tid);
      const txt=await r.text();
      let d={};
      try{d=txt?JSON.parse(txt):{}}catch{d={error:txt||'Respuesta inválida del servidor'}}
      if(!r.ok||!d.ok){showPayFailure(e,btn,d.error||`No pude publicar gratis (HTTP ${r.status})`);return}
      sessionStorage.setItem('tp_wa',wa);
      sessionStorage.setItem('tp_pin',pin);
      showToast('Recibido. Tu anuncio quedó en revisión humana. Si publicaste de noche, se revisará por la mañana.','success');
      closeO('sellOv');
      await loadCars();
      document.getElementById('mlWA').value=wa;
      document.getElementById('mlPin').value=pin;
      openMyListings();
      setTimeout(loadML,350);
      btn.disabled=false;btn.textContent=publishButtonLabel();
      return;
    }catch(err){
      const msg = err && err.name==='AbortError' ? 'La publicación gratis tardó demasiado. Revisa Functions log de create-free-listing.' : 'Error de conexión al publicar gratis. Revisa Functions log de create-free-listing.';
      showPayFailure(e,btn,msg);return;
    }
  }

  try{
    const ctrl = new AbortController();
    const tid = setTimeout(()=>ctrl.abort(), 12000);
    const r=await fetch('/.netlify/functions/create-checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({listingData,plan:selPlan}),signal:ctrl.signal});
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
    sessionStorage.setItem('tp_lid',d.listing_id||'');
    sessionStorage.setItem('tp_wa',wa);
    sessionStorage.setItem('tp_pin',pin);
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
  const aliases={marca:'make',modelo:'model',ano:'year',anio:'year',año:'year',precio:'price',km:'mileage',kilometraje:'mileage',transmision:'transmission',transmisión:'transmission',combustible:'fuel_type',color:'color',ubicacion:'location',ubicación:'location',ciudad:'location',descripcion:'description',descripción:'description',fotos:'images',imagenes:'images',imágenes:'images',foto:'images',image:'images',nombre_vendedor:'seller_name',vendedor:'seller_name',whatsapp:'seller_whatsapp',telefono:'seller_whatsapp',teléfono:'seller_whatsapp',tipo_vendedor:'seller_type',tipo:'seller_type',plan:'plan',destacado:'featured',url:'source_url',link:'source_url',source_url:'source_url'};
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

function openFullSearchAI(){
  const parts=[];
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
  const pmax=parseFloat(document.getElementById('fPMax')?.value||'');
  if(year)pre.year=year;
  if(pmax)pre.price=pmax;
  openSell(pre);
}

// ── UTILS ──
function clearFilters(){
  ['fQ','fPMin','fPMax','fCity'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
  const yr=document.getElementById('fYear'); if(yr) yr.value='';
  const tr=document.getElementById('fTrans'); if(tr) tr.value='';
  const sort=document.getElementById('fSort'); if(sort) sort.value='new';
  applyFilters();
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
  if((id==='prospectOv'||id==='operatorGuideOv')&&!hasOpsAccess())return requestOpsUnlock(()=>openO(id));
  document.getElementById(id).classList.add('open');document.body.style.overflow='hidden'
}
function closeO(id){document.getElementById(id).classList.remove('open');document.body.style.overflow='';document.querySelectorAll('.field-error').forEach(n=>n.remove())}
document.querySelectorAll('.overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)closeO(o.id)}));
// Admin queda oculto en navegación pública; sigue disponible con /?admin=1 o #admin.
if(location.search.includes('admin=1')||location.hash==='#admin'){
  document.body.classList.add('show-admin');
  setTimeout(()=>{try{openAdmin()}catch{}},600);
}
initOpsMode();
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
