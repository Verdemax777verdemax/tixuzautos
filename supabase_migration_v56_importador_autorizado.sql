-- Tixuz Autos v56 — soporte para inventario real autorizado
-- Corre esto UNA VEZ en Supabase > SQL Editor si quieres conservar source/source_url.

ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'user';

ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS source_url TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_source
  ON public.marketplace_listings(source);

UPDATE public.marketplace_listings
SET source = 'user'
WHERE source IS NULL OR source = '';

DROP VIEW IF EXISTS public.public_listings;
CREATE VIEW public.public_listings
WITH (security_invoker = true) AS
SELECT
  id, make, model, year, price, mileage, transmission, fuel_type,
  color, location, description, images, seller_name, seller_type,
  plan, featured, status, verification_badge,
  view_count, whatsapp_click_count,
  source, source_url,
  expires_at, created_at, updated_at
FROM public.marketplace_listings
WHERE status = 'active'
  AND (expires_at IS NULL OR expires_at > now());

GRANT SELECT ON public.public_listings TO anon, authenticated;
