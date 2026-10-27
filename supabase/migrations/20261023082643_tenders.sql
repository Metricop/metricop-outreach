create table outreach.tenders (
  publication_number text primary key,
  published_on       date not null,
  buyer              text,
  title              text not null,
  notice_type        text not null,
  cpv                text,
  deadline           date,
  url                text not null,
  notified_at        timestamptz,
  created_at         timestamptz not null default now()
);
alter table outreach.tenders enable row level security;
grant all on outreach.tenders to service_role;
grant select on outreach.tenders to authenticated;
create policy tenders_team_read on outreach.tenders for select to authenticated using (outreach.is_team_member());

create or replace function outreach.dispatch_tenders()
returns void
language plpgsql security definer set search_path = '' as $$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'outreach_cron_secret';
  perform net.http_post(
    url := 'https://rhpucosmbdakxlmtmrbv.supabase.co/functions/v1/run-cycle',
    body := jsonb_build_object('action', 'tenders'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    timeout_milliseconds := 60000
  );
end $$;

revoke all on function outreach.dispatch_tenders() from public, anon, authenticated;

select cron.schedule('outreach-tenders-weekly', '0 6 * * 1', 'select outreach.dispatch_tenders()');
