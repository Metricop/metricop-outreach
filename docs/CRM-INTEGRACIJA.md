# Outreach ↔ centralni CRM

Outreach i glavna aplikacija (CRM, proizvodi, finansije) žive u **istoj Supabase bazi** (`metricop-abm`).
Zato povezivanje ne traži API: CRM čita stalne poglede iz šeme `outreach`, a outreach čita kupce i odjave iz šeme `public`.

## 1. Šta outreach daje CRM-u (ugovor v1)

Pogledi su stabilni: kolone se **samo dodaju**, nikad ne brišu i ne menjaju značenje.
Ako zatreba promena, pravi se `*_v2`, a `*_v1` ostaje dok ga CRM koristi.

| Pogled | Jedan red je | Ključ |
| --- | --- | --- |
| `outreach.crm_companies_v1` | firma iz outreach-a | `id` (uuid, ne menja se) |
| `outreach.crm_contacts_v1` | kontakt (osoba sa mejlom) | `id` (uuid), `company_id` → firma |
| `outreach.crm_activities_v1` | događaj: poslat mejl, odgovor, bounce, beleška, poziv, sastanak, promena statusa | `id` (bigint), `contact_id`, `company_id` |

Svaki pogled ima `updated_at` ili `occurred_at`, pa CRM može da čita samo izmene posle poslednjeg uvoza.

### Firme (`crm_companies_v1`)
`name, legal_form, reg_no, vat_id, website, domain, phone, email, address, city, zip, country_code, description,
licenses, segment, source, tags, owner_email, crm_company_id, contacts_count, first_contacted_at, last_activity_at,
best_status, do_not_contact, created_at, updated_at`

- `best_status` je najbolji status među kontaktima firme (Zainteresovan > Odgovorio > … > Bounce).
- `do_not_contact` = svi kontakti firme su odjavljeni ili bounce.

### Kontakti (`crm_contacts_v1`)
`company_id, company_name, first_name, last_name, title, email, phone, country_code, city, linkedin_url,
external_ref, tier, contact_role, status, stage, do_not_contact, interest_level, next_step, next_contact_at,
lost_reason, owner_email, tags, group_code, group_name, mailbox_email, sequence_name, last_step, source, notes,
first_sent_at, last_sent_at, replied_at, unsubscribed_at, gmail_thread_id, crm_contact_id, created_at, updated_at`

`stage` je kratka faza za CRM:

| status u outreach-u | stage |
| --- | --- |
| queued, new | not_contacted |
| in_sequence | contacted |
| replied | replied |
| interested | interested |
| not_interested | not_interested |
| finished_no_reply | no_response |
| paused | on_hold |
| unsubscribed | unsubscribed (ne kontaktirati) |
| bounced | invalid_email (ne kontaktirati) |

`interest_level`: `high`, `medium`, `low`. `contact_role`: `primary`, `secondary`.

### Aktivnosti (`crm_activities_v1`)
`activity_type` je jedno od: `email_out` (sa `step_no`), `email_in`, `email_in_auto`, `bounce`, `note`, `call`,
`meeting`, `system`. Originalni tip je u `raw_type`, tekst u `summary`, autor ručnih upisa u `created_by`.
Za `email_out`/`email_in` postoji `gmail_thread_id`, pa CRM može da poveže nit sa svojim `activities.gmail_thread_id`.

## 2. Kako CRM povezuje zapise

CRM već ima tabelu `public.source_links` sa izvorom `outreach_contacts`. Predlog:

- kontakt: `source_system = 'outreach_contacts'`, `source_id = crm_contacts_v1.id`, `entity_type = 'contact'`;
- firma: `source_system = 'outreach_contacts'`, `source_id = 'company:' || crm_companies_v1.id`, `entity_type = 'company'`.

Kada CRM poveže zapis, može da upiše svoj id nazad u `outreach.contacts.crm_contact_id` i
`outreach.companies.crm_company_id` (servisni ključ). Outreach te kolone ne menja.

## 3. Šta outreach čita iz glavne aplikacije

Funkcija `outreach.crm_blocked(emails)` vraća adrese koje **ne smeju** da dobiju cold mejl i razlog:

- kupac iz `public.customers` (ista adresa ili isti domen firme, osim besplatnih servisa iz `outreach.free_mail_domains`);
- firma sa ulogom `customer` u `public.companies` (mejl, domen ili sajt) i njeni kontakti iz `public.contacts`;
- odjava iz `public.suppressed_emails` ili `public.contacts.unsubscribed_at`.

Koristi je slanje (`run-cycle`, pre svakog novog mejla i follow-upa) i Import (preskače takve redove).
Svaki izvor se čita u svom bloku: ako se tabela u glavnoj aplikaciji preimenuje, taj izvor se preskače, a slanje radi dalje.
Kada glavna aplikacija ukloni `public.customers` (korak 3.4 u CRM-u), dovoljno je da kupci imaju ulogu `customer` u `public.companies`.

## 4. Pravila

- Outreach nikad ne piše u šemu `public`. CRM ne piše u `outreach`, osim kolona `crm_contact_id` i `crm_company_id`.
- Svaka izmena baze prvo ide kao migracioni fajl u repo (`supabase/migrations`), pa se tek onda primenjuje.
- Pristup: pogledi rade sa pravima korisnika (RLS: samo nalozi `@metricop.com`); CRM uvoz radi sa servisnim ključem.
