// Tixuz Autos v47 · Lista anuncios propios por WhatsApp + PIN sin depender del SDK del navegador.
const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': process.env.SITE_URL || 'https://cool-kataifi-78a65b.netlify.app',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function respond(statusCode, body){ return {statusCode, headers, body: JSON.stringify(body)}; }
async function fetchWithTimeout(url, options, ms=10000){
  const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),ms);
  try{return await fetch(url,{...options,signal:ctrl.signal});} finally{clearTimeout(timer);}
}
exports.handler = async function(event){
  if(event.httpMethod==='OPTIONS')return respond(200,{ok:true});
  if(event.httpMethod!=='POST')return respond(405,{ok:false,error:'Method Not Allowed'});
  const SUPABASE_URL=process.env.SUPABASE_URL||'';
  const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_ANON_KEY||'';
  if(!SUPABASE_URL||!KEY)return respond(500,{ok:false,error:'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Netlify',stage:'env'});
  let body={};
  try{body=JSON.parse(event.body||'{}')}catch{return respond(400,{ok:false,error:'JSON inválido',stage:'input'});}
  const whatsapp=String(body.whatsapp||'').replace(/\D/g,'');
  const pin=String(body.pin||'');
  if(!/^\d{10}$/.test(whatsapp))return respond(400,{ok:false,error:'WhatsApp debe ser de 10 dígitos',stage:'input'});
  if(!/^\d{4}$/.test(pin))return respond(400,{ok:false,error:'PIN debe ser de 4 dígitos',stage:'input'});
  try{
    const res=await fetchWithTimeout(`${SUPABASE_URL.replace(/\/$/,'')}/rest/v1/rpc/list_my_listings`,{
      method:'POST',
      headers:{'Content-Type':'application/json',apikey:KEY,Authorization:`Bearer ${KEY}`},
      body:JSON.stringify({p_whatsapp:whatsapp,p_pin:pin})
    },10000);
    const txt=await res.text(); let data=[];
    try{data=txt?JSON.parse(txt):[]}catch{data={error:txt};}
    if(!res.ok){
      return respond(res.status,{ok:false,error:data.message||data.error||txt||`Supabase HTTP ${res.status}`,stage:'supabase_rpc'});
    }
    return respond(200,{ok:true,listings:Array.isArray(data)?data:[]});
  }catch(err){
    return respond(504,{ok:false,error:err.name==='AbortError'?'Supabase tardó demasiado en list_my_listings':(err.message||'Error consultando Supabase'),stage:'timeout_or_fetch'});
  }
};
