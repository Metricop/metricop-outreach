create or replace function outreach.activate_daily(per_group int default 10)
returns table(group_code text, company text)
language plpgsql security definer set search_path = outreach, public as $$
declare d text := to_char(now() at time zone 'Europe/Belgrade', 'DD.MM.YYYY');
begin
  -- Srbija i Švedska: sledećih N iz reda „ČEKA RED“.
  return query
  with pick as (
    select c.id, row_number() over (partition by c.group_id order by c.notes, c.created_at) rn
    from contacts c join groups g on g.id = c.group_id
    where g.active and g.code in ('GEO-SRB','SE-INTRO') and c.status = 'paused'
      and c.notes like '%ČEKA RED%' and c.notes not like '%IZBAČENO%' and c.notes not like '%PROVERITI%')
  update contacts c set status = 'new',
    notes = regexp_replace(c.notes, 'ČEKA RED: [^\n]*', 'uključeno ' || d || ' (10 dnevno, automatski)')
  from pick p, groups g
  where p.id = c.id and p.rn <= per_group and g.id = c.group_id
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
