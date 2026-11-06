-- Delatnost firme (segment) i pravilo: bez poznate delatnosti nema prvog mejla.
-- Segment opisuje čime se firma bavi u okviru geodezije i merenja; sekvenca grupe se piše za tu delatnost.

alter table outreach.companies
  add constraint companies_segment_check
  check (segment is null or segment in ('survey', 'contractor', 'municipality', 'monitoring', 'scanning'));

comment on column outreach.companies.segment is
  'Delatnost: survey (mätkonsult/geodetski biro), contractor (izvođač sa sopstvenim merenjem), municipality (opština/grad), monitoring (monitoring, sleganje, vibracije), scanning (skeniranje, dronovi, 3D).';

alter table outreach.groups
  add column segment text
  check (segment is null or segment in ('survey', 'contractor', 'municipality', 'monitoring', 'scanning'));

comment on column outreach.groups.segment is
  'Delatnost za koju je pisana sekvenca grupe. Ako je zadata, prvi mejl dobija samo kontakt čija firma ima istu delatnost.';

-- Pravilo na nivou baze: kontakt ne može da postane „Novo“ (spreman za prvi mejl) u grupi sa delatnošću
-- ako njegova firma nema tu istu delatnost. Važi za uvoz, ručnu promenu i jutarnje uključivanje.
create or replace function outreach.check_contact_segment()
returns trigger language plpgsql set search_path = outreach, public as $$
declare
  group_segment text;
  company_segment text;
begin
  if new.status <> 'new' then return new; end if;
  select segment into group_segment from groups where id = new.group_id;
  if group_segment is null then return new; end if;
  select segment into company_segment from companies where id = new.company_id;
  if company_segment is distinct from group_segment then
    raise exception 'Kontakt % ne može da dobije prvi mejl: delatnost firme (%) ne odgovara grupi (%). Prvo proverite čime se firma bavi.',
      new.email, coalesce(company_segment, 'nije upisana'), group_segment
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger contacts_segment_guard
  before insert or update of status, group_id, company_id on outreach.contacts
  for each row execute function outreach.check_contact_segment();

-- Jutarnje uključivanje iz reda čekanja preskače kontakte čija delatnost ne odgovara grupi.
create or replace function outreach.activate_daily(per_group int default 10)
returns table(group_code text, company text)
language plpgsql security definer set search_path = outreach, public as $$
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
    left join companies co on co.id = c.company_id
    where g.active and g.daily_new_quota is not null and c.status = 'queued' and c.planned_start is null
      and (g.segment is null or co.segment = g.segment)),
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
    from groups g left join mailboxes m on m.id = g.mailbox_id left join companies co on co.id = c.company_id
    where g.id = c.group_id and g.active and c.status = 'queued'
      and c.planned_start is not null
      and c.planned_start <= (now() at time zone coalesce(g.timezone, m.timezone, 'Europe/Belgrade'))::date
      and (g.segment is null or co.segment = g.segment)
    returning c.id, g.code, c.company),
  ev as (
    insert into events (contact_id, type, detail)
    select upd.id, 'activated', 'Uključeno iz reda čekanja ' || d || ' (stigao datum starta)' from upd)
  select upd.code, upd.company from upd;
end $$;
