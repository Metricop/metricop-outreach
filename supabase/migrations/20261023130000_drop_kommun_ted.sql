-- PREDLOG, još nije primenjeno na bazu: pomoćna tabela _kommun_ted i funkcija _kommun_ted_retry bile su
-- jednokratne (pretraga TED-a za 50 kommuna, rezultat je u kommuner-tenderi.xlsx); više se ne koriste.

drop function if exists outreach._kommun_ted_retry();
drop table if exists outreach._kommun_ted;
