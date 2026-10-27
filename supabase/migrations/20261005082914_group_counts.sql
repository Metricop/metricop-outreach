-- Broj kontakata po grupi (lista grupa i zaštita od brisanja grupe sa kontaktima).
create view outreach.group_contact_counts
with (security_invoker = true)
as
  select group_id, count(*)::int as contacts
  from outreach.contacts
  where group_id is not null
  group by group_id;

grant select on outreach.group_contact_counts to authenticated;
