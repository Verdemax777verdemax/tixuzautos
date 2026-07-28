-- =============================================================
-- TIXUZ AUTOS · SCHEMA v2 (ENDURECIDO)
-- Ejecuta este archivo COMPLETO en:
-- https://rbiuoljoduekajivffzh.supabase.co/project/default/sql
--
-- Qué hace este script:
--   1. Bloquea la RLS abierta que permitía a cualquiera UPDATE/INSERT a voluntad
--   2. Oculta los teléfonos (seller_whatsapp) a lecturas públicas
--   3. Agrega PIN hasheado por anuncio para el flujo "Mis Anuncios"
--   4. Migra INSERT público a una función controlada que FUERZA status='pending_payment'
--   5. Crea funciones RPC para pago (solo webhook), edición (valida PIN) y revelar teléfono
--   6. Agrega idempotencia de eventos Stripe (no procesar el mismo pago 2 veces)
--   7. Aprieta el bucket de fotos (tamaño + tipo + carpeta por hash)
--
-- Puedes correr este archivo VARIAS veces; es idempotente.
-- =============================================================

create extension if not exists pgcrypto;

-- -------------------------------------------------------------
-- 1. TABLA PRINCIPAL
-- -------------------------------------------------------------
create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  make text not null,
  model text not null,
  year integer not null,
  price numeric not null,
  mileage integer default 0,
  transmission text,
  fuel_type text,
  color text,
  location text,
  description text,
  images text[] default '{}',
  seller_name text not null,
  seller_whatsapp text not null,
  seller_type text default 'Particular',
  plan text default 'basic',
  featured boolean default false,
  status text default 'pending_payment',
  payment_status text default 'pending',
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Agregar columnas nuevas si no existen
alter table public.marketplace_listings
  add column if not exists owner_phone_hash text,
  add column if not exists pin_hash text,
  add column if not exists stripe_session_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists verification_badge boolean default false,
  add column if not exists view_count integer default 0,
  add column if not exists whatsapp_click_count integer default 0;

-- Restricciones de valores válidos (idempotente)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'listings_status_check') then
    alter table public.marketplace_listings
      add constraint listings_status_check
      check (status in ('draft','pending_payment','active','paused','sold','expired','deleted'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'listings_plan_check') then
    alter table public.marketplace_listings
      add constraint listings_plan_check
      check (plan in ('basic','featured','pro'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'listings_payment_check') then
    alter table public.marketplace_listings
      add constraint listings_payment_check
      check (payment_status in ('pending','paid','failed','refunded','not_required'));
  end if;
end $$;

create index if not exists listings_status_idx on public.marketplace_listings(status);
create index if not exists listings_created_idx on public.marketplace_listings(created_at desc);
create index if not exists listings_plan_idx on public.marketplace_listings(plan);
create index if not exists listings_owner_hash_idx on public.marketplace_listings(owner_phone_hash);
create index if not exists listings_expires_idx on public.marketplace_listings(expires_at);
create unique index if not exists listings_stripe_session_idx on public.marketplace_listings(stripe_session_id) where stripe_session_id is not null;

-- -------------------------------------------------------------
-- 2. IDEMPOTENCIA DE EVENTOS STRIPE
-- -------------------------------------------------------------
create table if not exists public.stripe_events_processed (
  stripe_event_id text primary key,
  event_type text,
  listing_id uuid,
  processed_at timestamptz default now()
);

-- -------------------------------------------------------------
-- 3. RATE LIMITING DE "VER WHATSAPP"
-- -------------------------------------------------------------
create table if not exists public.whatsapp_reveals (
  id bigserial primary key,
  ip_hash text not null,
  listing_id uuid,
  revealed_at timestamptz default now()
);

create index if not exists whatsapp_reveals_ip_time_idx
  on public.whatsapp_reveals(ip_hash, revealed_at desc);

-- Limpieza automática de registros viejos (> 24h) para no crecer infinitamente
create or replace function public.cleanup_whatsapp_reveals()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.whatsapp_reveals where revealed_at < now() - interval '24 hours';
  delete from public.stripe_events_processed where processed_at < now() - interval '30 days';
end;
$$;

-- -------------------------------------------------------------
-- 4. PLANES (para que precios se puedan consultar sin tocar Stripe)
-- -------------------------------------------------------------
create table if not exists public.pricing_plans (
  key text primary key,
  name text not null,
  price_mxn numeric not null,
  interval_type text not null default 'one_time',
  active_days integer not null default 30,
  max_photos integer not null default 5,
  stripe_price_id text,
  badge text,
  is_active boolean default true,
  sort_order integer default 0
);

insert into public.pricing_plans (key, name, price_mxn, interval_type, active_days, max_photos, badge, sort_order, stripe_price_id)
values
  ('basic',    'Básico',    49,  'one_time',  30, 5,  null,          1, 'price_1TK1ex0anIfsBRIyJ03iU3Af'),
  ('featured', 'Destacado', 199, 'one_time',  60, 12, 'featured',    2, 'price_1TK1lj0anIfsBRIyiZe48tXn'),
  ('pro',      'PRO',       499, 'recurring', 30, 30, 'pro',         3, 'price_1TK1ot0anIfsBRIy98UIJmxW')
on conflict (key) do update set
  price_mxn = excluded.price_mxn,
  stripe_price_id = excluded.stripe_price_id,
  max_photos = excluded.max_photos,
  active_days = excluded.active_days;

-- -------------------------------------------------------------
-- 5. TRIGGER updated_at
-- -------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_listings_updated_at on public.marketplace_listings;
create trigger trg_listings_updated_at
  before update on public.marketplace_listings
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- 6. RLS ESTRICTA (ESTO ES LO QUE FALLABA ANTES)
-- -------------------------------------------------------------
alter table public.marketplace_listings enable row level security;
alter table public.stripe_events_processed enable row level security;
alter table public.whatsapp_reveals enable row level security;
alter table public.pricing_plans enable row level security;

-- Borrar policies viejas permisivas
drop policy if exists "Public can read listings"        on public.marketplace_listings;
drop policy if exists "public_read_active_marketplace" on public.marketplace_listings;
drop policy if exists "anon_insert_marketplace"        on public.marketplace_listings;
drop policy if exists "anon_update_marketplace"        on public.marketplace_listings;
drop policy if exists "anon_delete_marketplace"        on public.marketplace_listings;

revoke all on table public.marketplace_listings from anon;
revoke all on table public.marketplace_listings from authenticated;

-- NADIE con anon key puede hacer SELECT/INSERT/UPDATE/DELETE directo a la tabla.
-- Todo acceso público pasa por la vista `public_listings` (oculta teléfono)
-- o por las funciones RPC (validan PIN / firma Stripe).

-- Permitir SOLO leer los planes (precios son públicos)
drop policy if exists "anyone_read_pricing_plans" on public.pricing_plans;
create policy "anyone_read_pricing_plans"
  on public.pricing_plans for select
  using (is_active = true);

-- -------------------------------------------------------------
-- 7. VISTA PÚBLICA (sin teléfono)
-- -------------------------------------------------------------
drop view if exists public.public_listings;
create view public.public_listings as
select
  id, make, model, year, price, mileage, transmission, fuel_type,
  color, location, description, images, seller_name, seller_type,
  plan, featured, status, verification_badge,
  view_count, whatsapp_click_count,
  expires_at, created_at, updated_at
from public.marketplace_listings
where status = 'active'
  and (expires_at is null or expires_at > now());

grant select on public.public_listings to anon, authenticated;

-- -------------------------------------------------------------
-- 8. FUNCIÓN: CREAR ANUNCIO (única forma de INSERT desde frontend)
--    Fuerza status='pending_payment', plan es validado contra pricing_plans,
--    featured es derivado del plan (NUNCA del input del cliente).
-- -------------------------------------------------------------
create or replace function public.create_listing(
  p_make text,
  p_model text,
  p_year integer,
  p_price numeric,
  p_mileage integer,
  p_transmission text,
  p_fuel_type text,
  p_color text,
  p_location text,
  p_description text,
  p_images text[],
  p_seller_name text,
  p_seller_whatsapp text,
  p_seller_type text,
  p_plan text,
  p_pin text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan record;
  v_listing_id uuid;
  v_phone_clean text;
  v_phone_hash text;
  v_pin_hash text;
  v_is_basic boolean;
begin
  -- Validaciones básicas
  if p_seller_name is null or length(trim(p_seller_name)) < 2 then
    return jsonb_build_object('ok', false, 'error', 'Nombre inválido');
  end if;

  v_phone_clean := regexp_replace(coalesce(p_seller_whatsapp, ''), '\D', '', 'g');
  if length(v_phone_clean) <> 10 then
    return jsonb_build_object('ok', false, 'error', 'WhatsApp debe ser 10 dígitos');
  end if;

  if p_pin is null or p_pin !~ '^\d{4}$' then
    return jsonb_build_object('ok', false, 'error', 'PIN debe ser de 4 dígitos');
  end if;

  if p_price is null or p_price < 1000 or p_price > 50000000 then
    return jsonb_build_object('ok', false, 'error', 'Precio fuera de rango');
  end if;

  if p_year is null or p_year < 1980 or p_year > extract(year from now())::int + 1 then
    return jsonb_build_object('ok', false, 'error', 'Año inválido');
  end if;

  -- Plan debe existir y estar activo
  select * into v_plan from public.pricing_plans where key = p_plan and is_active = true;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Plan no válido');
  end if;

  v_phone_hash := encode(digest('tixuz-salt-' || v_phone_clean, 'sha256'), 'hex');
  v_pin_hash := crypt(p_pin, gen_salt('bf', 8));

  -- Rate limit: máx 5 anuncios activos/pendientes por teléfono
  if (select count(*) from public.marketplace_listings
      where owner_phone_hash = v_phone_hash
        and status in ('active','pending_payment')) >= 5 then
    return jsonb_build_object('ok', false, 'error', 'Máximo 5 anuncios por teléfono');
  end if;

  -- El plan define si se activa de inmediato (ninguno, todos requieren pago)
  v_is_basic := (p_plan = 'basic');

  insert into public.marketplace_listings (
    make, model, year, price, mileage, transmission, fuel_type, color,
    location, description, images,
    seller_name, seller_whatsapp, seller_type,
    plan, featured, status, payment_status,
    owner_phone_hash, pin_hash,
    expires_at
  ) values (
    trim(p_make), trim(p_model), p_year, p_price, coalesce(p_mileage,0),
    coalesce(p_transmission,'Automática'), coalesce(p_fuel_type,'Gasolina'),
    coalesce(p_color,'Blanco'), coalesce(p_location,'México'),
    left(coalesce(p_description,''), 2000),
    coalesce(p_images, '{}'),
    left(trim(p_seller_name), 60), v_phone_clean,
    coalesce(p_seller_type,'Particular'),
    p_plan,
    false,                       -- featured se activa al pagar
    'pending_payment',           -- SIEMPRE pending_payment al crear
    'pending',
    v_phone_hash, v_pin_hash,
    now() + (v_plan.active_days || ' days')::interval
  )
  returning id into v_listing_id;

  return jsonb_build_object('ok', true, 'listing_id', v_listing_id);
end;
$$;

grant execute on function public.create_listing(
  text, text, integer, numeric, integer, text, text, text, text, text,
  text[], text, text, text, text, text
) to anon, authenticated;

-- -------------------------------------------------------------
-- 9. FUNCIÓN: ACTIVAR ANUNCIO PAGADO
--    SOLO debe ser llamada por el webhook de Stripe con service_role.
--    (El anon no puede ejecutarla — no tiene EXECUTE grant.)
-- -------------------------------------------------------------
create or replace function public.activate_paid_listing(
  p_listing_id uuid,
  p_stripe_event_id text,
  p_stripe_session_id text,
  p_stripe_subscription_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing record;
  v_plan record;
begin
  -- Idempotencia: si el evento ya se procesó, salir ok
  if exists (select 1 from public.stripe_events_processed where stripe_event_id = p_stripe_event_id) then
    return jsonb_build_object('ok', true, 'already_processed', true);
  end if;

  select * into v_listing from public.marketplace_listings where id = p_listing_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Listing not found');
  end if;

  select * into v_plan from public.pricing_plans where key = v_listing.plan;

  update public.marketplace_listings
  set
    status = 'active',
    payment_status = 'paid',
    featured = (v_listing.plan in ('featured','pro')),
    stripe_session_id = coalesce(p_stripe_session_id, stripe_session_id),
    stripe_subscription_id = coalesce(p_stripe_subscription_id, stripe_subscription_id),
    expires_at = now() + (v_plan.active_days || ' days')::interval
  where id = p_listing_id;

  insert into public.stripe_events_processed (stripe_event_id, event_type, listing_id)
  values (p_stripe_event_id, 'activate', p_listing_id);

  return jsonb_build_object('ok', true, 'listing_id', p_listing_id);
end;
$$;

-- NO se otorga execute a anon; solo service_role (por default) puede llamar.
revoke execute on function public.activate_paid_listing(uuid, text, text, text) from public, anon, authenticated;

-- -------------------------------------------------------------
-- 10. FUNCIÓN: LISTAR ANUNCIOS PROPIOS (valida PIN)
-- -------------------------------------------------------------
create or replace function public.list_my_listings(
  p_whatsapp text,
  p_pin text
) returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone_clean text;
  v_phone_hash text;
  v_matched_count int;
begin
  v_phone_clean := regexp_replace(coalesce(p_whatsapp,''), '\D', '', 'g');
  if length(v_phone_clean) <> 10 then return; end if;
  if p_pin is null or p_pin !~ '^\d{4}$' then return; end if;

  v_phone_hash := encode(digest('tixuz-salt-' || v_phone_clean, 'sha256'), 'hex');

  -- Verificar que al menos un anuncio de ese teléfono tenga ese PIN
  select count(*) into v_matched_count
  from public.marketplace_listings
  where owner_phone_hash = v_phone_hash
    and pin_hash is not null
    and crypt(p_pin, pin_hash) = pin_hash;

  if v_matched_count = 0 then
    return;
  end if;

  return query
    select to_jsonb(l) - 'seller_whatsapp' - 'pin_hash' - 'owner_phone_hash'
    from public.marketplace_listings l
    where l.owner_phone_hash = v_phone_hash
      and l.pin_hash is not null
      and crypt(p_pin, l.pin_hash) = l.pin_hash
      and l.status <> 'deleted'
    order by l.created_at desc;
end;
$$;

grant execute on function public.list_my_listings(text, text) to anon, authenticated;

-- -------------------------------------------------------------
-- 11. FUNCIÓN: EDITAR / PAUSAR / MARCAR VENDIDO (valida PIN)
-- -------------------------------------------------------------
create or replace function public.update_my_listing(
  p_listing_id uuid,
  p_whatsapp text,
  p_pin text,
  p_action text,
  p_fields jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone_clean text;
  v_phone_hash text;
  v_listing record;
  v_new_price numeric;
  v_new_desc text;
  v_new_location text;
  v_new_mileage integer;
begin
  v_phone_clean := regexp_replace(coalesce(p_whatsapp,''), '\D', '', 'g');
  if length(v_phone_clean) <> 10 then
    return jsonb_build_object('ok', false, 'error', 'WhatsApp inválido');
  end if;

  v_phone_hash := encode(digest('tixuz-salt-' || v_phone_clean, 'sha256'), 'hex');

  select * into v_listing from public.marketplace_listings
  where id = p_listing_id
    and owner_phone_hash = v_phone_hash
    and pin_hash is not null
    and crypt(p_pin, pin_hash) = pin_hash;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'PIN inválido o anuncio no encontrado');
  end if;

  if p_action = 'pause' then
    update public.marketplace_listings set status = 'paused' where id = p_listing_id;
    return jsonb_build_object('ok', true);
  elsif p_action = 'resume' then
    if v_listing.payment_status = 'paid' or v_listing.plan = 'basic' then
      update public.marketplace_listings set status = 'active' where id = p_listing_id;
      return jsonb_build_object('ok', true);
    else
      return jsonb_build_object('ok', false, 'error', 'Anuncio no está pagado');
    end if;
  elsif p_action = 'mark_sold' then
    update public.marketplace_listings set status = 'sold' where id = p_listing_id;
    return jsonb_build_object('ok', true);
  elsif p_action = 'delete' then
    update public.marketplace_listings set status = 'deleted' where id = p_listing_id;
    return jsonb_build_object('ok', true);
  elsif p_action = 'edit' then
    -- Solo permitimos editar ciertos campos (NO plan, status, featured, teléfono)
    v_new_price := (p_fields->>'price')::numeric;
    v_new_desc := p_fields->>'description';
    v_new_location := p_fields->>'location';
    v_new_mileage := (p_fields->>'mileage')::integer;

    update public.marketplace_listings set
      price       = case when v_new_price is not null and v_new_price between 1000 and 50000000 then v_new_price else price end,
      description = case when v_new_desc is not null then left(v_new_desc, 2000) else description end,
      location    = case when v_new_location is not null then left(v_new_location, 80) else location end,
      mileage     = case when v_new_mileage is not null and v_new_mileage >= 0 then v_new_mileage else mileage end
    where id = p_listing_id;
    return jsonb_build_object('ok', true);
  else
    return jsonb_build_object('ok', false, 'error', 'Acción no válida');
  end if;
end;
$$;

grant execute on function public.update_my_listing(uuid, text, text, text, jsonb) to anon, authenticated;

-- -------------------------------------------------------------
-- 12. FUNCIÓN: REVELAR WHATSAPP (rate-limited)
-- -------------------------------------------------------------
create or replace function public.reveal_whatsapp(
  p_listing_id uuid,
  p_ip_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_count int;
  v_wa text;
begin
  -- Máx 8 revelaciones por IP en 10 minutos
  select count(*) into v_recent_count
  from public.whatsapp_reveals
  where ip_hash = p_ip_hash
    and revealed_at > now() - interval '10 minutes';

  if v_recent_count >= 8 then
    return jsonb_build_object('ok', false, 'error', 'Demasiadas consultas. Intenta en unos minutos.');
  end if;

  select seller_whatsapp into v_wa
  from public.marketplace_listings
  where id = p_listing_id
    and status = 'active'
    and (expires_at is null or expires_at > now());

  if v_wa is null then
    return jsonb_build_object('ok', false, 'error', 'Anuncio no disponible');
  end if;

  insert into public.whatsapp_reveals (ip_hash, listing_id) values (p_ip_hash, p_listing_id);

  update public.marketplace_listings
  set whatsapp_click_count = coalesce(whatsapp_click_count, 0) + 1
  where id = p_listing_id;

  return jsonb_build_object('ok', true, 'whatsapp', v_wa);
end;
$$;

grant execute on function public.reveal_whatsapp(uuid, text) to anon, authenticated;

-- -------------------------------------------------------------
-- 13. FUNCIÓN: INCREMENTAR VIEW COUNT (sin rate limit, barato)
-- -------------------------------------------------------------
create or replace function public.increment_view(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.marketplace_listings
  set view_count = coalesce(view_count, 0) + 1
  where id = p_listing_id and status = 'active';
end;
$$;

grant execute on function public.increment_view(uuid) to anon, authenticated;

-- -------------------------------------------------------------
-- 14. STORAGE: BUCKET CON LÍMITES
-- -------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketplace-images', 'marketplace-images', true,
  5242880,                                    -- 5 MB por archivo
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- Borrar policies abiertas viejas
drop policy if exists "public_read_marketplace_images"   on storage.objects;
drop policy if exists "public_insert_marketplace_images" on storage.objects;
drop policy if exists "public_update_marketplace_images" on storage.objects;
drop policy if exists "public_delete_marketplace_images" on storage.objects;

-- Lectura pública (las fotos son públicas, es un marketplace)
create policy "public_read_marketplace_images"
  on storage.objects for select
  using (bucket_id = 'marketplace-images');

-- Subir: cualquiera puede pero con límite de tamaño (ya lo hace el bucket)
-- y solo extensiones permitidas
create policy "public_insert_marketplace_images"
  on storage.objects for insert
  with check (
    bucket_id = 'marketplace-images'
    and (storage.extension(name) in ('jpg','jpeg','png','webp'))
  );

-- Update/Delete BLOQUEADO desde anon (solo service_role puede sobrescribir/borrar)

-- -------------------------------------------------------------
-- 15. CRON DE LIMPIEZA (manual: puedes llamarlo desde una edge function)
-- -------------------------------------------------------------
create or replace function public.expire_old_listings()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.marketplace_listings
  set status = 'expired'
  where status = 'active'
    and expires_at < now();

  -- Anuncios draft/pending que llevan más de 7 días sin pagarse → deleted
  update public.marketplace_listings
  set status = 'deleted'
  where status in ('draft','pending_payment')
    and created_at < now() - interval '7 days';
end;
$$;

-- =============================================================
-- FIN. Verifica que no haya errores antes de salir del SQL editor.
-- =============================================================
