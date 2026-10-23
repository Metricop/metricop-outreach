-- Tržište SAD (US): mailbox za američke kampanje, šalje u američkoj vremenskoj zoni.

alter table outreach.mailboxes drop constraint if exists mailboxes_market_check;
alter table outreach.mailboxes add constraint mailboxes_market_check check (market in ('RS', 'SE', 'US'));
