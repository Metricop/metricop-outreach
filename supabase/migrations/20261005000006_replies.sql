-- Faza 5: provera odgovora.

-- Poslednja pregledana poruka u Gmail niti; sledeći krug gleda samo novije.
alter table outreach.contacts add column last_seen_message_id text;

-- Ekran Odgovori: kontakti sa statusom Odgovorio i njihov poslednji odgovor.
create view outreach.reply_inbox
with (security_invoker = true)
as
  select
    c.id as contact_id,
    c.company,
    c.first_name,
    c.email,
    c.city,
    c.status,
    c.gmail_thread_id,
    g.code as group_code,
    m.email as mailbox_email,
    e.detail as excerpt,
    e.created_at as replied_at
  from outreach.contacts c
  left join outreach.groups g on g.id = c.group_id
  left join outreach.mailboxes m on m.id = g.mailbox_id
  left join lateral (
    select detail, created_at from outreach.events
    where contact_id = c.id and type = 'reply'
    order by created_at desc limit 1
  ) e on true
  where c.status = 'replied';

grant select on outreach.reply_inbox to authenticated;
