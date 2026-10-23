-- Posebna podešavanja grupe: potpis i radno vreme. Prazno (null) = kao mailbox.
-- Tako isti nalog šalje srpske grupe po beogradskom, a američke po američkom vremenu.

alter table outreach.groups
  add column signature      text,
  add column timezone       text,
  add column send_hour_from integer check (send_hour_from between 0 and 23),
  add column send_hour_to   integer check (send_hour_to between 1 and 24),
  add constraint groups_send_hours_check check (
    (send_hour_from is null) = (send_hour_to is null)
    and (send_hour_from is null or send_hour_from < send_hour_to)
  );
