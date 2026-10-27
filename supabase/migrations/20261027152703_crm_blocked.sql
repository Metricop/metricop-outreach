-- Zaštita kupaca: outreach nikad ne šalje cold mejl postojećem kupcu iz glavne
-- aplikacije (public.customers) ni adresi odjavljenoj tamo (public.suppressed_emails).
-- Tabele u šemi public se samo čitaju.

-- Besplatni i javni mail servisi: kod njih se ne poredi domen, samo cela adresa.
create table outreach.free_mail_domains (
  domain text primary key check (domain = lower(domain))
);

insert into outreach.free_mail_domains (domain) values
  ('gmail.com'), ('googlemail.com'), ('yahoo.com'), ('yahoo.se'), ('hotmail.com'), ('hotmail.se'),
  ('outlook.com'), ('live.com'), ('live.se'), ('msn.com'), ('icloud.com'), ('me.com'), ('aol.com'),
  ('proton.me'), ('protonmail.com'), ('gmx.com'), ('gmx.net'), ('mail.com'), ('yandex.com'),
  ('mts.rs'), ('eunet.rs'), ('open.telekom.rs'), ('ptt.rs'), ('sbb.rs'), ('beotel.rs'), ('orion.rs'),
  ('telenor.rs'), ('yubc.net'), ('neobee.net'), ('bitsyu.net'), ('telia.com'), ('comhem.se'),
  ('bredband.net'), ('spray.se'), ('comcast.net'), ('att.net'), ('verizon.net'), ('sbcglobal.net'),
  ('bellsouth.net'), ('charter.net'), ('cox.net');

alter table outreach.free_mail_domains enable row level security;
grant select, insert, update, delete on outreach.free_mail_domains to authenticated;
grant all on outreach.free_mail_domains to service_role;
create policy team_all on outreach.free_mail_domains
  for all to authenticated using (outreach.is_team_member()) with check (outreach.is_team_member());

-- Za date adrese vraća one koje ne smeju da dobiju cold mejl i razlog.
-- Kupac se prepoznaje po istoj adresi ili po istom domenu firme (osim besplatnih servisa).
create or replace function outreach.crm_blocked(p_emails text[])
returns table (email text, reason text)
language sql
stable
security definer
set search_path = ''
as $$
  with allowed as (
    select coalesce(auth.jwt() ->> 'role', '') = 'service_role' or outreach.is_team_member() as ok
  ),
  input as (
    select distinct lower(trim(x)) as email, split_part(lower(trim(x)), '@', 2) as domain
    from unnest(p_emails) as x
    where (select ok from allowed)
  ),
  cust as (
    select lower(trim(k.email)) as email, split_part(lower(trim(k.email)), '@', 2) as domain, k.company
    from public.customers k
    where k.email like '%@%'
  )
  select i.email, 'Postojeći kupac' || coalesce(' (' || c.company || ')', '')
  from input i
  cross join lateral (
    select cu.company from cust cu
    where cu.email = i.email
       or (cu.domain = i.domain
           and not exists (select 1 from outreach.free_mail_domains f where f.domain = i.domain))
    limit 1
  ) c
  union
  select i.email, 'Odjavljen u glavnoj aplikaciji'
  from input i
  join public.suppressed_emails s on lower(trim(s.email)) = i.email;
$$;

revoke all on function outreach.crm_blocked(text[]) from public, anon;
grant execute on function outreach.crm_blocked(text[]) to authenticated, service_role;
