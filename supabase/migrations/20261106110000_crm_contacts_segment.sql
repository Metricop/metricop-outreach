-- Ugovor v1 za centralni CRM (metricop.com): kolone se samo dodaju na kraj.
-- company_segment = delatnost firme, group_segment = delatnost za koju je pisana sekvenca koju kontakt dobija.
create or replace view outreach.crm_contacts_v1
with (security_invoker = true)
as
select
  c.id, c.company_id, c.company as company_name, c.first_name, c.last_name, c.title, c.email, c.phone,
  c.country_code, c.city, c.linkedin_url, c.external_ref, c.tier, c.contact_role,
  c.status,
  case c.status
    when 'queued' then 'not_contacted' when 'new' then 'not_contacted' when 'in_sequence' then 'contacted'
    when 'replied' then 'replied' when 'interested' then 'interested' when 'not_interested' then 'not_interested'
    when 'unsubscribed' then 'unsubscribed' when 'bounced' then 'invalid_email'
    when 'finished_no_reply' then 'no_response' when 'paused' then 'on_hold'
  end as stage,
  c.status in ('unsubscribed', 'bounced') as do_not_contact,
  c.interest_level, c.next_step, c.next_contact_at, c.lost_reason, c.owner_email, c.tags,
  g.code as group_code, g.name as group_name, m.email as mailbox_email, s.name as sequence_name,
  c.step as last_step, c.source, c.notes,
  ev.first_sent_at, c.last_sent_at, ev.replied_at, ev.unsubscribed_at,
  c.gmail_thread_id, c.crm_contact_id,
  c.created_at, c.updated_at,
  co.segment as company_segment,
  g.segment as group_segment
from outreach.contacts c
left join outreach.groups g on g.id = c.group_id
left join outreach.mailboxes m on m.id = g.mailbox_id
left join outreach.sequences s on s.id = g.sequence_id
left join outreach.companies co on co.id = c.company_id
left join lateral (
  select
    min(e.created_at) filter (where e.type like 'sent\_step\_%') as first_sent_at,
    max(e.created_at) filter (where e.type = 'reply') as replied_at,
    max(e.created_at) filter (where e.type = 'status_change' and e.detail like '%→ unsubscribed') as unsubscribed_at
  from outreach.events e where e.contact_id = c.id
) ev on true;

comment on view outreach.crm_contacts_v1 is 'Ugovor za centralni CRM (v1): kontakti, faza (stage), zainteresovanost, istorija slanja i delatnost (company_segment, group_segment).';
