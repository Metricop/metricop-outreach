-- Faza 6: brojke za Pregled. Sve se računa iz tabele događaja (i statusa kontakata),
-- da bi se Pregled uvek slagao sa dnevnikom. Datumi po beogradskom vremenu.

create view outreach.stats_summary
with (security_invoker = true)
as
  with local_now as (select (now() at time zone 'Europe/Belgrade') as t)
  select
    (select count(*) from outreach.events e, local_now
      where e.type like 'sent\_step\_%' and (e.created_at at time zone 'Europe/Belgrade')::date = local_now.t::date)::int as sent_today,
    (select count(*) from outreach.events e, local_now
      where e.type like 'sent\_step\_%' and (e.created_at at time zone 'Europe/Belgrade') >= date_trunc('week', local_now.t))::int as sent_week,
    (select count(*) from outreach.contacts where status = 'replied')::int as new_replies,
    (select count(*) from outreach.contacts where status = 'interested')::int as interested,
    (select count(*) from outreach.contacts where status = 'bounced')::int as bounced,
    (select count(distinct contact_id) from outreach.events where type like 'sent\_step\_%')::int as contacted,
    (select count(distinct contact_id) from outreach.events where type = 'reply')::int as replied;

create view outreach.stats_groups
with (security_invoker = true)
as
  select
    g.id as group_id,
    g.code,
    g.name,
    g.active,
    (select count(*) from outreach.contacts c where c.group_id = g.id)::int as contacts,
    (select count(distinct e.contact_id) from outreach.events e join outreach.contacts c on c.id = e.contact_id
      where c.group_id = g.id and e.type like 'sent\_step\_%')::int as contacted,
    (select count(distinct e.contact_id) from outreach.events e join outreach.contacts c on c.id = e.contact_id
      where c.group_id = g.id and e.type = 'reply')::int as replied,
    (select count(*) from outreach.contacts c where c.group_id = g.id and c.status = 'interested')::int as interested
  from outreach.groups g;

create view outreach.stats_daily
with (security_invoker = true)
as
  with days as (
    select generate_series(
      (now() at time zone 'Europe/Belgrade')::date - 29,
      (now() at time zone 'Europe/Belgrade')::date,
      interval '1 day'
    )::date as day
  ),
  ev as (
    select (created_at at time zone 'Europe/Belgrade')::date as day, type
    from outreach.events
    where created_at >= now() - interval '31 days'
      and (type like 'sent\_step\_%' or type = 'reply')
  )
  select
    d.day,
    count(*) filter (where ev.type like 'sent\_step\_%')::int as sent,
    count(*) filter (where ev.type = 'reply')::int as replies
  from days d
  left join ev on ev.day = d.day
  group by d.day
  order by d.day;

grant select on outreach.stats_summary, outreach.stats_groups, outreach.stats_daily to authenticated;
