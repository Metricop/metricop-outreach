-- Bezbednost: pomoćna funkcija se poziva samo iz baze (postgres / zakazani poslovi), ne preko API-ja.
-- Odobrio vlasnik 23.10.2026. Treba je preneti i u repozitorijum metricop-outreach.
revoke execute on function outreach._kommun_ted_retry() from public, anon, authenticated;
