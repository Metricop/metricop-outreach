-- Pomoćni pogledi za ekrane (oznake, red čekanja) i bezbednosne ispravke iz Supabase saveta:
-- pogledi team_members i mailbox_connections više nisu SECURITY DEFINER i ne čitaju auth.users direktno.

-- Spisak oznaka za filter na ekranu Kontakti.
create view outreach.contact_tags
with (security_invoker = true)
as
  select distinct unnest(tags) as tag
  from outreach.contacts
  order by 1;

grant select on outreach.contact_tags to authenticated;

-- Red čekanja po grupi: koliko čeka, dnevna kvota i raspon datuma starta.
create view outreach.queue_overview
with (security_invoker = true)
as
  select
    g.id as group_id,
    g.code,
    g.active,
    g.daily_new_quota,
    (count(c.id) filter (where c.status = 'queued'))::int as queued,
    (count(c.id) filter (where c.status = 'queued' and c.planned_start is null))::int as queued_by_quota,
    (count(c.id) filter (where c.status = 'queued' and c.planned_start is not null))::int as queued_dated,
    min(c.planned_start) filter (where c.status = 'queued') as next_start,
    max(c.planned_start) filter (where c.status = 'queued') as last_start,
    (count(c.id) filter (where c.status = 'new'))::int as waiting_new
  from outreach.groups g
  left join outreach.contacts c on c.group_id = g.id
  group by g.id;

grant select on outreach.queue_overview to authenticated;

-- Članovi tima: funkcija sa proverom, pogled nad njom radi sa pravima korisnika.
create or replace function outreach.team_member_list()
returns table (email text, created_at timestamptz, last_sign_in_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email)::text, u.created_at, u.last_sign_in_at
  from auth.users u
  where lower(u.email) like '%@metricop.com' and outreach.is_team_member();
$$;

revoke all on function outreach.team_member_list() from public, anon;
grant execute on function outreach.team_member_list() to authenticated;

-- Iste kolone i tipovi kao do sada, pa se pogled samo zamenjuje (bez brisanja).
create or replace view outreach.team_members
with (security_invoker = true)
as
  select f.email::varchar(255) as email, f.created_at, f.last_sign_in_at
  from outreach.team_member_list() f;

grant select on outreach.team_members to authenticated;

-- Povezani Gmail nalozi (bez tokena): isto rešenje.
create or replace function outreach.mailbox_connection_list()
returns table (mailbox_id uuid, scopes text[], updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select t.mailbox_id, t.scopes, t.updated_at
  from outreach.mailbox_tokens t
  where outreach.is_team_member();
$$;

revoke all on function outreach.mailbox_connection_list() from public, anon;
grant execute on function outreach.mailbox_connection_list() to authenticated;

create or replace view outreach.mailbox_connections
with (security_invoker = true)
as
  select f.mailbox_id, f.scopes, f.updated_at
  from outreach.mailbox_connection_list() f;

grant select on outreach.mailbox_connections to authenticated;
