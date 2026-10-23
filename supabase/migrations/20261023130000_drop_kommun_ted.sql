-- Pomoćna tabela _kommun_ted i funkcija _kommun_ted_retry bile su jednokratne (pretraga TED-a za 50 kommuna,
-- rezultat je u kommuner-tenderi.xlsx); više se ne koriste. Brisanje odobrio Nikola 23.10.2026; na bazi još nije primenjeno.

drop function if exists outreach._kommun_ted_retry();
drop table if exists outreach._kommun_ted;
