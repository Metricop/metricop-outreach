-- Izmene tabele tendera koje su 23.10.2026 urađene direktno u bazi posle migracije tenders:
-- kolona country (alarm je proširen na celu EU; postojeće objave su bile švedske) i poziv posebne
-- edge funkcije tenders umesto run-cycle. Na produkciji ne menja ništa, samo beleži stanje.

alter table outreach.tenders add column if not exists country text;
update outreach.tenders set country = 'SWE' where country is null;

create or replace function outreach.dispatch_tenders()
returns void
language plpgsql security definer set search_path = '' as $$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'outreach_cron_secret';
  perform net.http_post(
    url := 'https://rhpucosmbdakxlmtmrbv.supabase.co/functions/v1/tenders',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    timeout_milliseconds := 60000
  );
end $$;
