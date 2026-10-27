-- Zaštita kupaca čita i novu CRM evidenciju (public.companies sa ulogom customer,
-- public.contacts sa odjavom). Svaki izvor se čita u svom bloku: ako se tabela
-- u glavnoj aplikaciji preimenuje ili ukloni, taj izvor se preskače, a slanje radi dalje.

create or replace function outreach.crm_input(p_emails text[])
returns table (email text, domain text, free boolean)
language sql
stable
set search_path = ''
as $$
  select distinct lower(trim(x)), split_part(lower(trim(x)), '@', 2),
         exists (select 1 from outreach.free_mail_domains f where f.domain = split_part(lower(trim(x)), '@', 2))
  from unnest(p_emails) as x
  where x like '%@%';
$$;

revoke all on function outreach.crm_input(text[]) from public, anon;
grant execute on function outreach.crm_input(text[]) to authenticated, service_role;

create or replace function outreach.crm_blocked(p_emails text[])
returns table (email text, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not (coalesce(auth.jwt() ->> 'role', '') = 'service_role' or outreach.is_team_member()) then
    return;
  end if;

  -- Kupci iz stare tabele kupaca (dok glavna aplikacija ne pređe na firme).
  begin
    return query
    select distinct on (i.email) i.email, 'Postojeći kupac' || coalesce(' (' || k.company || ')', '')
    from outreach.crm_input(p_emails) i
    join public.customers k
      on lower(trim(k.email)) = i.email
      or (not i.free and split_part(lower(trim(k.email)), '@', 2) = i.domain);
  exception when others then
    raise warning 'crm_blocked: public.customers preskočen (%)', sqlerrm;
  end;

  -- Firme sa ulogom kupac u CRM-u (po mejlu, domenu ili sajtu firme) i njihovi kontakti.
  begin
    return query
    select distinct on (i.email) i.email, 'Kupac u CRM-u (' || c.name || ')'
    from outreach.crm_input(p_emails) i
    join public.companies c
      on 'customer' = any (c.roles) and c.deleted_at is null
     and (lower(trim(c.email)) = i.email
          or (not i.free and (lower(c.domain) = i.domain
                              or split_part(lower(trim(c.email)), '@', 2) = i.domain
                              or regexp_replace(lower(c.website), '^(https?://)?(www\.)?([^/]+).*$', '\3') = i.domain)));
    return query
    select distinct on (i.email) i.email, 'Kontakt kupca u CRM-u (' || co.name || ')'
    from outreach.crm_input(p_emails) i
    join public.contacts ct on lower(trim(ct.email)) = i.email and ct.deleted_at is null
    join public.companies co on co.id = ct.company_id and 'customer' = any (co.roles);
  exception when others then
    raise warning 'crm_blocked: CRM firme preskočene (%)', sqlerrm;
  end;

  -- Odjave iz glavne aplikacije.
  begin
    return query
    select i.email, 'Odjavljen u glavnoj aplikaciji'
    from outreach.crm_input(p_emails) i
    where exists (select 1 from public.suppressed_emails s where lower(trim(s.email)) = i.email)
       or exists (select 1 from public.contacts ct where lower(trim(ct.email)) = i.email and ct.unsubscribed_at is not null);
  exception when others then
    raise warning 'crm_blocked: odjave iz glavne aplikacije preskočene (%)', sqlerrm;
  end;
end;
$$;

revoke all on function outreach.crm_blocked(text[]) from public, anon;
grant execute on function outreach.crm_blocked(text[]) to authenticated, service_role;
