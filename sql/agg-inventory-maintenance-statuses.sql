begin;

alter table public.agg_autos_inventory
  drop constraint if exists agg_autos_inventory_status_check;

alter table public.agg_autos_inventory
  add constraint agg_autos_inventory_status_check
  check (status in ('active', 'sold', 'expired', 'duplicate'));

commit;
