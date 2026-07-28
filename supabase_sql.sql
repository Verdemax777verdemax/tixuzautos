-- Tixuz Autos Marketplace
-- Migración segura para que NO falle el flujo de publicación/pago
-- Ejecuta todo este script en Supabase SQL Editor

create extension if not exists pgcrypto;

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  make text default '',
  model text default '',
  year integer default 0,
  price numeric default 0,
  mileage integer default 0,
  transmission text default '',
  fuel_type text default '',
  color text default '',
  location text default '',
  description text default '',
  images text[] default '{}',
  seller_name text default '',
  seller_whatsapp text default '',
  seller_pin text default '',
  seller_type text default 'Particular',
  featured boolean default false,
  plan text default 'basic',
  status text default 'active',
  expires_at timestamptz null,
  stripe_ref text,
  stripe_session text
);

alter table public.marketplace_listings add column if not exists created_at timestamptz not null default now();
alter table public.marketplace_listings add column if not exists make text default '';
alter table public.marketplace_listings add column if not exists model text default '';
alter table public.marketplace_listings add column if not exists year integer default 0;
alter table public.marketplace_listings add column if not exists price numeric default 0;
alter table public.marketplace_listings add column if not exists mileage integer default 0;
alter table public.marketplace_listings add column if not exists transmission text default '';
alter table public.marketplace_listings add column if not exists fuel_type text default '';
alter table public.marketplace_listings add column if not exists color text default '';
alter table public.marketplace_listings add column if not exists location text default '';
alter table public.marketplace_listings add column if not exists description text default '';
alter table public.marketplace_listings add column if not exists images text[] default '{}';
alter table public.marketplace_listings add column if not exists seller_name text default '';
alter table public.marketplace_listings add column if not exists seller_whatsapp text default '';
alter table public.marketplace_listings add column if not exists seller_pin text default '';
alter table public.marketplace_listings add column if not exists seller_type text default 'Particular';
alter table public.marketplace_listings add column if not exists featured boolean default false;
alter table public.marketplace_listings add column if not exists plan text default 'basic';
alter table public.marketplace_listings add column if not exists status text default 'active';
alter table public.marketplace_listings add column if not exists expires_at timestamptz null;
alter table public.marketplace_listings add column if not exists stripe_ref text;
alter table public.marketplace_listings add column if not exists stripe_session text;

create index if not exists idx_marketplace_listings_created_at on public.marketplace_listings(created_at desc);
create index if not exists idx_marketplace_listings_status on public.marketplace_listings(status);
create index if not exists idx_marketplace_listings_stripe_ref on public.marketplace_listings(stripe_ref);
create index if not exists idx_marketplace_listings_seller_wa on public.marketplace_listings(seller_whatsapp);
create index if not exists idx_marketplace_listings_seller_pin on public.marketplace_listings(seller_whatsapp, seller_pin);

-- Si usas RLS, deja lectura pública para anuncios activos.
-- OBSOLETO: usa sql/schema-v2.sql.
-- No crees politicas de lectura directa sobre marketplace_listings:
-- expone seller_whatsapp/PIN/datos internos. El publico debe leer public.public_listings.
alter table public.marketplace_listings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'marketplace_listings'
      and policyname = 'Public can read listings'
  ) then
    raise notice 'No se crea "Public can read listings"; usa public.public_listings.';
  end if;
end $$;
