-- Sve kampanje svedene na dva maila: upoznavanje + jedan follow-up (Nikola, 19.11.2026).
-- Treći mail je u SE-MAT pominjao osnivača imenom i prezimenom, a Nikola smatra da
-- treći (i četvrti) mail uznemirava ljude. Kasnije kampanje idu ka ljudima koji nas već znaju.
--
-- Uklonjeni koraci se ne brišu trajno: prvo se kopiraju u outreach.sequence_steps_archive.
-- Kontakti koji čekaju korak 3 ili 4 ne dobijaju ništa: run-cycle (dueAction) ih, kad im
-- dođe next_send_at, prebacuje u finished_no_reply jer posle koraka 2 nema sledećeg koraka.
-- Šabloni PRIMER-SE, PRIMER-SR i TEST-BRZI se ne menjaju.

create table if not exists outreach.sequence_steps_archive (
  sequence_id uuid not null,
  step_no integer not null,
  wait_days integer not null,
  subject text,
  body text not null,
  archived_at timestamptz not null default now(),
  reason text
);
alter table outreach.sequence_steps_archive enable row level security;

with live as (
  select id from outreach.sequences
  where name in ('GEO-SRB','SAD-LS','SAD-RC','SE-ENT','SE-INTRO','SE-KOM','SE-MAT','SE-MON','SE-SCAN')
), moved as (
  delete from outreach.sequence_steps st
  using live
  where st.sequence_id = live.id and st.step_no > 2
  returning st.sequence_id, st.step_no, st.wait_days, st.subject, st.body
)
insert into outreach.sequence_steps_archive (sequence_id, step_no, wait_days, subject, body, reason)
select sequence_id, step_no, wait_days, subject, body, 'Dve poruke po sekvenci (Nikola 19.11.2026)'
from moved;
