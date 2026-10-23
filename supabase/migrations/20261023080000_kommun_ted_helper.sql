-- Jednokratna pomoćna tabela i funkcija za listu kommuna (23.10.2026): za 50 švedskih kommuna pretražene su
-- njihove objave u TED-u, a iz rezultata je napravljen kommuner-tenderi.xlsx. Napravljene su direktno u bazi,
-- bez migracije; ovaj fajl ih beleži da bi istorija u repou odgovarala bazi. Brišu se u 20261023130000_drop_kommun_ted.sql.

create table outreach._kommun_ted (
  company text,
  req_id  bigint
);

create or replace function outreach._kommun_ted_retry()
returns void
language sql security definer set search_path = outreach, public as $function$
with f as (select k.company from outreach._kommun_ted k join net._http_response h on h.id=k.req_id where h.status_code<>200 or h.status_code is null and h.error_msg is not null order by random() limit 3)
update outreach._kommun_ted k set req_id = net.http_post(url:='https://api.ted.europa.eu/v3/notices/search', timeout_milliseconds:=60000, headers:='{"Content-Type":"application/json"}'::jsonb, body:=jsonb_build_object('query', format('buyer-country=SWE AND buyer-name="%s" AND publication-date>=20240101', k.company), 'fields', jsonb_build_array('publication-number','buyer-name','document-url-lot','submission-url-lot','notice-type'), 'limit', 100))
from f where f.company=k.company $function$;
