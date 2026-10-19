-- Svakog radnog dana u 05:00 UTC (pre jutarnjeg prozora 8–11) uključuje nove kontakte:
-- Srbija i Švedska dopunjuju se do 10 „new“ iz reda „ČEKA RED“,
-- SAD po datumu „start DD.MM.YYYY“ u napomeni. IZBAČENO i PROVERITI se nikad ne uključuju.

create or replace function outreach.activate_daily(per_group int default 10)
returns table(group_code text, company text)
language plpgsql security definer set search_path = outreach, public as $$
declare d text := to_char(now() at time zone 'Europe/Belgrade', 'DD.MM.YYYY');
begin
  -- Srbija i Švedska: dopuni do N kontakata „new“ iz reda „ČEKA RED“
  -- (ako juče nisu svi poslati, ne gomila se više od N dnevno).
  return query
  with waiting as (
    select c.group_id, count(*) filter (where c.status = 'new') as n_new
    from contacts c group by c.group_id),
  pick as (
    select c.id, c.group_id, row_number() over (partition by c.group_id order by c.notes, c.created_at) rn
    from contacts c join groups g on g.id = c.group_id
    where g.active and g.code in ('GEO-SRB','SE-INTRO') and c.status = 'paused'
      and c.notes like '%ČEKA RED%' and c.notes not like '%IZBAČENO%' and c.notes not like '%PROVERITI%')
  update contacts c set status = 'new',
    notes = regexp_replace(c.notes, 'ČEKA RED: [^\n]*', 'uključeno ' || d || ' (10 dnevno, automatski)')
  from pick p join groups g on g.id = p.group_id left join waiting w on w.group_id = p.group_id
  where p.id = c.id and p.rn <= per_group - coalesce(w.n_new, 0)
  returning g.code, c.company;

  -- SAD: kontakti čiji je datum starta („start DD.MM.YYYY“) stigao.
  return query
  update contacts c set status = 'new', notes = c.notes || ' | uključeno ' || d || ' (automatski)'
  from groups g
  where g.id = c.group_id and g.active and g.code like 'US-%' and c.status = 'paused'
    and c.notes ~ 'start \d{2}\.\d{2}\.\d{4}'
    and c.notes not like '%IZBAČENO%' and c.notes not like '%PROVERITI%'
    and to_date(substring(c.notes from 'start (\d{2}\.\d{2}\.\d{4})'), 'DD.MM.YYYY') <= (now() at time zone 'America/Chicago')::date
  returning g.code, c.company;
end $$;

revoke all on function outreach.activate_daily(int) from public, anon, authenticated;

select cron.schedule('outreach-activate-daily', '0 5 * * 1-5', $$select outreach.activate_daily(10)$$);
