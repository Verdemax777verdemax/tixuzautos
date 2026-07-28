-- =====================================================================
-- Tixuz Autos Marketplace — Migration V13
-- Agrega soporte para listings agregados de fuentes externas (MercadoLibre, etc.)
-- Corre esto UNA VEZ en Supabase > SQL Editor antes de usar la función
-- seed-from-mercadolibre.
-- =====================================================================

-- 1) Columnas nuevas
ALTER TABLE marketplace_listings
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'user';

ALTER TABLE marketplace_listings
  ADD COLUMN IF NOT EXISTS source_url TEXT DEFAULT '';

-- 2) Backfill: todos los anuncios actuales son del usuario
UPDATE marketplace_listings
  SET source = 'user'
  WHERE source IS NULL;

-- 3) Índice para filtrado rápido
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_source
  ON marketplace_listings(source);

-- 4) Unique constraint sobre stripe_ref para que el seed pueda hacer upsert
--    (si ya existe la tabla sin esta constraint, la agregamos)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketplace_listings_stripe_ref_key'
  ) THEN
    BEGIN
      ALTER TABLE marketplace_listings
        ADD CONSTRAINT marketplace_listings_stripe_ref_key UNIQUE (stripe_ref);
    EXCEPTION WHEN duplicate_table THEN NULL;
    END;
  END IF;
END $$;

-- 5) Verificación rápida: cuenta listings por fuente
SELECT source, COUNT(*) AS total
FROM marketplace_listings
GROUP BY source
ORDER BY total DESC;

-- 6) Exponer fuente externa en la vista pública (sin exponer teléfono/PIN)
--    Útil para mostrar badge MercadoLibre y botón "Ver anuncio original" si se usa el seed.
drop view if exists public.public_listings;
create view public.public_listings
with (security_invoker = true) as
select
  id, make, model, year, price, mileage, transmission, fuel_type,
  color, location, description, images, seller_name, seller_type,
  plan, featured, status, verification_badge,
  view_count, whatsapp_click_count,
  source, source_url,
  expires_at, created_at, updated_at
from public.marketplace_listings
where status = 'active'
  and (expires_at is null or expires_at > now());

grant select on public.public_listings to anon, authenticated;
