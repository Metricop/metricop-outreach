-- Pauza slanja po grupi (npr. praznici): run-cycle ne šalje ništa iz grupe od pause_from do pause_to
-- (lokalni datum grupe, oba dana uključena). Follow-upovi koji dospeju u pauzi idu prvog radnog dana posle nje.

alter table outreach.groups
  add column pause_from date,
  add column pause_to date,
  add constraint groups_pause_range check (pause_from is null or pause_to is null or pause_from <= pause_to);

-- Nikola 30.10.2026: američke grupe pauziraju preko praznika i nastavljaju posle (pon 4.1.2027).
update outreach.groups
set pause_from = date '2026-12-24', pause_to = date '2027-01-01'
where country_code = 'US';
