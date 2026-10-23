-- Faza 4: automatski krug slanja.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Razlog automatske pauze (istekao token, bounce stopa); prikazuje se na Pregledu.
alter table outreach.mailboxes add column paused_reason text;

-- Zaključavanje po mailboxu, da se dva kruga ne preklope (zakup sa rokom).
create table outreach.cycle_locks (
  mailbox_id   uuid primary key references outreach.mailboxes (id) on delete cascade,
  locked_until timestamptz not null
);
alter table outreach.cycle_locks enable row level security;
grant all on outreach.cycle_locks to service_role;

create or replace function outreach.try_lock_mailbox(p_mailbox_id uuid, p_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  insert into outreach.cycle_locks (mailbox_id, locked_until)
  values (p_mailbox_id, now() + make_interval(secs => p_seconds))
  on conflict (mailbox_id) do update
    set locked_until = excluded.locked_until
    where outreach.cycle_locks.locked_until < now()
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

create or replace function outreach.unlock_mailbox(p_mailbox_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from outreach.cycle_locks where mailbox_id = p_mailbox_id;
$$;

-- Brojanje dnevnih limita (atomski).
create or replace function outreach.bump_daily_counter(p_mailbox_id uuid, p_date date, p_is_new boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into outreach.daily_counters (mailbox_id, date, sent_new, sent_total)
  values (p_mailbox_id, p_date, case when p_is_new then 1 else 0 end, 1)
  on conflict (mailbox_id, date) do update
    set sent_new = outreach.daily_counters.sent_new + case when p_is_new then 1 else 0 end,
        sent_total = outreach.daily_counters.sent_total + 1;
$$;

-- Tajni ključ kojim pg_cron poziva run-cycle; čuva se u Vault-u.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'outreach_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'outreach_cron_secret', 'Poziv run-cycle iz pg_cron');
  end if;
end;
$$;

create or replace function outreach.verify_cron_secret(p_secret text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'outreach_cron_secret' and decrypted_secret = p_secret
  );
$$;

-- Za svaki aktivni mailbox poziva run-cycle (svaki mailbox u svom pozivu).
create or replace function outreach.dispatch_cycles()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_mailbox record;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'outreach_cron_secret';
  for v_mailbox in select id from outreach.mailboxes where active loop
    perform net.http_post(
      url := 'https://rhpucosmbdakxlmtmrbv.supabase.co/functions/v1/run-cycle',
      body := jsonb_build_object('action', 'cycle', 'mailbox_id', v_mailbox.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
      timeout_milliseconds := 300000
    );
  end loop;
end;
$$;

revoke all on function outreach.try_lock_mailbox(uuid, int) from public, anon, authenticated;
revoke all on function outreach.unlock_mailbox(uuid) from public, anon, authenticated;
revoke all on function outreach.bump_daily_counter(uuid, date, boolean) from public, anon, authenticated;
revoke all on function outreach.verify_cron_secret(text) from public, anon, authenticated;
revoke all on function outreach.dispatch_cycles() from public, anon, authenticated;
grant execute on function outreach.try_lock_mailbox(uuid, int) to service_role;
grant execute on function outreach.unlock_mailbox(uuid) to service_role;
grant execute on function outreach.bump_daily_counter(uuid, date, boolean) to service_role;
grant execute on function outreach.verify_cron_secret(text) to service_role;

select cron.schedule('outreach-run-cycle', '*/15 * * * *', 'select outreach.dispatch_cycles()');
