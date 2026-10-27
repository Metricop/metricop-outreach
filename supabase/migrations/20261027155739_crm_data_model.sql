-- Podaci spremni za CRM: firme odvojene od kontakata, prava polja umesto beleški,
-- status "U redu čekanja" i stabilni pogledi (crm_*_v1) koje centralni sistem čita.
--
-- Slanje se ne menja: run-cycle i dalje šalje samo kontaktima "new" i "in_sequence".
-- Kontakti koji su čekali red ("ČEKA RED" u belešci, ili američki sa datumom starta)
-- prelaze iz "paused" u "queued", a jutarnje uključivanje radi isto kao do sada.

-- 1. Firme ------------------------------------------------------------------------------
create table outreach.companies (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  legal_form     text,
  reg_no         text,          -- matični broj / organisationsnummer / EIN
  vat_id         text,          -- PIB / VAT
  website        text,
  domain         text check (domain = lower(domain)),
  phone          text,
  email          text,          -- opšti mejl firme
  address        text,
  city           text,
  zip            text,
  country_code   text check (country_code ~ '^[A-Z]{2}$'),
  description    text,
  licenses       text,          -- npr. licence RGZ (1,3,4,5,6)
  segment        text,
  source         text,
  tags           text[] not null default '{}',
  owner_email    text,
  crm_company_id uuid,          -- id firme u centralnom CRM-u (popunjava CRM)
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table outreach.companies is 'Firme iz outreach-a. Jedna firma ima više kontakata. Centralni CRM ih čita preko outreach.crm_companies_v1.';
create index companies_domain_idx on outreach.companies (domain) where domain is not null;
create index companies_name_idx on outreach.companies (lower(name), country_code);

-- 2. Nova polja ---------------------------------------------------------------------------
alter table outreach.groups
  add column country_code text check (country_code ~ '^[A-Z]{2}$'),
  add column daily_new_quota integer check (daily_new_quota between 0 and 50);

comment on column outreach.groups.country_code is 'Država kontakata u grupi (RS, SE, US). Prazno = tržište mailboxa.';
comment on column outreach.groups.daily_new_quota is 'Jutarnje uključivanje: koliko kontakata iz reda čekanja dnevno postaje "Novo". Prazno = bez reda.';

alter table outreach.contacts
  add column company_id      uuid references outreach.companies (id) on delete set null,
  add column last_name       text,
  add column title           text,
  add column phone           text,
  add column country_code    text check (country_code ~ '^[A-Z]{2}$'),
  add column linkedin_url    text,
  add column external_ref    text,
  add column tier            text,
  add column contact_role    text check (contact_role in ('primary', 'secondary')),
  add column planned_start   date,
  add column queue_position  integer,
  add column interest_level  text check (interest_level in ('high', 'medium', 'low')),
  add column next_step       text,
  add column next_contact_at date,
  add column lost_reason     text,
  add column owner_email     text,
  add column tags            text[] not null default '{}',
  add column crm_contact_id  uuid,
  add column updated_at      timestamptz not null default now();

comment on column outreach.contacts.external_ref is 'Šifra iz izvora (npr. US-0081, SE-0052).';
comment on column outreach.contacts.tier is 'Nivo prioriteta iz izvora (K1–K4).';
comment on column outreach.contacts.planned_start is 'Datum od kog kontakt iz reda čekanja sme da počne sekvencu.';
comment on column outreach.contacts.next_contact_at is 'Javi se ponovo (podsetnik).';
comment on column outreach.contacts.crm_contact_id is 'Id kontakta u centralnom CRM-u (popunjava CRM).';

create index contacts_company_idx on outreach.contacts (company_id);
create index contacts_next_contact_idx on outreach.contacts (next_contact_at) where next_contact_at is not null;
create index contacts_tags_idx on outreach.contacts using gin (tags);

alter table outreach.events add column created_by text;
comment on column outreach.events.created_by is 'Ko je upisao ručnu aktivnost (beleška, poziv, sastanak); prazno = sistem.';

-- 3. Status "U redu čekanja" ------------------------------------------------------------
alter table outreach.contacts drop constraint contacts_status_check;
alter table outreach.contacts add constraint contacts_status_check check (status in (
  'queued', 'new', 'in_sequence', 'replied', 'interested', 'not_interested',
  'unsubscribed', 'bounced', 'finished_no_reply', 'paused'));

-- 4. updated_at -------------------------------------------------------------------------
create or replace function outreach.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger companies_touch before update on outreach.companies
  for each row execute function outreach.touch_updated_at();
create trigger contacts_touch before update on outreach.contacts
  for each row execute function outreach.touch_updated_at();

-- 5. Povezivanje kontakta sa firmom ---------------------------------------------------------
-- Ista firma: isti domen mejla (osim besplatnih servisa), inače isti naziv u istoj državi.
create or replace function outreach.find_or_create_company(
  p_name text, p_email text, p_country text, p_city text, p_source text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text := nullif(split_part(lower(trim(coalesce(p_email, ''))), '@', 2), '');
  v_name text := nullif(trim(p_name), '');
  v_id uuid;
begin
  if v_name is null then
    return null;
  end if;
  if v_domain is not null and exists (select 1 from outreach.free_mail_domains f where f.domain = v_domain) then
    v_domain := null;
  end if;

  if v_domain is not null then
    select c.id into v_id from outreach.companies c where c.domain = v_domain order by c.created_at limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  select c.id into v_id from outreach.companies c
  where lower(c.name) = lower(v_name) and c.country_code is not distinct from p_country
  order by c.created_at limit 1;
  if v_id is not null then return v_id; end if;

  insert into outreach.companies (name, domain, website, country_code, city, source)
  values (v_name, v_domain, case when v_domain is not null then 'https://' || v_domain end, p_country, nullif(trim(p_city), ''), p_source)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function outreach.find_or_create_company(text, text, text, text, text) from public, anon, authenticated;

-- Svaki novi kontakt (import, ručno, SQL) dobija državu i firmu.
create or replace function outreach.contacts_link_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.country_code is null and new.group_id is not null then
    select coalesce(g.country_code, m.market) into new.country_code
    from outreach.groups g left join outreach.mailboxes m on m.id = g.mailbox_id
    where g.id = new.group_id;
  end if;
  if new.company_id is null and nullif(trim(new.company), '') is not null then
    new.company_id := outreach.find_or_create_company(new.company, new.email, new.country_code, new.city, new.source);
  end if;
  return new;
end;
$$;

revoke all on function outreach.contacts_link_company() from public, anon, authenticated;

create trigger contacts_link_company before insert or update of company, group_id on outreach.contacts
  for each row execute function outreach.contacts_link_company();

-- 6. Postojeći podaci ---------------------------------------------------------------------
update outreach.groups set country_code = case
  when code like 'US-%' then 'US'
  when code like 'SE-%' then 'SE'
  else 'RS' end;
update outreach.groups set daily_new_quota = 10 where code in ('GEO-SRB', 'SE-INTRO');

-- Država i firma za sve postojeće kontakte (okidač radi na update group_id).
update outreach.contacts c set group_id = c.group_id where c.group_id is not null;

-- Polja iz beleški (beleške ostaju kakve jesu).
-- SAD: "US-0081 | K4 | Primarni | start 10.11.2026 | Founder | ..."
update outreach.contacts c set
  external_ref  = m[1],
  tier          = m[2],
  contact_role  = case m[3] when 'Primarni' then 'primary' else 'secondary' end,
  planned_start = to_date(m[4], 'DD.MM.YYYY'),
  title         = nullif(trim(m[5]), '')
from (
  select id, regexp_match(notes, '^(US-\d+) \| (K\d) \| (Primarni|Drugi) \| start (\d{2}\.\d{2}\.\d{4}) \| ([^|\n]+)') m
  from outreach.contacts
) x
where x.id = c.id and x.m is not null;

-- Švedska: "SE-0052 | ..."
update outreach.contacts c set external_ref = substring(c.notes from '^(SE-\d+) \|')
where c.notes ~ '^SE-\d+ \|';

-- Apollo: kontakti koji su još u Apollo sekvenci dobijaju oznaku.
update outreach.contacts set tags = array['apollo']
where source like 'apollo-se-sequence%' or notes like '%Apollo SWEDEN sekvenci%';

-- Srbija: licence RGZ i pravna forma idu na firmu.
update outreach.companies co set
  licenses   = substring(x.notes from '^Licence za rad RGZ \(([\d,]+)\)'),
  description = split_part(x.notes, E'\n', 1),
  legal_form = case
    when x.notes like '%Privredno društvo (DOO)%' then 'DOO'
    when x.notes like '%Preduzetnik (radnja)%' then 'Preduzetnik'
  end
from (
  select distinct on (c.company_id) c.company_id, c.notes
  from outreach.contacts c
  where c.company_id is not null and c.notes like 'Licence za rad RGZ%'
  order by c.company_id, c.created_at
) x
where x.company_id = co.id;

-- Red čekanja: isti kontakti i isti redosled kao u dosadašnjem jutarnjem uključivanju.
with q as (
  select c.id,
         row_number() over (partition by c.group_id order by c.notes, c.created_at) as pos
  from outreach.contacts c
  join outreach.groups g on g.id = c.group_id
  where c.status = 'paused'
    and c.notes not like '%IZBAČENO%' and c.notes not like '%PROVERITI%'
    and (
      (g.code in ('GEO-SRB', 'SE-INTRO') and c.notes like '%ČEKA RED%')
      or (g.code like 'US-%' and c.planned_start is not null)
    )
)
update outreach.contacts c set
  status = 'queued',
  queue_position = q.pos,
  notes = nullif(trim(both E'\n' from regexp_replace(c.notes, E'\n?ČEKA RED: [^\n]*', '')), '')
from q
where q.id = c.id;

-- 7. Jutarnje uključivanje iz reda čekanja -----------------------------------------------
-- Grupe sa dnevnom kvotom: dopuna do N kontakata "Novo" (ne gomila se ako juče nisu svi poslati).
-- Kontakti sa datumom starta: uključuju se kad datum stigne, u vremenskoj zoni grupe.
create or replace function outreach.activate_daily(per_group integer default 10)
returns table (group_code text, company text)
language plpgsql
security definer
set search_path = 'outreach', 'public'
as $$
declare d text := to_char(now() at time zone 'Europe/Belgrade', 'DD.MM.YYYY');
begin
  return query
  with waiting as (
    select c.group_id, count(*) filter (where c.status = 'new') as n_new
    from contacts c group by c.group_id),
  pick as (
    select c.id, c.group_id,
           row_number() over (partition by c.group_id order by c.queue_position nulls last, c.created_at) rn
    from contacts c join groups g on g.id = c.group_id
    where g.active and g.daily_new_quota is not null and c.status = 'queued' and c.planned_start is null),
  upd as (
    update contacts c set status = 'new'
    from pick p join groups g on g.id = p.group_id left join waiting w on w.group_id = p.group_id
    where p.id = c.id and p.rn <= coalesce(g.daily_new_quota, per_group) - coalesce(w.n_new, 0)
    returning c.id, g.code, c.company),
  ev as (
    insert into events (contact_id, type, detail)
    select upd.id, 'activated', 'Uključeno iz reda čekanja ' || d || ' (dnevna kvota grupe)' from upd)
  select upd.code, upd.company from upd;

  return query
  with upd as (
    update contacts c set status = 'new'
    from groups g left join mailboxes m on m.id = g.mailbox_id
    where g.id = c.group_id and g.active and c.status = 'queued'
      and c.planned_start is not null
      and c.planned_start <= (now() at time zone coalesce(g.timezone, m.timezone, 'Europe/Belgrade'))::date
    returning c.id, g.code, c.company),
  ev as (
    insert into events (contact_id, type, detail)
    select upd.id, 'activated', 'Uključeno iz reda čekanja ' || d || ' (stigao datum starta)' from upd)
  select upd.code, upd.company from upd;
end $$;

-- Promena statusa iz aplikacije (ručno ili masovno) ostaje u istoriji kontakta.
-- Automatsko slanje (servisni ključ) svoje događaje upisuje samo.
create or replace function outreach.log_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status and auth.uid() is not null then
    insert into outreach.events (contact_id, type, detail, created_by)
    values (new.id, 'status_change', old.status || ' → ' || new.status, lower(auth.jwt() ->> 'email'));
  end if;
  return new;
end;
$$;

revoke all on function outreach.log_status_change() from public, anon, authenticated;

create trigger contacts_log_status after update of status on outreach.contacts
  for each row execute function outreach.log_status_change();

-- 8. Prava i RLS ------------------------------------------------------------------------
alter table outreach.companies enable row level security;
grant select, insert, update, delete on outreach.companies to authenticated;
grant all on outreach.companies to service_role;
create policy team_all on outreach.companies
  for all to authenticated using (outreach.is_team_member()) with check (outreach.is_team_member());

-- 9. Pogledi za centralni CRM (ugovor v1: kolone se ne brišu i ne menjaju značenje) -------
create view outreach.crm_companies_v1
with (security_invoker = true)
as
select
  co.id, co.name, co.legal_form, co.reg_no, co.vat_id, co.website, co.domain, co.phone, co.email,
  co.address, co.city, co.zip, co.country_code, co.description, co.licenses, co.segment, co.source,
  co.tags, co.owner_email, co.crm_company_id,
  agg.contacts_count,
  agg.first_contacted_at,
  agg.last_activity_at,
  agg.best_status,
  agg.do_not_contact,
  co.created_at, co.updated_at
from outreach.companies co
left join lateral (
  select
    count(*)::int as contacts_count,
    min(e.first_sent) as first_contacted_at,
    greatest(max(c.last_sent_at), max(e.last_event)) as last_activity_at,
    (array_agg(c.status order by case c.status
      when 'interested' then 1 when 'replied' then 2 when 'not_interested' then 3 when 'in_sequence' then 4
      when 'finished_no_reply' then 5 when 'new' then 6 when 'queued' then 7 when 'paused' then 8
      when 'unsubscribed' then 9 when 'bounced' then 10 else 11 end))[1] as best_status,
    bool_and(c.status in ('unsubscribed', 'bounced')) as do_not_contact
  from outreach.contacts c
  left join lateral (
    select min(ev.created_at) filter (where ev.type like 'sent\_step\_%') as first_sent, max(ev.created_at) as last_event
    from outreach.events ev where ev.contact_id = c.id
  ) e on true
  where c.company_id = co.id
) agg on true;

create view outreach.crm_contacts_v1
with (security_invoker = true)
as
select
  c.id, c.company_id, c.company as company_name, c.first_name, c.last_name, c.title, c.email, c.phone,
  c.country_code, c.city, c.linkedin_url, c.external_ref, c.tier, c.contact_role,
  c.status,
  case c.status
    when 'queued' then 'not_contacted' when 'new' then 'not_contacted' when 'in_sequence' then 'contacted'
    when 'replied' then 'replied' when 'interested' then 'interested' when 'not_interested' then 'not_interested'
    when 'unsubscribed' then 'unsubscribed' when 'bounced' then 'invalid_email'
    when 'finished_no_reply' then 'no_response' when 'paused' then 'on_hold'
  end as stage,
  c.status in ('unsubscribed', 'bounced') as do_not_contact,
  c.interest_level, c.next_step, c.next_contact_at, c.lost_reason, c.owner_email, c.tags,
  g.code as group_code, g.name as group_name, m.email as mailbox_email, s.name as sequence_name,
  c.step as last_step, c.source, c.notes,
  ev.first_sent_at, c.last_sent_at, ev.replied_at, ev.unsubscribed_at,
  c.gmail_thread_id, c.crm_contact_id,
  c.created_at, c.updated_at
from outreach.contacts c
left join outreach.groups g on g.id = c.group_id
left join outreach.mailboxes m on m.id = g.mailbox_id
left join outreach.sequences s on s.id = g.sequence_id
left join lateral (
  select
    min(e.created_at) filter (where e.type like 'sent\_step\_%') as first_sent_at,
    max(e.created_at) filter (where e.type = 'reply') as replied_at,
    max(e.created_at) filter (where e.type = 'status_change' and e.detail like '%→ unsubscribed') as unsubscribed_at
  from outreach.events e where e.contact_id = c.id
) ev on true;

create view outreach.crm_activities_v1
with (security_invoker = true)
as
select
  e.id, e.contact_id, c.company_id,
  case
    when e.type like 'sent\_step\_%' then 'email_out'
    when e.type = 'reply' then 'email_in'
    when e.type = 'auto_reply' then 'email_in_auto'
    when e.type in ('bounce', 'blocked') then 'bounce'
    when e.type in ('note', 'call', 'meeting') then e.type
    else 'system'
  end as activity_type,
  e.type as raw_type,
  case when e.type like 'sent\_step\_%' then substring(e.type from '\d+$')::int end as step_no,
  e.detail as summary,
  m.email as mailbox_email,
  c.gmail_thread_id,
  e.created_by,
  e.created_at as occurred_at
from outreach.events e
left join outreach.contacts c on c.id = e.contact_id
left join outreach.mailboxes m on m.id = e.mailbox_id;

grant select on outreach.crm_companies_v1, outreach.crm_contacts_v1, outreach.crm_activities_v1 to authenticated, service_role;

comment on view outreach.crm_companies_v1 is 'Ugovor za centralni CRM (v1): firme iz outreach-a. Stabilan id; nove kolone se samo dodaju.';
comment on view outreach.crm_contacts_v1 is 'Ugovor za centralni CRM (v1): kontakti, faza (stage), zainteresovanost i istorija slanja.';
comment on view outreach.crm_activities_v1 is 'Ugovor za centralni CRM (v1): svi događaji (mejlovi, odgovori, beleške, pozivi) po kontaktu i firmi.';
