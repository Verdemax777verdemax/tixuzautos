alter table public.aggregated_listings
  add column if not exists vehicle_year int,
  add column if not exists vehicle_km int,
  add column if not exists vehicle_brand text,
  add column if not exists vehicle_model text,
  add column if not exists vehicle_transmission text;

with parsed as (
  select
    id,
    nullif(substring(title from '(?:19|20)[0-9]{2}'), '')::int as parsed_year,
    nullif(
      trim(split_part(regexp_replace(title, '\m(19|20)[0-9]{2}\M', '', 'g'), ' ', 1)),
      ''
    ) as parsed_brand,
    nullif(
      trim(regexp_replace(regexp_replace(title, '\m(19|20)[0-9]{2}\M', '', 'g'), '^[^ ]+\s*', '')),
      ''
    ) as parsed_model,
    nullif(
      regexp_replace(substring(coalesce(description, '') from 'Kilometraje:\s*([0-9,]+)\s*km'), '[^0-9]', '', 'g'),
      ''
    )::int as parsed_km,
    nullif(
      (regexp_match(coalesce(description, ''), 'Transmisi[oó]n:\s*([^\n\r]+)'))[1],
      ''
    ) as parsed_transmission
  from public.aggregated_listings
  where property_type = 'auto'
)
update public.aggregated_listings a
set
  vehicle_year = coalesce(a.vehicle_year, parsed.parsed_year),
  vehicle_brand = coalesce(a.vehicle_brand, parsed.parsed_brand),
  vehicle_model = coalesce(a.vehicle_model, parsed.parsed_model),
  vehicle_km = coalesce(a.vehicle_km, parsed.parsed_km),
  vehicle_transmission = coalesce(a.vehicle_transmission, parsed.parsed_transmission)
from parsed
where a.id = parsed.id;
