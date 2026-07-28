create table if not exists public.agg_busquedas_sin_resultado (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  created_at timestamptz not null default now()
);

alter table public.agg_busquedas_sin_resultado enable row level security;

drop policy if exists "allow anonymous no-result inserts" on public.agg_busquedas_sin_resultado;
create policy "allow anonymous no-result inserts"
on public.agg_busquedas_sin_resultado
for insert
to anon
with check (true);
