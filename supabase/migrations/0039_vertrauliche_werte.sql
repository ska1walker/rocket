-- ========================================================================
-- 0039_vertrauliche_werte.sql
-- Vertrauliche Feldgruppen (Stufe 3, Schritt 4, 26.10.18).
--
-- Manche eigenen Eigenschaften soll nicht jede Person sehen, die den
-- Datensatz sieht: im Verein Bankverbindung, Beitrag, Mitgliedsnummer; im
-- Vertrieb etwa Konditionen. Eine Eigenschaftsgruppe kann deshalb
-- **vertraulich** sein. Die Werte ihrer Felder liegen dann nicht in
-- `custom`, sondern hier — damit der Schutz in der Datenbank sitzt und
-- nicht in der Ausgabe. Was hier nicht steht, kann keine Liste, kein
-- Filter, keine Suche, kein Export und keine AI verraten.
--
-- Sehen darf, wer Eigentümerin oder Verwalter ist, oder wem der Schalter
-- `vertraulich_sehen` gesetzt wurde (im Verein: Kassierer) — und zwar nur
-- an Datensätzen, die die Person ohnehin sieht.
--
-- Vorgabe: keine Gruppe ist vertraulich, niemand außer der Verwaltung hat
-- den Schalter. Eine Installation, die nichts davon nutzt, merkt nichts.
-- ========================================================================

alter table public.property_groups
  add column if not exists vertraulich boolean not null default false;

alter table public.user_org_roles
  add column if not exists vertraulich_sehen boolean not null default false;

create table if not exists public.vertrauliche_werte (
  org_id     uuid not null references public.orgs(id) on delete cascade,
  entity     text not null check (entity in ('companies', 'contacts', 'deals')),
  record_id  uuid not null,
  werte      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (entity, record_id)
);
create index if not exists vertrauliche_werte_org_idx on public.vertrauliche_werte (org_id);

-- Darf die handelnde Person Vertrauliches sehen? Ohne Nutzerkontext ja —
-- dort schützt die Regel nach Organisation (wie bei sicht_alles).
create or replace function public.sieht_vertrauliches()
returns boolean language sql stable as $$
  select public.current_user_id() is null or exists (
    select 1 from public.user_org_roles r
     where r.user_id = public.current_user_id()
       and r.org_id in (select public.current_user_orgs())
       and (r.role in ('owner', 'admin') or r.vertraulich_sehen)
  )
$$;

alter table public.vertrauliche_werte enable row level security;
alter table public.vertrauliche_werte force row level security;

create policy vertrauliche_werte_org on public.vertrauliche_werte
  for all using (org_id in (select public.current_user_orgs()))
  with check (org_id in (select public.current_user_orgs()));

-- Lesen: Schalter und sichtbarer Datensatz. Ob der Datensatz sichtbar ist,
-- entscheiden die Regeln der Tabelle selbst (0037) — die Unterabfragen
-- laufen unter derselben Zeilensicherheit. Firmennamen sieht jede Person;
-- vertrauliche Firmenfelder nur mit Zugriff auf die Firma.
create policy vertrauliche_werte_lesen on public.vertrauliche_werte as restrictive
  for select using (
    (select public.sieht_vertrauliches())
    and case entity
      when 'contacts'  then exists (select 1 from public.contacts c where c.id = record_id)
      when 'companies' then (select public.sicht_alles())
                            or record_id = any ((select public.zugriff_firmen('lesen'))::uuid[])
      when 'deals'     then exists (select 1 from public.deals d where d.id = record_id)
      else false
    end
  );

-- Schreiben: Schalter und Recht, den Datensatz zu bearbeiten.
create policy vertrauliche_werte_schreiben on public.vertrauliche_werte as restrictive
  for all using (
    (select public.sieht_vertrauliches())
    and ((select public.sicht_alles())
         or (entity = 'contacts' and record_id = any ((select public.sichtbare_kontakte('bearbeiten'))::uuid[]))
         or (entity = 'companies' and record_id = any ((select public.zugriff_firmen('bearbeiten'))::uuid[]))
         or (entity = 'deals' and exists (select 1 from public.deals d where d.id = record_id)))
  )
  with check (
    (select public.sieht_vertrauliches())
    and ((select public.sicht_alles())
         or (entity = 'contacts' and record_id = any ((select public.sichtbare_kontakte('bearbeiten'))::uuid[]))
         or (entity = 'companies' and record_id = any ((select public.zugriff_firmen('bearbeiten'))::uuid[]))
         or (entity = 'deals' and exists (select 1 from public.deals d where d.id = record_id)))
  );
