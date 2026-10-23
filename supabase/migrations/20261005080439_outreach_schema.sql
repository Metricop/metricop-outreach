-- Metricop Outreach: osnovna šema (Faza 1)
-- Sve tabele žive u zasebnoj šemi `outreach`, da se ne mešaju sa tabelama
-- ABM agenta u šemi `public` istog Supabase projekta.

create schema if not exists outreach;

-- ---------------------------------------------------------------------------
-- Pristup: samo prijavljeni korisnici sa @metricop.com
-- ---------------------------------------------------------------------------

create or replace function outreach.is_team_member()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    lower(auth.jwt() ->> 'email') like '%@metricop.com',
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Tabele
-- ---------------------------------------------------------------------------

create table outreach.mailboxes (
  id                uuid primary key default gen_random_uuid(),
  email             text not null unique check (email = lower(email)),
  display_name      text,
  signature         text,
  market            text not null check (market in ('RS', 'SE')),
  daily_limit_new   integer not null default 10 check (daily_limit_new between 0 and 50),
  daily_limit_total integer not null default 20 check (daily_limit_total between 0 and 50),
  per_run_limit     integer not null default 3 check (per_run_limit between 1 and 50),
  send_hour_from    integer not null default 9 check (send_hour_from between 0 and 23),
  send_hour_to      integer not null default 17 check (send_hour_to between 1 and 24),
  timezone          text not null default 'Europe/Belgrade',
  active            boolean not null default false,
  test_mode         boolean not null default true,
  test_email        text,
  created_at        timestamptz not null default now(),
  check (send_hour_from < send_hour_to)
);

-- Refresh token se čuva šifrovano u Supabase Vault-u; ovde je samo id tajne.
-- Tabelu čita isključivo Edge Function preko service role ključa.
create table outreach.mailbox_tokens (
  mailbox_id              uuid primary key references outreach.mailboxes (id) on delete cascade,
  refresh_token_secret_id uuid not null,
  scopes                  text[] not null default '{}',
  updated_at              timestamptz not null default now()
);

create table outreach.sequences (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  language   text not null,
  created_at timestamptz not null default now()
);

create table outreach.sequence_steps (
  sequence_id uuid not null references outreach.sequences (id) on delete cascade,
  step_no     integer not null check (step_no >= 1),
  wait_days   integer not null default 0 check (wait_days >= 0),
  subject     text,
  body        text not null default '',
  primary key (sequence_id, step_no)
);

create table outreach.groups (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  mailbox_id  uuid references outreach.mailboxes (id) on delete set null,
  sequence_id uuid references outreach.sequences (id) on delete set null,
  active      boolean not null default false,
  priority    integer not null default 100,
  created_at  timestamptz not null default now()
);

create table outreach.contacts (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid references outreach.groups (id) on delete set null,
  company         text,
  first_name      text,
  email           text not null unique check (email = lower(email)),
  city            text,
  personalization text,
  source          text,
  status          text not null default 'new' check (status in (
                    'new', 'in_sequence', 'replied', 'interested', 'not_interested',
                    'unsubscribed', 'bounced', 'finished_no_reply', 'paused')),
  step            integer not null default 0 check (step >= 0),
  last_sent_at    timestamptz,
  next_send_at    timestamptz,
  gmail_thread_id text,
  last_message_id text,
  notes           text,
  created_at      timestamptz not null default now()
);

create index contacts_group_status_idx on outreach.contacts (group_id, status);
create index contacts_status_next_send_idx on outreach.contacts (status, next_send_at);

create table outreach.events (
  id         bigint generated always as identity primary key,
  contact_id uuid references outreach.contacts (id) on delete cascade,
  mailbox_id uuid references outreach.mailboxes (id) on delete set null,
  type       text not null,
  detail     text,
  created_at timestamptz not null default now()
);

create index events_contact_idx on outreach.events (contact_id, created_at desc);
create index events_mailbox_created_idx on outreach.events (mailbox_id, created_at desc);
create index events_type_created_idx on outreach.events (type, created_at desc);

create table outreach.daily_counters (
  mailbox_id uuid not null references outreach.mailboxes (id) on delete cascade,
  date       date not null,
  sent_new   integer not null default 0,
  sent_total integer not null default 0,
  primary key (mailbox_id, date)
);

-- Jedan red je ili adresa ili ceo domen.
create table outreach.suppression (
  id         uuid primary key default gen_random_uuid(),
  email      text unique check (email = lower(email)),
  domain     text unique check (domain = lower(domain)),
  reason     text not null default 'manual',
  created_at timestamptz not null default now(),
  check ((email is null) <> (domain is null))
);

-- ---------------------------------------------------------------------------
-- Prava i Row Level Security
-- ---------------------------------------------------------------------------

revoke all on schema outreach from anon, public;
grant usage on schema outreach to authenticated, service_role;
grant all on all tables in schema outreach to service_role;
grant all on all sequences in schema outreach to service_role;
grant select, insert, update, delete on all tables in schema outreach to authenticated;
grant usage on all sequences in schema outreach to authenticated;
grant execute on function outreach.is_team_member() to authenticated;

-- Tokeni: korisnici iz aplikacije nemaju nikakav pristup.
revoke all on outreach.mailbox_tokens from authenticated;

alter table outreach.mailboxes      enable row level security;
alter table outreach.mailbox_tokens enable row level security;
alter table outreach.sequences      enable row level security;
alter table outreach.sequence_steps enable row level security;
alter table outreach.groups         enable row level security;
alter table outreach.contacts       enable row level security;
alter table outreach.events         enable row level security;
alter table outreach.daily_counters enable row level security;
alter table outreach.suppression    enable row level security;

-- mailbox_tokens namerno nema politiku: pristup ima samo service role.

create policy team_all on outreach.mailboxes
  for all to authenticated using (outreach.is_team_member()) with check (outreach.is_team_member());
create policy team_all on outreach.sequences
  for all to authenticated using (outreach.is_team_member()) with check (outreach.is_team_member());
create policy team_all on outreach.sequence_steps
  for all to authenticated using (outreach.is_team_member()) with check (outreach.is_team_member());
create policy team_all on outreach.groups
  for all to authenticated using (outreach.is_team_member()) with check (outreach.is_team_member());
create policy team_all on outreach.contacts
  for all to authenticated using (outreach.is_team_member()) with check (outreach.is_team_member());
create policy team_all on outreach.events
  for all to authenticated using (outreach.is_team_member()) with check (outreach.is_team_member());
create policy team_all on outreach.daily_counters
  for all to authenticated using (outreach.is_team_member()) with check (outreach.is_team_member());
create policy team_all on outreach.suppression
  for all to authenticated using (outreach.is_team_member()) with check (outreach.is_team_member());
