-- ========================================================================
-- 0033_zweiter_faktor.sql
-- Stufe 1 aus docs/PLAN-TEAM.md: zweiter Faktor, Rücksetzen per Mail.
--
-- **Der zweite Faktor ist TOTP** (RFC 6238, Authenticator-App). Das
-- Geheimnis steht seit 0026 in `users.totp_geheimnis`, verschlüsselt im
-- Tresor. Neu ist, wann er **gilt**: `totp_seit`. Ein Geheimnis ohne
-- `totp_seit` ist eine angefangene Einrichtung — erst ein bestätigter
-- Code macht daraus einen Faktor. Sonst sperrte sich aus, wer den
-- QR-Code abbricht.
--
-- `totp_letzter_schritt` ist der Zeitschritt des zuletzt angenommenen
-- Codes. Ein Code gilt dreißig Sekunden; ohne diesen Merker ließe er sich
-- in dieser Zeit ein zweites Mal verwenden, etwa von jemandem, der über
-- die Schulter geschaut hat.
--
-- **Wiederherstellungscodes** für das verlorene Handy: zehn Stück, nur
-- als SHA-256 gespeichert, jeder einmal. Die Codes haben 50 Bit und
-- laufen durch dieselbe Bremse wie das Passwort; ein langsamer Hash wie
-- argon2 brächte hier nichts.
--
-- **Rücksetzen per Mail** bekommt eine eigene Tabelle und nicht `mails`:
-- `mails` ist im Datenbank-Blick für Verwalter lesbar, und ein Code
-- darin hieße, ein Verwalter könnte das Passwort des Eigentümers
-- zurücksetzen. Hier steht nur der Hash, und die Tabelle ist dort
-- gesperrt.
--
-- **Die Vorstufe der Anmeldung** ist eine Sitzung mit `bestaetigt =
-- false`: Passwort stimmt, Code steht aus. Sie lebt fünf Minuten und
-- gilt für nichts außer der Code-Eingabe.
-- ========================================================================

alter table public.users
  add column if not exists totp_seit            timestamptz,
  add column if not exists totp_letzter_schritt bigint;

alter table public.sitzungen
  add column if not exists bestaetigt boolean not null default true;

alter table public.org_settings
  add column if not exists zweiter_faktor_pflicht boolean not null default false;

create table if not exists public.zweitfaktor_codes (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.users(id) on delete cascade,
  code_hash  text not null,
  erstellt_am timestamptz not null default now(),
  benutzt_am timestamptz
);
create index if not exists zweitfaktor_codes_user_idx on public.zweitfaktor_codes (user_id);

create table if not exists public.passwort_links (
  id          uuid primary key default uuid_generate_v4(),
  token_hash  text not null unique,
  user_id     uuid not null references public.users(id) on delete cascade,
  org_id      uuid not null references public.orgs(id) on delete cascade,
  erstellt_am timestamptz not null default now(),
  laeuft_ab   timestamptz not null,
  benutzt_am  timestamptz
);
create index if not exists passwort_links_user_idx on public.passwort_links (user_id, erstellt_am desc);

alter table public.zweitfaktor_codes enable row level security;
alter table public.zweitfaktor_codes force row level security;
alter table public.passwort_links enable row level security;
alter table public.passwort_links force row level security;

-- Die eigenen Codes — und in der Anmeldung, bevor es einen Nutzerkontext
-- gibt, die Codes der Person, deren Vorstufe gerade eingelöst wird. Dafür
-- nennt die Anmeldung der Verbindung die Person (`app.zweitfaktor_fuer`),
-- nachdem sie die Vorstufe selbst geprüft hat.
drop policy if exists zweitfaktor_codes_selbst on public.zweitfaktor_codes;
create policy zweitfaktor_codes_selbst on public.zweitfaktor_codes
  for all using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

drop policy if exists zweitfaktor_codes_anmeldung on public.zweitfaktor_codes;
create policy zweitfaktor_codes_anmeldung on public.zweitfaktor_codes
  for all
  using (user_id = nullif(current_setting('app.zweitfaktor_fuer', true), '')::uuid)
  with check (user_id = nullif(current_setting('app.zweitfaktor_fuer', true), '')::uuid);

-- Wie bei Sitzungen und Einladungen: die eigenen, oder genau die eine
-- Zeile, deren Token die Verbindung gerade nennt.
drop policy if exists passwort_links_selbst on public.passwort_links;
create policy passwort_links_selbst on public.passwort_links
  for all using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

drop policy if exists passwort_links_token on public.passwort_links;
create policy passwort_links_token on public.passwort_links
  for all
  using (token_hash = nullif(current_setting('app.anmelde_token', true), ''))
  with check (token_hash = nullif(current_setting('app.anmelde_token', true), ''));
