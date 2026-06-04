const SUPABASE_URL = Netlify.env.get('SUPABASE_URL');
const SERVICE_KEY  = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');

export default async (req) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/expire_old_listings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: '{}',
  });
  console.log('expire_old_listings status:', res.status);
};

export const config = { schedule: '@hourly' };
