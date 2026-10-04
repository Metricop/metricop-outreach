# Metricop Outreach – specifikacija za Claude Code

## Cilj i kontekst

Napraviti malu internu web aplikaciju za cold email kampanje firme Metricop, koja zamenjuje Apollo i Google Sheets + Apps Script rešenje. Aplikacija šalje personalizovane sekvence mejlova iz naših Google Workspace naloga, sama šalje follow-upove, prepoznaje odgovore i prikazuje sve na jednom preglednom mestu.

- **Ciljna grupa:** geodetske firme i povezani biroi. Ukupno tržište je do 10.000 firmi, realno 500–2.000 godišnje.
- **Tržišta:** prvo Srbija, zatim Švedska. Svako tržište ima svoj mailbox i svoje šablone, na svom jeziku.
- **Obim:** 20–40 mejlova dnevno po mailboxu. Ovo nije alat za masovno slanje i ne sme da postane.
- **Korisnici:** 1–3 osobe iz tima. Nema javnog pristupa.
- **Princip:** jednostavno, pregledno, malo pokretnih delova. Ne praviti Instantly; praviti tačno ono što ovde piše.

Postojeće Apps Script rešenje (Google Sheet sa listovima Kontakti, Grupe, Šabloni, Podešavanja, Dnevnik, Izveštaj) je referenca za logiku. Ako je dostupno u projektu (`outreach_skripta.gs`), pročitati ga pre početka.

## Tehnički stek i arhitektura

Predloženi stek je Next.js + Supabase, jer Supabase već koristimo i daje bazu, prijavu, zakazane poslove i serverske funkcije na jednom mestu.

| Deo | Tehnologija | Uloga |
| --- | --- | --- |
| Frontend | Next.js (App Router), TypeScript, Tailwind | Ekrani aplikacije |
| Baza i prijava | Supabase Postgres + Supabase Auth (Google prijava) | Podaci i pristup samo za naš domen |
| Slanje i provera | Supabase Edge Functions | `run-cycle` (slanje + provera odgovora), `gmail-oauth` |
| Raspored | `pg_cron` u Supabase-u | Poziva `run-cycle` na svakih 15 minuta |
| Gmail | Gmail API, OAuth po mailboxu | Slanje u niti, čitanje niti, labele |
| Personalizacija | Claude API (Anthropic) | Predlog uvodne rečenice po firmi |
| Hosting | Vercel | Frontend |

Tok podataka: korisnik u aplikaciji uvozi kontakte i uređuje šablone → podaci idu u Supabase → `pg_cron` svakih 15 minuta poziva `run-cycle` → funkcija za svaki aktivni mailbox proverava odgovore, pa šalje dospele follow-upove i nove kontakte preko Gmail API-ja → rezultat se upisuje u bazu → aplikacija prikazuje stanje.

Sve tajne (Gmail refresh tokeni, Claude API ključ, service role ključ) žive samo na serveru, nikad u frontendu.

## Model podataka

Sve tabele u Supabase Postgres-u, sa Row Level Security (pristup samo prijavljenim članovima tima).

| Tabela | Ključna polja | Napomena |
| --- | --- | --- |
| `mailboxes` | id, email, display_name, signature, market (RS/SE), daily_limit_new, daily_limit_total, per_run_limit, send_hour_from, send_hour_to, timezone, active, test_mode, test_email | Jedan red po Gmail nalogu ili aliasu |
| `mailbox_tokens` | mailbox_id, refresh_token (šifrovan), scopes | Samo serverski pristup |
| `groups` | id, code, name, description, mailbox_id, sequence_id, active, priority | Npr. GEO-BG, GEO-VOJ |
| `sequences` | id, name, language | Npr. SEK-A (srpski) |
| `sequence_steps` | sequence_id, step_no, wait_days, subject, body | Naslov samo za korak 1 |
| `contacts` | id, group_id, company, first_name, email (unique), city, personalization, source, status, step, last_sent_at, next_send_at, gmail_thread_id, last_message_id, notes, created_at | Glavna tabela |
| `events` | id, contact_id, mailbox_id, type, detail, created_at | Dnevnik: sent_step_N, reply, bounce, auto_reply, error, finished |
| `daily_counters` | mailbox_id, date, sent_new, sent_total | Brojanje dnevnih limita |
| `suppression` | email ili domen, reason | Nikad ne kontaktirati (odjavljeni, bounce, ručno) |

Statusi kontakta: `new`, `in_sequence`, `replied`, `interested`, `not_interested`, `unsubscribed`, `bounced`, `finished_no_reply`, `paused`. U interfejsu se prikazuju na srpskom (Novo, U sekvenci, Odgovorio, Zainteresovan, Nije zainteresovan, Odjavljen, Bounce, Završeno bez odgovora, Pauza).

Polja u šablonima: `{{ime}}`, `{{firma}}`, `{{grad}}`, `{{personalizacija}}`. Prazno ime uklanja i zarez ispred; prazna personalizacija uklanja ceo red.

## Ekrani i funkcije

Šest ekrana, levi meni, interfejs na srpskom (latinica), čist i miran dizajn. Svaki ekran mora da radi i na telefonu.

1. **Pregled (početna).** Kartice: poslato danas / ove nedelje, novi odgovori, zainteresovani, bounce, stopa odgovora. Tabela po grupama (kontaktirano, odgovori, zainteresovani, stopa). Grafikon slanja i odgovora za poslednjih 30 dana. Prekidač po mailboxu: Aktivno / Pauza, sa jasnom oznakom kad je uključen test mod.
2. **Kontakti.** Tabela sa pretragom i filterima (grupa, status, grad). Klik na red otvara bočni panel: podaci firme, istorija događaja i prepiska iz Gmail niti (samo čitanje). Masovne akcije: promeni grupu, pauziraj, obriši, označi status.
3. **Import.** Upload CSV ili XLSX → mapiranje kolona (firma, ime, email, grad, personalizacija, izvor) → izbor grupe → pregled pre uvoza sa upozorenjima: neispravan email, duplikat u bazi, adresa ili domen na listi za izuzimanje. Uvoz samo ispravnih redova, izveštaj šta je preskočeno.
4. **Grupe i šabloni.** Lista grupa (šifra, naziv, mailbox, sekvenca, aktivna, prioritet). Uređivač sekvence: koraci, dani čekanja, naslov, tekst, sa pregledom kako mejl izgleda za izabrani kontakt i dugmetom "Pošalji test meni".
5. **Odgovori.** Lista kontakata sa statusom Odgovorio, najnoviji prvi, sa izvodom odgovora. Dugmad: Zainteresovan, Nije zainteresovan, Odjavljen (odjava dodaje adresu na listu za izuzimanje) i link "Otvori u Gmailu".
6. **Podešavanja.** Mailboxovi (povezivanje Gmail naloga preko OAuth-a, alias, potpis, limiti, radno vreme, test mod), članovi tima, lista za izuzimanje.

**Personalizacija sa Claude-om.** Na ekranu Kontakti: izaberi kontakte → "Predloži personalizaciju". Server poziva Claude API sa podacima firme (naziv, grad, izvor, beleške) i vraća jednu kratku rečenicu po kontaktu. Predlozi se prikazuju za odobrenje i ne upisuju se dok ih korisnik ne prihvati. Bez izmišljanja činjenica: ako nema podataka, vrati prazno.

## Automatsko slanje, follow-upovi i provera odgovora

Funkcija `run-cycle` radi na svakih 15 minuta i za svaki aktivni mailbox izvršava isti redosled. Koristi zaključavanje (npr. `pg_advisory_lock` po mailboxu), da se dva kruga ne preklope.

1. **Provera radnog vremena.** Samo pon–pet, između `send_hour_from` i `send_hour_to`, u vremenskoj zoni mailboxa (Europe/Belgrade, Europe/Stockholm). Van toga funkcija samo proverava odgovore.
2. **Provera odgovora.** Za svaki kontakt u statusu `in_sequence` čita Gmail nit (`threads.get`, format metadata, zaglavlja From, Subject, Auto-Submitted):
    - poruka od mailer-daemon ili postmaster → `bounced`, adresa na listu za izuzimanje
    - automatski odgovor (Auto-Submitted različit od `no`, ili naslov tipa "out of office", "automatski odgovor") → samo upis događaja, sekvenca nastavlja
    - bilo koja druga poruka koja nije od naše adrese ili aliasa → `replied`, sekvenca staje, nit dobija labelu `Outreach/Odgovori`
3. **Follow-upovi.** Kontakti `in_sequence` kojima je `next_send_at` prošao dobijaju sledeći korak. Ako više nema koraka, status postaje `finished_no_reply`.
4. **Novi kontakti.** Kontakti `new` iz aktivnih grupa, po prioritetu grupe, pa po datumu dodavanja. Pre slanja proveriti listu za izuzimanje i duplikate.
5. **Limiti.** Najviše `per_run_limit` mejlova po krugu (podrazumevano 3), uz `daily_limit_new` i `daily_limit_total` po mailboxu. Između dva mejla nasumična pauza 15–45 sekundi.

**Slanje u istoj niti.** Korak 1 se šalje kao nova poruka. Koraci 2+ idu preko `users.messages.send` sa `threadId`, naslovom `Re: <prvi naslov>` i zaglavljima `In-Reply-To` i `References` (Message-ID prethodne poruke). Posle slanja upisati `gmail_thread_id` i Message-ID. Poruka je `multipart/alternative` (čisti tekst + jednostavan HTML), UTF-8, bez slika, priloga i tracking piksela. From = alias mailboxa ako je podešen, inače glavna adresa.

**Raspored follow-upa.** Posle koraka N, `next_send_at` = sada + `wait_days` sledećeg koraka. Posle poslednjeg koraka čeka se još 7 dana na odgovor, pa status postaje `finished_no_reply`.

**Test mod.** Kad je uključen za mailbox, svi mejlovi idu na `test_email`, naslov dobija prefiks `[TEST]`, a sve ostalo radi normalno.

**Greške.** Greška pri slanju jednom kontaktu → kontakt ide u `paused` sa opisom greške u `notes`, upisuje se događaj, krug nastavlja. Istekao ili opozvan Gmail token → mailbox se automatski pauzira i na Pregledu se prikazuje upozorenje.

## Isporučivost i pravila slanja

Aplikacija mora da čuva reputaciju domena metricop.com, zato su ova pravila ugrađena u kod, a ne ostavljena korisniku.

- **Podrazumevani limiti:** 10 novih i 20 ukupno dnevno po mailboxu prve dve nedelje, zatim do 40 ukupno. Tvrda gornja granica u kodu: 50 dnevno po mailboxu, bez obzira na podešavanje.
- **Bez tracking piksela i bez prepravljanja linkova.** Pratimo samo odgovore i bounce.
- **Lista za izuzimanje** ima prednost nad svim ostalim. Odjava i bounce automatski dodaju adresu; ručno se može dodati i ceo domen.
- **Jedna adresa nikad ne dobija dve sekvence.** Email je jedinstven u celoj bazi, bez obzira na grupu.
- **Bounce stopa:** ako je u poslednjih 7 dana iznad 3% za mailbox, mailbox se automatski pauzira i prikazuje se upozorenje.
- **Svaki šablon prvog koraka** mora da ima rečenicu za odjavu. Uređivač upozorava ako je nema.
- **Bez priloga i slika** u cold mejlovima; najviše jedan link po mejlu (uređivač upozorava).

## Bezbednost i pristup

Aplikacija je interna: prijava je moguća samo Google nalozima sa domena metricop.com.

- **Prijava:** Supabase Auth sa Google provajderom; posle prijave server odbija svaki nalog čiji email nije na `@metricop.com`.
- **Gmail OAuth:** Google Cloud projekat sa ekranom za saglasnost tipa *Internal* (samo za naš Workspace, bez Google verifikacije). Opsezi: `gmail.send`, `gmail.readonly`, `gmail.labels`. Ne tražiti šire opsege.
- **Tokeni:** refresh tokeni se čuvaju šifrovano (Supabase Vault ili pgcrypto), čita ih samo Edge Function preko service role ključa.
- **RLS:** uključen na svim tabelama. Frontend radi samo sa anon ključem i korisničkom sesijom.
- **Tajne:** Claude API ključ, Google client secret i service role ključ samo u Supabase secrets i Vercel env varijablama, nikad u repozitorijumu (`.env.example` bez vrednosti).
- **Brisanje podataka:** dugme za trajno brisanje kontakta i svih njegovih događaja (zahtev za brisanje po GDPR-u).

## Faze izrade i kriterijumi završetka

Raditi fazu po fazu; posle svake faze stati, pokazati šta radi i čekati potvrdu pre sledeće.

| Faza | Šta se pravi | Gotovo kada |
| --- | --- | --- |
| 1. Osnova | Next.js projekat, Supabase šema i migracije, RLS, prijava za metricop.com | Prijava radi; tuđi domen je odbijen; sve tabele postoje |
| 2. Kontakti i import | Ekran Kontakti, Import (CSV/XLSX), Grupe | Uvoz 100 test kontakata sa izveštajem o preskočenim redovima |
| 3. Šabloni | Sekvence, koraci, pregled mejla, test slanje | Test mejl stiže na test adresu sa ispravnim poljima i potpisom |
| 4. Gmail i slanje | OAuth mailboxa, `run-cycle`, `pg_cron`, limiti, test mod | U test modu ceo krug: korak 1, pa follow-up u istoj niti |
| 5. Odgovori | Provera niti, bounce, auto-odgovori, ekran Odgovori | Odgovor sa drugog naloga zaustavlja sekvencu u roku od 15 min |
| 6. Pregled i Claude | Kartice, grafikon, personalizacija preko Claude API-ja | Brojke na Pregledu se slažu sa tabelom događaja |
| 7. Migracija | Uvoz iz postojećeg Google Sheeta; povezivanje mailboxa za Švedsku | Srbija i Švedska rade paralelno, Apollo može da se ugasi |

Pre svake faze napisati testove za logiku koja odlučuje o slanju (limiti, radno vreme, izbor sledećeg koraka, prepoznavanje odgovora i bounce-a). Ta logika mora biti u čistim funkcijama koje se mogu testirati bez Gmaila.
