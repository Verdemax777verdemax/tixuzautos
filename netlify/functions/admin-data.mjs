import jwt from 'jsonwebtoken';
const SUPABASE_URL = Netlify.env.get('SUPABASE_URL');
const SERVICE_KEY  = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');
const JWT_SECRET   = Netlify.env.get('ADMIN_JWT_SECRET') || Netlify.env.get('STRIPE_WEBHOOK_SECRET');

function verifyAdmin(req) {
  if (!JWT_SECRET) return false;
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace('Bearer ', '');
  try { jwt.verify(token, JWT_SECRET); return true; } catch { return false; }
}

export default async (req) => {
  if (!SUPABASE_URL || !SERVICE_KEY || !JWT_SECRET) {
    return new Response(JSON.stringify({ listings: [], plans: [], error: 'Admin no configurado. Faltan variables privadas en Netlify.' }), { status: 500, headers:{'Content-Type':'application/json'} });
  }
  if (!verifyAdmin(req)) return new Response('No autorizado', { status: 401 });

  const [listingsRes, plansRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/marketplace_listings?select=id,make,model,year,price,status,plan,payment_status,seller_name,seller_whatsapp,seller_type,location,images,created_at,featured,verification_badge,manual_review,description,mileage,transmission,fuel_type,color&order=created_at.desc&limit=250`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
    }),
    fetch(`${SUPABASE_URL}/rest/v1/pricing_plans?select=*`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
    }),
  ]);

  if (!listingsRes.ok) {
    const txt = await listingsRes.text().catch(()=> '');
    return new Response(JSON.stringify({ listings: [], plans: [], error: 'No pude leer anuncios: '+txt.slice(0,160) }), { status: 200, headers:{'Content-Type':'application/json'} });
  }
  const listings = await listingsRes.json();
  const plans    = plansRes.ok ? await plansRes.json() : [];

  return new Response(JSON.stringify({ listings, plans }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
