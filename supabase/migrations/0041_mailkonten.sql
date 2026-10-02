-- ========================================================================
-- 0041_mailkonten.sql
-- Das persönliche Postfach (Stufe 2 aus docs/PLAN-TEAM.md, 26.10.20).
--
-- Jede Person verbindet ihr eigenes Postfach über IMAP und SMTP — mit
-- Voreinstellungen für die gängigen Anbieter (app/mailanbieter.py), sonst
-- frei. Rocket liest es als zweiter Klient: keine Markierung, kein
-- Verschieben, nur eine gemerkte UID je Ordner (wie das Postfach der
-- Organisation, 0017). Eingelesen wird nur, was einen Kontakt betrifft;
-- private Post landet nie in der Datenbank.
--
-- Die Zeile gehört der Person, die sie angelegt hat: Selbst Verwalter
-- sehen sie nicht. Ein Postfach ist kein Bestand der Organisation, und
-- das Passwort darin öffnet mehr als Rocket.
-- ========================================================================

create table if not exists public.mailkonten (
  id                 uuid primary key default uuid_generate_v4(),
  org_id             uuid not null references public.orgs(id) on delete cascade,
  user_id            uuid not null references public.users(id) on delete cascade,
  -- Schlüssel der Voreinstellung (`google`, `ionos` …) oder `eigen`.
  anbieter           text not null default 'eigen',
  adresse            text not null,
  absender_name      text,
  benutzer           text not null,
  -- Im Tresor verschlüsselt (app/tresor.py), nie im Klartext.
  passwort           text,
  imap_host          text not null,
  imap_port          integer not null default 993,
  smtp_host          text,
  smtp_port          integer not null default 465,
  smtp_sicherheit    text not null default 'ssl' check (smtp_sicherheit in ('ssl', 'starttls')),
  ordner_ein         text not null default 'INBOX',
  -- Leer: beim ersten Lauf über SPECIAL-USE (\Sent) gesucht.
  ordner_aus         text,
  uid_ein            bigint,
  uidv_ein           bigint,
  uid_aus            bigint,
  uidv_aus           bigint,
  aktiv              boolean not null default true,
  zuletzt            timestamptz,
  letzter_fehler     text,
  eingelesen         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (org_id, user_id)
);

alter table public.mailkonten enable row level security;
alter table public.mailkonten force row level security;

create policy mailkonten_org on public.mailkonten
  for all using (org_id in (select public.current_user_orgs()))
  with check (org_id in (select public.current_user_orgs()));

-- Nur die eigene Zeile — auch für Eigentümerin und Verwalter.
create policy mailkonten_eigen on public.mailkonten as restrictive
  for all using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());
