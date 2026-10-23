-- Procena uklapanja tendera u našu ponudu (Nikola, 23.10.2026): nedeljni mejl ih grupiše po šansi.
alter table outreach.tenders add column fit smallint, add column fit_note text;
