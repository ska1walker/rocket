-- ========================================================================
-- 0034_eigenschaftsgruppen.sql
-- Stufe A aus docs/PLAN-EIGENSCHAFTEN.md: Gruppen für Eigenschaften,
-- und die festen Felder als Systemeigenschaften daneben.
--
-- **Gruppen** ordnen die Felder eines Objekts wie HubSpots „property
-- groups": „Firmeninformationen", „Adresse", „Vertrieb". Sie gehören der
-- Organisation — jede ordnet ihren Bestand selbst.
--
-- **Systemeigenschaften** sind Zeilen in `property_definitions` mit
-- `is_system`. Ihr Wert steht weiter in der Spalte (`companies.city`),
-- nie in `custom`. Die Zeile trägt nur, was sich an einem festen Feld
-- einrichten lässt: Gruppe, Reihenfolge, Beschriftung, Hilfetext. Typ,
-- Schlüssel und Auswahlwerte kommen aus dem Code (`app/eigenschaften.py`).
--
-- **Angelegt wird hier nichts.** Unter FORCE sähe eine Migration ohne
-- Nutzerkontext keine Organisation und schriebe lautlos keine Zeile.
-- Die Vorgaben legt `eigenschaften.vorgaben_sicherstellen` beim ersten
-- Lesen an, im Kontext der handelnden Person und wiederholbar.
--
-- `required` und `im_anlegen` stehen schon hier, damit Stufe B und C
-- keine weitere Migration auf dieselbe Tabelle brauchen. Wirkung haben sie
-- erst dort.
-- ========================================================================

create table if not exists public.property_groups (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  entity      text not null check (entity in ('companies', 'contacts', 'deals')),
  -- Fest wie bei den Eigenschaften: Die Beschriftung darf sich ändern,
  -- der Schlüssel nicht — an ihm erkennt der Code seine Vorgabegruppen.
  key         text not null,
  label       text not null,
  position    integer not null default 0,
  -- Vorgabegruppe: umbenennbar und verschiebbar, aber nicht löschbar.
  -- Sonst legte das nächste Lesen sie einfach wieder an.
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists property_groups_uniq on public.property_groups (org_id, entity, key);

drop trigger if exists property_groups_touch on public.property_groups;
create trigger property_groups_touch before update on public.property_groups
  for each row execute function public.touch_updated_at();

alter table public.property_groups enable row level security;
alter table public.property_groups force row level security;

drop policy if exists property_groups_org on public.property_groups;
create policy property_groups_org on public.property_groups
  for all using (org_id in (select public.current_user_orgs()))
  with check (org_id in (select public.current_user_orgs()));

alter table public.property_definitions
  add column if not exists group_id   uuid references public.property_groups(id) on delete set null,
  add column if not exists is_system  boolean not null default false,
  add column if not exists required   boolean not null default false,
  add column if not exists im_anlegen boolean not null default false;
