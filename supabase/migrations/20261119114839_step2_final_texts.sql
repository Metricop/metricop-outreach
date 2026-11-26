-- Drugi mail je od 19.11.2026 poslednji u svim kampanjama; novi tekstovi sa zatvaranjem (Nikola odobrio 19.11.2026).
-- SE-ENT, SE-MON i SE-KOM ostaju nepromenjeni. SE-SCAN više ne pominje FJD (ni u 1. mailu).
-- SAD-LS i SAD-RC: drugi mail 5 dana posle prvog umesto 3.

update outreach.sequence_steps st set body = $b$Hej {{ime}},

En sak till som kan vara användbar i era skanningsprojekt: vi har även tillbehör för registrering och georeferering, bland annat vrid- och tiltbara skanningsmåltavlor (kompatibla med Leica GZT21, även med magnetfäste), magnetiska reflextejpstavlor och GNSS-stänger för stödpunkter.

Allt finns på lager i Sverige: [skanningstillbehör](https://metricop.se/kollektion/skanningstillbehor?utm_source=email&utm_medium=outreach&utm_campaign=se-scan).

Jag hör inte av mig mer om detta. Om ni behöver komplettera inför ett projekt räcker det att svara här, så hjälper jag gärna till.$b$
from outreach.sequences s where s.id = st.sequence_id and s.name = 'SE-SCAN' and st.step_no = 2;

update outreach.sequence_steps st set body = replace(st.body,
  $o$Därför tänkte jag att våra tillbehör och handskannrar kunde vara relevanta för er.

Metricop erbjuder bland annat GNSS-stänger, stativ, trefötter och prismor för stödpunktsmätning, och även FJD Trion handskannrar.$o$,
  $n$Därför tänkte jag att våra tillbehör för skanning och stödpunktsmätning kunde vara relevanta för er.

Metricop erbjuder bland annat skanningsmåltavlor, reflextejpstavlor, GNSS-stänger, stativ och trefötter.$n$)
from outreach.sequences s where s.id = st.sequence_id and s.name = 'SE-SCAN' and st.step_no = 1;

update outreach.sequence_steps st set body = $b$Hej {{ime}},

En kort uppföljning: förutom prismor och stänger har vi även de tillbehör som oftast behöver bytas ut i fält, som trefötter, adaptrar och stativ, för de vanligaste instrumentmärkena.

Allt skickas från vårt lager i Sverige, oftast inom 2–4 dagar.

Jag hör inte av mig mer om detta, men om ni behöver komplettera något framöver räcker det att svara här.$b$
from outreach.sequences s where s.id = st.sequence_id and s.name = 'SE-INTRO' and st.step_no = 2;

update outreach.sequence_steps st set body = $b$Hej {{ime}},

En sak jag inte nämnde förra gången: prismor och adaptrar skiljer sig åt mellan instrumentmärken, bland annat i gänga och prismakonstant. Vi har tillbehör för flera märken, så om ni har instrument av olika fabrikat kan allt komma från ett och samma ställe.

Leveransen sker från vårt lager i Sverige, så det blir ingen väntan på frakt från utlandet.

Jag skickar inga fler mejl om detta. När behovet uppstår räcker det att svara här, så hjälper jag gärna till.$b$
from outreach.sequences s where s.id = st.sequence_id and s.name = 'SE-MAT' and st.step_no = 2;

update outreach.sequence_steps st set body = $b$Zdravo,

još jedna informacija uz moju prethodnu poruku: za određene modele možemo da organizujemo demonstraciju na vašem terenu pre kupovine, uz lokalnu podršku u Srbiji.

Ako razmatrate nabavku ili zamenu opreme, dovoljno je da mi napišete šta vam je potrebno i okvirni budžet, pa vam šaljem 2 do 3 konkretne opcije sa cenama.

Ako vam trenutno ništa ne treba, neću vam više pisati o ovome. Kad se potreba pojavi, dovoljno je da odgovorite na ovaj mail.

Hvala na vremenu i nadam se budućoj saradnji.$b$
from outreach.sequences s where s.id = st.sequence_id and s.name = 'GEO-SRB' and st.step_no = 2;

update outreach.sequence_steps st set wait_days = 5, body = $b$Hi {{ime}},

A bit more detail, in case it's useful. Here's how I'd match the three Trion models to survey work:

- P2: the lightest (700 g), with color. Best for interiors, facades and as-builts.
- V4E: built-in GNSS, so the scan lands in project coordinates without extra control. The one I'd pick for topo in tight spaces.
- S2: one sensor for handheld, backpack, vehicle and drone, with RTK.

All three are side by side, with typical survey use cases, on [our Trion overview page](https://metricop.com/lp/fjd/lidar?utm_source=email&utm_campaign=us-lidar-ls).

If scanning isn't on your radar right now, no problem, and this is my last note on it. Whenever it comes up, just reply here and I'll point you to the right model, or send sample scan data you can open in your own software.$b$
from outreach.sequences s where s.id = st.sequence_id and s.name = 'SAD-LS' and st.step_no = 2;

update outreach.sequence_steps st set wait_days = 5, body = $b$Hi {{ime}},

In case it's useful, here's where I see each Trion model earning its place next to a terrestrial scanner:

- P2: quick interiors, stairwells and MEP rooms, where the tripod setup takes longer than the job. 700 g, colored points.
- V4E: built-in GNSS, so the scan is georeferenced straight from the field.
- S2: one sensor for handheld, backpack, vehicle and drone work, with RTK.

The full lineup is on [this Trion page](https://metricop.com/lp/fjd/lidar?utm_source=email&utm_campaign=us-lidar-rc).

If you'd like to judge the data yourself, I'm happy to send a sample scan from a P2 or V4E to open in your own software. Otherwise I'll leave it here for now. Thanks for reading.$b$
from outreach.sequences s where s.id = st.sequence_id and s.name = 'SAD-RC' and st.step_no = 2;
