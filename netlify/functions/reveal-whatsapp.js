// Tixuz Autos v47 · Revela WhatsApp usando process.env en Netlify Functions.
const crypto = require('crypto');
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
  const KEY=process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'';
  if(!SUPABASE_URL||!KEY)return respond(500,{ok:false,error:'Faltan SUPABASE_URL o SUPABASE_ANON_KEY',stage:'env'});
  let body={};
  try{body=JSON.parse(event.body||'{}')}catch{return respond(400,{ok:false,error:'JSON inválido',stage:'input'});}
  const listing_id=String(body.listing_id||'').trim();
  if(!listing_id)return respond(400,{ok:false,error:'listing_id requerido',stage:'input'});
  const rawIp=(event.headers['x-forwarded-for']||event.headers['client-ip']||'unknown').split(',')[0].trim();
  const ipHash=crypto.createHash('sha256').update('tixuz-ip-'+rawIp).digest('hex');
  try{
    const res=await fetchWithTimeout(`${SUPABASE_URL.replace(/\/$/,'')}/rest/v1/rpc/reveal_whatsapp`,{
      method:'POST',
      headers:{'Content-Type':'application/json',apikey:KEY,Authorization:`Bearer ${KEY}`},
      body:JSON.stringify({p_listing_id:listing_id,p_ip_hash:ipHash})
    },10000);
    const txt=await res.text(); let data={};
    try{data=txt?JSON.parse(txt):{}}catch{data={ok:false,error:txt};}
    return respond(res.ok?200:res.status,data);
  }catch(err){
    return respond(504,{ok:false,error:err.name==='AbortError'?'Supabase tardó demasiado al revelar WhatsApp':(err.message||'Error revelando WhatsApp'),stage:'timeout_or_fetch'});
  }
};
