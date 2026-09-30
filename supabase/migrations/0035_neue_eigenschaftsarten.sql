-- ========================================================================
-- 0035_neue_eigenschaftsarten.sql
-- Stufe C aus docs/PLAN-EIGENSCHAFTEN.md: neue Arten eigener Eigenschaften.
--
-- Was feste Felder schon immer waren, können eigene jetzt auch sein:
-- langer Text, Adresse (URL), E-Mail, Telefon, Betrag und Person. Geprüft
-- wird wie bisher beim Schreiben (`app/eigenschaften.py`); die Datenbank
-- sieht nur JSON.
--
-- `add value` steht in einer eigenen Datei: Ein neuer Enum-Wert darf in
-- derselben Transaktion noch nicht benutzt werden.
--
-- Pflichtfelder (`required`) stehen seit 0034 bereit und brauchen hier
-- nichts.
-- ========================================================================

alter type public.property_kind add value if not exists 'textarea';
alter type public.property_kind add value if not exists 'url';
alter type public.property_kind add value if not exists 'email';
alter type public.property_kind add value if not exists 'phone';
alter type public.property_kind add value if not exists 'currency';
alter type public.property_kind add value if not exists 'user';
