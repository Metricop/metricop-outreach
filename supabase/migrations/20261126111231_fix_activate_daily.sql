-- Popravka outreach.activate_daily (26.11.2026).
-- Od 09.11.2026 dnevni cron 'outreach-activate-daily' pada sa greškom
-- "invalid reference to FROM-clause entry for table c": migracija 'segments' (06.11.2026, primenjena
-- direktno u bazi, nije bila u repou) dodala je "left join companies co on co.id = c.company_id"
-- u UPDATE ... FROM, gde se ciljna tabela ne sme pominjati u JOIN ... ON. Pošto cela funkcija pada,
-- nijedan kontakt iz reda čekanja nije uključen, pa od 09.11. nema novih prvih mailova
-- (posle 19.11. su istekli i follow-upovi, pa slanje potpuno stoji).
-- Ispravka: provera segmenta ide kroz EXISTS. Ostala logika je ista kao u bazi.

create or replace function outreach.activate_daily(per_group integer default 10)
 returns table(group_code text, company text)
 language plpgsql
 security definer
 set search_path to 'outreach', 'public'
as $function$
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
    from groups g left join mailboxes m on m.id = g.mailbox_id
    where g.id = c.group_id and g.active and c.status = 'queued'
      and c.planned_start is not null
      and c.planned_start <= (now() at time zone coalesce(g.timezone, m.timezone, 'Europe/Belgrade'))::date
      and (g.segment is null or exists (
        select 1 from companies co where co.id = c.company_id and co.segment = g.segment))
    returning c.id, g.code, c.company),
  ev as (
    insert into events (contact_id, type, detail)
    select upd.id, 'activated', 'Uključeno iz reda čekanja ' || d || ' (stigao datum starta)' from upd)
  select upd.code, upd.company from upd;
end $function$;

-- SAD kontakti kojima je datum starta prošao dok funkcija nije radila (06.11–26.11) se ne puštaju
-- svi odjednom: raspoređuju se po ~6 dnevno na radne dane 30.11–11.12.2026 (27.11 je bez slanja,
-- 18.12 poslednji dan slanja; follow-up stiže 5 dana posle).
with overdue as (
  select c.id,
         (row_number() over (order by c.planned_start, c.queue_position nulls last, c.created_at) - 1) / 6 as day_idx
  from outreach.contacts c join outreach.groups g on g.id = c.group_id
  where g.code in ('US-LS','US-RC') and c.status = 'queued'
    and c.planned_start <= date '2026-11-27'
), days as (
  select row_number() over (order by d) - 1 as day_idx, d::date as d
  from generate_series(date '2026-11-30', date '2026-12-11', interval '1 day') d
  where extract(isodow from d) < 6
)
update outreach.contacts c
set planned_start = days.d,
    notes = coalesce(c.notes || E'\n', '') || 'Start pomeren na ' || to_char(days.d, 'DD.MM.YYYY') || ' (activate_daily nije radio 09.–26.11.2026)'
from overdue o join days on days.day_idx = least(o.day_idx, 9)
where c.id = o.id;
