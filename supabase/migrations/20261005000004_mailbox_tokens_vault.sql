-- Faza 3: povezivanje Gmail naloga.

-- Alias (Gmail "Send mail as") iz kog se šalje, ako je podešen.
alter table outreach.mailboxes add column alias_email text check (alias_email = lower(alias_email));

-- Refresh token se čuva šifrovano u Supabase Vault-u.
-- Funkcije sme da poziva samo service role (Edge funkcije).
create or replace function outreach.store_mailbox_token(p_mailbox_id uuid, p_refresh_token text, p_scopes text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  select refresh_token_secret_id into v_secret_id
  from outreach.mailbox_tokens where mailbox_id = p_mailbox_id;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_refresh_token, 'outreach_mailbox_' || p_mailbox_id::text, 'Gmail refresh token');
  else
    perform vault.update_secret(v_secret_id, p_refresh_token);
  end if;

  insert into outreach.mailbox_tokens (mailbox_id, refresh_token_secret_id, scopes, updated_at)
  values (p_mailbox_id, v_secret_id, p_scopes, now())
  on conflict (mailbox_id) do update
    set refresh_token_secret_id = excluded.refresh_token_secret_id,
        scopes = excluded.scopes,
        updated_at = now();
end;
$$;

create or replace function outreach.get_mailbox_token(p_mailbox_id uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select s.decrypted_secret
  from outreach.mailbox_tokens t
  join vault.decrypted_secrets s on s.id = t.refresh_token_secret_id
  where t.mailbox_id = p_mailbox_id;
$$;

revoke all on function outreach.store_mailbox_token(uuid, text, text[]) from public, anon, authenticated;
revoke all on function outreach.get_mailbox_token(uuid) from public, anon, authenticated;
grant execute on function outreach.store_mailbox_token(uuid, text, text[]) to service_role;
grant execute on function outreach.get_mailbox_token(uuid) to service_role;

-- Da li je mailbox povezan (bez otkrivanja tokena), za ekran Podešavanja.
create view outreach.mailbox_connections as
  select mailbox_id, scopes, updated_at
  from outreach.mailbox_tokens
  where outreach.is_team_member();

grant select on outreach.mailbox_connections to authenticated;

-- Članovi tima: nalozi sa @metricop.com koji su se prijavili u aplikaciju.
create view outreach.team_members as
  select email, created_at, last_sign_in_at
  from auth.users
  where lower(email) like '%@metricop.com' and outreach.is_team_member();

grant select on outreach.team_members to authenticated;
