-- ========================================================================
-- 0040_modus.sql
-- Modus der Organisation: Vertrieb oder Verein (Stufe 3, Schritt 5, 26.10.19).
--
-- Rocket ist ein CRM und bleibt eines. Der Modus „Verein“ ändert nur, wie
-- die Oberfläche spricht und was sie anbietet: Firma heißt Mannschaft,
-- Kontakt heißt Person, Leads, Angebote und Prognose fehlen in der
-- Navigation. Er ändert keine Daten, keine Tabellen und keine Rechte —
-- die Regeln aus 0037 bis 0039 gelten in beiden Modi gleich. Wer
-- zurückschaltet, hat alles wieder, so wie es war.
-- ========================================================================

alter table public.org_settings
  add column if not exists modus text not null default 'vertrieb'
    check (modus in ('vertrieb', 'verein'));
