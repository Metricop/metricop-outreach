create or replace function outreach.dispatch_report()
returns void
language plpgsql security definer set search_path = '' as $$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'outreach_cron_secret';
  perform net.http_post(
    url := 'https://rhpucosmbdakxlmtmrbv.supabase.co/functions/v1/run-cycle',
    body := jsonb_build_object('action', 'report'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    timeout_milliseconds := 60000
  );
end $$;

revoke all on function outreach.dispatch_report() from public, anon, authenticated;

select cron.schedule('outreach-daily-report', '30 16 * * 1-5', 'select outreach.dispatch_report()');
