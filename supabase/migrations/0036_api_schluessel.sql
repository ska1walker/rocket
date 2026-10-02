-- ========================================================================
-- 0036_api_schluessel.sql
-- Schlüssel für Programme von außen (Skript, Make, n8n, Claude), die
-- Rocket ohne Browser aufrufen. Erster Bereich: die Eigenschaften.
--
-- **Ein Schlüssel handelt im Namen der Person, die ihn erzeugt hat**, mit
-- ihrer jeweils aktuellen Rolle. Verliert sie die Verwalterrolle oder die
-- Mitgliedschaft, verliert der Schlüssel mit. Eine eigene Rolle für
-- Schlüssel gäbe es zweimal zu pflegen und einmal zu vergessen.
--
-- **Gespeichert wird nur der SHA-256 des Schlüssels.** Er hat 256 Bit
-- Zufall; ein langsamer Hash brächte nichts. `praefix` sind die ersten
-- Zeichen, damit man in der Liste erkennt, welcher Schlüssel welcher ist.
--
-- **`bereiche`** begrenzt, wohin der Schlüssel darf (`app/api_schluessel.py`,
-- BEREICHE). Ein Schlüssel ohne Bereich darf nirgends hin.
--
-- Zeilensicherheit wie bei den Sitzungen (0026): Im Alltag sieht man die
-- Schlüssel der eigenen Organisation. Beim Prüfen eines Aufrufs gibt es
-- noch keinen Nutzerkontext — dann nennt die Verbindung den Hash
-- (`app.anmelde_token`) und bekommt genau diese eine Zeile frei.
-- ========================================================================

create table if not exists public.api_schluessel (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  name            text not null check (length(name) between 1 and 80),
  praefix         text not null,
  token_hash      text not null unique,
  bereiche        text[] not null default '{}',
  erstellt_am     timestamptz not null default now(),
  zuletzt_benutzt timestamptz,
  laeuft_ab       timestamptz,
  widerrufen_am   timestamptz
);
create index if not exists api_schluessel_org_idx on public.api_schluessel (org_id, erstellt_am desc);

alter table public.api_schluessel enable row level security;
alter table public.api_schluessel force row level security;

drop policy if exists api_schluessel_org on public.api_schluessel;
create policy api_schluessel_org on public.api_schluessel
  for all using (org_id in (select public.current_user_orgs()))
  with check (org_id in (select public.current_user_orgs()));

drop policy if exists api_schluessel_token on public.api_schluessel;
create policy api_schluessel_token on public.api_schluessel
  for all
  using (token_hash = nullif(current_setting('app.anmelde_token', true), ''))
  with check (token_hash = nullif(current_setting('app.anmelde_token', true), ''));
