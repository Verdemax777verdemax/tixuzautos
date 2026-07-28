-- Tixuz Autos: cierre de privacidad para marketplace_listings.
-- Ejecutar en Supabase SQL Editor.
-- Objetivo:
--   1. Nadie con la anon key puede leer la tabla interna marketplace_listings.
--   2. El sitio sigue leyendo solo la vista publica public_listings.
--   3. La vista publica NO expone seller_whatsapp, owner_phone_hash ni pin_hash.

begin;

alter table public.marketplace_listings enable row level security;

-- Politicas antiguas que dejan leer la tabla completa.
drop policy if exists "Public can read listings" on public.marketplace_listings;
drop policy if exists "public_read_active_marketplace" on public.marketplace_listings;
drop policy if exists "anon_insert_marketplace" on public.marketplace_listings;
drop policy if exists "anon_update_marketplace" on public.marketplace_listings;
drop policy if exists "anon_delete_marketplace" on public.marketplace_listings;

-- Quita acceso directo a la tabla para llaves publicas.
revoke all on table public.marketplace_listings from anon;
revoke all on table public.marketplace_listings from authenticated;

-- Rehacer la vista publica como vista de seguridad del dueno.
-- Asi el publico puede leer SOLO estos campos seguros, aunque la tabla interna quede cerrada.
drop view if exists public.public_listings;
create view public.public_listings as
select
  id,
  make,
  model,
  year,
  price,
  mileage,
  transmission,
  fuel_type,
  color,
  location,
  description,
  images,
  seller_name,
  seller_type,
  plan,
  featured,
  status,
  verification_badge,
  view_count,
  whatsapp_click_count,
  expires_at,
  created_at,
  updated_at
from public.marketplace_listings
where status = 'active'
  and (expires_at is null or expires_at > now());

grant select on public.public_listings to anon, authenticated;

commit;

-- Prueba rapida despues de ejecutar:
-- 1) /rest/v1/public_listings?select=id,make,model&limit=1 debe responder 200.
-- 2) /rest/v1/marketplace_listings?select=id,seller_whatsapp&limit=1 debe responder 401/403 o 0 filas.
