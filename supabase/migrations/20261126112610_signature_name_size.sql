-- Ime potpisnika u potpisima SAD i Srbija ~20% veće (Nikola, 26.11.2026).
-- Red "## Ime" compose.ts prikazuje podebljano, 17px (ostatak potpisa je 14px).
-- Primeniti tek posle deploy-a run-cycle sa novim compose.ts, inače bi se "##" video u mailu.
update outreach.groups set signature = replace(signature, '**Nikola Miladinovic**', '## Nikola Miladinovic')
where code in ('US-LS','US-RC') and signature like '%**Nikola Miladinovic**%';
update outreach.groups set signature = replace(signature, '**Nikola Miladinović**', '## Nikola Miladinović')
where code = 'GEO-SRB' and signature like '%**Nikola Miladinović**%';
