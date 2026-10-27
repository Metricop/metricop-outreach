-- Faza 2: pomoćni objekti za ekran Kontakti.

-- Odjava i bounce automatski dodaju adresu na listu za izuzimanje,
-- bez obzira odakle je status promenjen (ekran, masovna akcija, run-cycle).
create or replace function outreach.suppress_on_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('unsubscribed', 'bounced')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    insert into outreach.suppression (email, reason)
    values (new.email, case new.status when 'bounced' then 'bounce' else 'unsubscribed' end)
    on conflict (email) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function outreach.suppress_on_status() from public, anon, authenticated;

create trigger contacts_suppress_on_status
  after insert or update of status on outreach.contacts
  for each row execute function outreach.suppress_on_status();

-- Spisak gradova za filter na ekranu Kontakti.
create view outreach.contact_cities
with (security_invoker = true)
as
  select distinct city
  from outreach.contacts
  where city is not null and city <> ''
  order by city;

grant select on outreach.contact_cities to authenticated;
