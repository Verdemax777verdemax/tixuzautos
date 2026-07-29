-- Applied to production as Supabase migration: tixuz_track_whatsapp_attribution
-- Keep this source copy with the frontend so the attribution contract is auditable.
alter table public.whatsapp_reveals add column if not exists device text;

create or replace function public.tixuz_track(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  ev text := lower(coalesce(p->>'event',''));
  lid uuid;
  reveal_id bigint;
begin
  begin
    lid := nullif(p->>'listing_id','')::uuid;
  exception when others then
    lid := null;
  end;

  if ev = 'view' then
    insert into listing_views (
      listing_id, visitor_hash, viewed_at, utm_source, utm_medium,
      utm_campaign, referrer, session_id, source, device
    ) values (
      lid, p->>'visitor_hash', now(), p->>'utm_source', p->>'utm_medium',
      p->>'utm_campaign', p->>'referrer', p->>'session_id', p->>'source', p->>'device'
    );

  elsif ev = 'whatsapp' then
    -- reveal_whatsapp creates the rate-limited lead first. Enrich that row so
    -- a single user action remains a single reveal.
    select id into reveal_id
      from whatsapp_reveals
     where listing_id = lid
       and ip_hash = p->>'visitor_hash'
       and revealed_at > now() - interval '10 minutes'
     order by revealed_at desc
     limit 1;

    if reveal_id is null then
      insert into whatsapp_reveals (
        listing_id, ip_hash, revealed_at, utm_source, utm_medium,
        utm_campaign, referrer, session_id, origen, device
      ) values (
        lid, p->>'visitor_hash', now(), p->>'utm_source', p->>'utm_medium',
        p->>'utm_campaign', p->>'referrer', p->>'session_id',
        coalesce(p->>'origen','sitio'), p->>'device'
      );
    else
      update whatsapp_reveals
         set utm_source = p->>'utm_source',
             utm_medium = p->>'utm_medium',
             utm_campaign = p->>'utm_campaign',
             referrer = p->>'referrer',
             session_id = p->>'session_id',
             origen = coalesce(p->>'origen', origen, 'sitio'),
             device = p->>'device'
       where id = reveal_id;
    end if;

  else
    insert into agg_autos_clicks (
      event_type, fuente_portal, destino_url, query_text, src_tag, user_agent,
      created_at, utm_source, utm_medium, utm_campaign, utm_content, referrer,
      session_id, device, listing_id
    ) values (
      coalesce(nullif(ev,''),'clickout'), p->>'fuente_portal', p->>'destino_url',
      p->>'query_text', coalesce(p->>'src_tag','sitio'),
      left(coalesce(p->>'user_agent',''),400), now(), p->>'utm_source',
      p->>'utm_medium', p->>'utm_campaign', p->>'utm_content', p->>'referrer',
      p->>'session_id', p->>'device', p->>'listing_id'
    );
  end if;

  return jsonb_build_object('ok', true);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$function$;
