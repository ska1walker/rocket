-- ========================================================================
-- 0037_sicht_und_zugriff.sql
-- Sicht nach Zuordnung (PLAN-TEAM Stufe 3, Plan vom 2.10.2026).
--
-- Bis hierher sah jede Person einer Organisation alles. Jetzt kann eine
-- Person **eingeschränkt** sein: Sie sieht dann nur die Kontakte der
-- Firmen, auf die sie Zugriff hat, und was an diesen Kontakten hängt.
-- Im Vertrieb ist das „der Außendienst Nord sieht das Gebiet Nord“, im
-- Verein „der Trainer sieht seine Mannschaft“.
--
-- **Vorgabe: alles.** Jede vorhandene Mitgliedschaft bekommt `sicht =
-- 'alles'`; für sie greift keine der neuen Regeln. Eine Installation, die
-- nichts davon nutzt, merkt nichts.
--
-- Die Bausteine:
--   bereiche              Gruppen von Firmen (Gebiet, im Verein „Jugend“)
--   companies.bereich_id  in welcher Gruppe eine Firma steht
--   zugriffe              Person → Firma oder Bereich, lesen/bearbeiten
--   user_org_roles.sicht  'alles' | 'eingeschraenkt'
--   kontakt_beziehungen   Kontakt ↔ Kontakt (im Verein: Eltern am Kind)
--   kontakt_mannschaften  abgeleitet: jede Firma eines Kontakts (Haupt-
--                         und weitere), per Trigger gepflegt
--
-- **Warum die abgeleitete Tabelle:** Eine Regel auf `contacts`, die selbst
-- `contacts` liest, endet in Postgres in „infinite recursion detected in
-- policy“. Die Eltern-Regel braucht aber die Firma des Kindes. Darum liegt
-- die Zuordnung Kontakt → Firma noch einmal in einer eigenen Tabelle, die
-- keine Regel auf `contacts` braucht.
--
-- **Die Regeln sind zusätzlich (RESTRICTIVE).** Die bestehenden Regeln
-- nach Organisation bleiben, wie sie sind; die neuen kommen per UND dazu.
-- Eine Zeile muss beide erfüllen.
--
-- Die Hilfsfunktionen stehen in den Regeln immer als `(select f())` —
-- so rechnet Postgres sie einmal je Anweisung, nicht einmal je Zeile.
-- ========================================================================

-- ── Tabellen ─────────────────────────────────────────────────────────────

create table if not exists public.bereiche (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  name       text not null check (length(name) between 1 and 80),
  position   int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists bereiche_org_name_uniq on public.bereiche (org_id, lower(name));
create trigger bereiche_touch before update on public.bereiche
  for each row execute function public.touch_updated_at();

alter table public.companies
  add column if not exists bereich_id uuid references public.bereiche(id) on delete set null;
create index if not exists companies_bereich_idx on public.companies (bereich_id) where bereich_id is not null;

alter table public.user_org_roles
  add column if not exists sicht text not null default 'alles'
    check (sicht in ('alles', 'eingeschraenkt'));

create table if not exists public.zugriffe (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  bereich_id uuid references public.bereiche(id) on delete cascade,
  stufe      text not null default 'bearbeiten' check (stufe in ('lesen', 'bearbeiten')),
  created_at timestamptz not null default now(),
  check (num_nonnulls(company_id, bereich_id) = 1)
);
create unique index if not exists zugriffe_firma_uniq on public.zugriffe (user_id, company_id) where company_id is not null;
create unique index if not exists zugriffe_bereich_uniq on public.zugriffe (user_id, bereich_id) where bereich_id is not null;
create index if not exists zugriffe_user_idx on public.zugriffe (user_id);

create table if not exists public.kontakt_beziehungen (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  -- Von wem aus gedacht: Im Verein ist `kontakt_id` das Kind und
  -- `bezug_id` der Elternteil (art 'erziehungsberechtigt').
  kontakt_id uuid not null references public.contacts(id) on delete cascade,
  bezug_id   uuid not null references public.contacts(id) on delete cascade,
  art        text not null default 'erziehungsberechtigt' check (length(art) between 1 and 60),
  created_at timestamptz not null default now(),
  check (kontakt_id <> bezug_id)
);
create unique index if not exists kontakt_beziehungen_uniq on public.kontakt_beziehungen (kontakt_id, bezug_id, art);
create index if not exists kontakt_beziehungen_bezug_idx on public.kontakt_beziehungen (bezug_id);

create table if not exists public.kontakt_mannschaften (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  org_id     uuid not null references public.orgs(id) on delete cascade,
  primary key (contact_id, company_id)
);
create index if not exists kontakt_mannschaften_firma_idx on public.kontakt_mannschaften (company_id);

-- Füllen, bevor die Zeilensicherheit greift: Ohne Nutzerkontext sähe die
-- Migration unter FORCE weder Kontakte noch Zuordnungen (wie in 0030).
alter table public.contacts no force row level security;
alter table public.contact_companies no force row level security;
insert into public.kontakt_mannschaften (contact_id, company_id, org_id)
  select id, company_id, org_id from public.contacts where company_id is not null
  union
  select contact_id, company_id, org_id from public.contact_companies
on conflict do nothing;
alter table public.contacts force row level security;
alter table public.contact_companies force row level security;

-- ── Abgeleitete Zuordnung pflegen ────────────────────────────────────────

-- Rechnet die Firmen eines Kontakts neu: Hauptfirma plus weitere. Läuft im
-- Kontext der Person, die gerade ändert (kein security definer).
create or replace function public.kontakt_mannschaften_neu(p_contact uuid)
returns void language plpgsql as $$
begin
  delete from public.kontakt_mannschaften km
   where km.contact_id = p_contact
     and km.company_id not in (
       select c.company_id from public.contacts c where c.id = p_contact and c.company_id is not null
       union
       select cc.company_id from public.contact_companies cc where cc.contact_id = p_contact
     );
  insert into public.kontakt_mannschaften (contact_id, company_id, org_id)
    select c.id, c.company_id, c.org_id from public.contacts c
     where c.id = p_contact and c.company_id is not null
    union
    select cc.contact_id, cc.company_id, cc.org_id from public.contact_companies cc
     where cc.contact_id = p_contact
  on conflict do nothing;
end $$;

create or replace function public.kontakt_mannschaften_trigger()
returns trigger language plpgsql as $$
begin
  if tg_table_name = 'contacts' then
    perform public.kontakt_mannschaften_neu(new.id);
  elsif tg_op = 'DELETE' then
    perform public.kontakt_mannschaften_neu(old.contact_id);
  else
    perform public.kontakt_mannschaften_neu(new.contact_id);
    if tg_op = 'UPDATE' and old.contact_id <> new.contact_id then
      perform public.kontakt_mannschaften_neu(old.contact_id);
    end if;
  end if;
  return null;
end $$;

drop trigger if exists contacts_mannschaften on public.contacts;
create trigger contacts_mannschaften
  after insert or update of company_id on public.contacts
  for each row execute function public.kontakt_mannschaften_trigger();

drop trigger if exists contact_companies_mannschaften on public.contact_companies;
create trigger contact_companies_mannschaften
  after insert or update or delete on public.contact_companies
  for each row execute function public.kontakt_mannschaften_trigger();

-- ── Hilfsfunktionen für die Regeln ───────────────────────────────────────

-- Sieht die handelnde Person alles? Ohne Nutzerkontext (Anmeldung,
-- Wartung, öffentliche Links) ja — dort schützen die Regeln nach
-- Organisation und Kennung. Ist die Person in irgendeiner Organisation
-- eingeschränkt, gilt sie überall als eingeschränkt: lieber zu wenig
-- zeigen als zu viel.
create or replace function public.sicht_alles()
returns boolean language sql stable as $$
  select not exists (
    select 1 from public.user_org_roles r
     where r.user_id = public.current_user_id() and r.sicht = 'eingeschraenkt'
  )
$$;

-- Firmen, auf die die Person Zugriff hat — direkt oder über einen Bereich.
-- 'bearbeiten' schließt 'lesen' ein.
create or replace function public.zugriff_firmen(p_stufe text)
returns uuid[] language sql stable as $$
  select coalesce(array_agg(distinct f.id), '{}')
    from (
      select z.company_id as id
        from public.zugriffe z
       where z.user_id = public.current_user_id() and z.company_id is not null
         and (p_stufe = 'lesen' or z.stufe = 'bearbeiten')
      union
      select c.id
        from public.zugriffe z
        join public.companies c on c.bereich_id = z.bereich_id
       where z.user_id = public.current_user_id() and z.bereich_id is not null
         and (p_stufe = 'lesen' or z.stufe = 'bearbeiten')
    ) f
$$;

-- Kontakte, die die Person über ihre Firmen sieht: alle, die einer dieser
-- Firmen angehören (Haupt- oder weitere), und deren Bezugspersonen (im
-- Verein: die Eltern der Kinder).
create or replace function public.sichtbare_kontakte(p_stufe text)
returns uuid[] language sql stable as $$
  with firmen as (select unnest(public.zugriff_firmen(p_stufe)) as id),
       eigene as (
         select km.contact_id from public.kontakt_mannschaften km
          where km.company_id in (select id from firmen)
       )
  select coalesce(array_agg(distinct x), '{}')
    from (
      select contact_id as x from eigene
      union
      select b.bezug_id from public.kontakt_beziehungen b
       where b.kontakt_id in (select contact_id from eigene)
    ) s
$$;

-- ── Was eine Regel nicht sehen kann ──────────────────────────────────────

-- Eine Regel sieht nur die neue Zeile, nicht die alte. Ob sich die
-- Hauptfirma eines Kontakts *geändert* hat, weiß sie deshalb nicht — und die
-- abgeleitete Zuordnung zieht erst nach dem Schreiben nach. Ohne diese
-- Prüfung könnte ein Trainer einen Spieler in eine fremde Mannschaft
-- schieben: Beim Prüfen stand er ja noch in seiner. Mannschaftswechsel,
-- Bereichswechsel und Löschen bleiben der Leitung.
create or replace function public.sicht_aenderung_pruefen()
returns trigger language plpgsql as $$
begin
  if (select public.sicht_alles()) then
    return new;
  end if;
  -- Verschachtelt, nicht mit `and`: PL/pgSQL rechnet beide Seiten, und
  -- `new.bereich_id` gibt es an einem Kontakt nicht.
  if tg_table_name = 'contacts' then
    if new.company_id is distinct from old.company_id then
      raise exception 'Mannschaftswechsel nur mit voller Sicht' using errcode = 'insufficient_privilege';
    end if;
  elsif tg_table_name = 'companies' then
    if new.bereich_id is distinct from old.bereich_id then
      raise exception 'Bereichswechsel nur mit voller Sicht' using errcode = 'insufficient_privilege';
    end if;
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    raise exception 'Löschen nur mit voller Sicht' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists contacts_sicht_pruefen on public.contacts;
create trigger contacts_sicht_pruefen before update on public.contacts
  for each row execute function public.sicht_aenderung_pruefen();
drop trigger if exists companies_sicht_pruefen on public.companies;
create trigger companies_sicht_pruefen before update on public.companies
  for each row execute function public.sicht_aenderung_pruefen();
drop trigger if exists deals_sicht_pruefen on public.deals;
create trigger deals_sicht_pruefen before update on public.deals
  for each row execute function public.sicht_aenderung_pruefen();

-- ── Regeln ───────────────────────────────────────────────────────────────

alter table public.bereiche enable row level security;
alter table public.bereiche force row level security;
create policy bereiche_org on public.bereiche
  for all using (org_id in (select public.current_user_orgs()))
  with check (org_id in (select public.current_user_orgs()));
create policy bereiche_schreiben on public.bereiche as restrictive
  for insert with check ((select public.sicht_alles()));
create policy bereiche_aendern on public.bereiche as restrictive
  for update using ((select public.sicht_alles()));
create policy bereiche_loeschen on public.bereiche as restrictive
  for delete using ((select public.sicht_alles()));

alter table public.zugriffe enable row level security;
alter table public.zugriffe force row level security;
create policy zugriffe_org on public.zugriffe
  for all using (org_id in (select public.current_user_orgs()))
  with check (org_id in (select public.current_user_orgs()));
-- Die eigenen Zugriffe sieht jede Person (die Regeln brauchen sie), alle
-- nur, wer alles sieht. Ändern nur, wer alles sieht.
create policy zugriffe_lesen on public.zugriffe as restrictive
  for select using ((select public.sicht_alles()) or user_id = public.current_user_id());
create policy zugriffe_schreiben on public.zugriffe as restrictive
  for insert with check ((select public.sicht_alles()));
create policy zugriffe_aendern on public.zugriffe as restrictive
  for update using ((select public.sicht_alles()));
create policy zugriffe_loeschen on public.zugriffe as restrictive
  for delete using ((select public.sicht_alles()));

alter table public.kontakt_mannschaften enable row level security;
alter table public.kontakt_mannschaften force row level security;
create policy kontakt_mannschaften_org on public.kontakt_mannschaften
  for all using (org_id in (select public.current_user_orgs()))
  with check (org_id in (select public.current_user_orgs()));
create policy kontakt_mannschaften_lesen on public.kontakt_mannschaften as restrictive
  for select using ((select public.sicht_alles())
                    or company_id = any ((select public.zugriff_firmen('lesen'))::uuid[]));
create policy kontakt_mannschaften_schreiben on public.kontakt_mannschaften as restrictive
  for insert with check ((select public.sicht_alles())
                         or company_id = any ((select public.zugriff_firmen('bearbeiten'))::uuid[]));
create policy kontakt_mannschaften_loeschen on public.kontakt_mannschaften as restrictive
  for delete using ((select public.sicht_alles())
                    or company_id = any ((select public.zugriff_firmen('bearbeiten'))::uuid[]));

alter table public.kontakt_beziehungen enable row level security;
alter table public.kontakt_beziehungen force row level security;
create policy kontakt_beziehungen_org on public.kontakt_beziehungen
  for all using (org_id in (select public.current_user_orgs()))
  with check (org_id in (select public.current_user_orgs()));
-- Über die abgeleitete Tabelle, nicht über `contacts` — sonst liefe
-- `sichtbare_kontakte` im Kreis.
create policy kontakt_beziehungen_lesen on public.kontakt_beziehungen as restrictive
  for select using ((select public.sicht_alles())
                    or kontakt_id in (select km.contact_id from public.kontakt_mannschaften km));
create policy kontakt_beziehungen_schreiben on public.kontakt_beziehungen as restrictive
  for insert with check ((select public.sicht_alles())
                         or kontakt_id in (select km.contact_id from public.kontakt_mannschaften km
                                            where km.company_id = any ((select public.zugriff_firmen('bearbeiten'))::uuid[])));
create policy kontakt_beziehungen_loeschen on public.kontakt_beziehungen as restrictive
  for delete using ((select public.sicht_alles())
                    or kontakt_id in (select km.contact_id from public.kontakt_mannschaften km
                                       where km.company_id = any ((select public.zugriff_firmen('bearbeiten'))::uuid[])));

-- Firmen: den Namen sieht jede Person der Organisation (im Verein: „welche
-- Mannschaften gibt es, wer trainiert sie“). Ändern nur mit Zugriff
-- 'bearbeiten', anlegen und löschen nur, wer alles sieht.
create policy companies_sicht_anlegen on public.companies as restrictive
  for insert with check ((select public.sicht_alles()));
-- Gelöscht wird in Rocket weich (`deleted_at`) — also über UPDATE. Wer
-- nicht alles sieht, darf deshalb keine Zeile mit gesetztem `deleted_at`
-- hinterlassen: Löschen bleibt der Leitung.
create policy companies_sicht_aendern on public.companies as restrictive
  for update using ((select public.sicht_alles())
                    or id = any ((select public.zugriff_firmen('bearbeiten'))::uuid[]))
  with check ((select public.sicht_alles())
              or (deleted_at is null and id = any ((select public.zugriff_firmen('bearbeiten'))::uuid[])));
create policy companies_sicht_loeschen on public.companies as restrictive
  for delete using ((select public.sicht_alles()));

-- Kontakte: sichtbar über die eigene Hauptfirma (direkt an der Zeile, damit
-- ein gerade angelegter Kontakt mit `returning` gelesen werden kann) oder
-- über die abgeleitete Zuordnung und die Bezugspersonen.
create policy contacts_sicht_lesen on public.contacts as restrictive
  for select using ((select public.sicht_alles())
                    or company_id = any ((select public.zugriff_firmen('lesen'))::uuid[])
                    or id = any ((select public.sichtbare_kontakte('lesen'))::uuid[]));
-- Anlegen: in einer Firma mit 'bearbeiten' — oder ohne Firma, damit sich
-- ein Elternteil anlegen lässt, das gleich darauf ans Kind gehängt wird
-- (`returning` gibt es dafür nicht; der Weg dafür liest danach neu).
create policy contacts_sicht_anlegen on public.contacts as restrictive
  for insert with check ((select public.sicht_alles())
                         or company_id is null
                         or company_id = any ((select public.zugriff_firmen('bearbeiten'))::uuid[]));
create policy contacts_sicht_aendern on public.contacts as restrictive
  for update using ((select public.sicht_alles())
                    or company_id = any ((select public.zugriff_firmen('bearbeiten'))::uuid[])
                    or id = any ((select public.sichtbare_kontakte('bearbeiten'))::uuid[]))
  with check ((select public.sicht_alles())
              or (deleted_at is null
                  and (company_id = any ((select public.zugriff_firmen('bearbeiten'))::uuid[])
                       or id = any ((select public.sichtbare_kontakte('bearbeiten'))::uuid[]))));
create policy contacts_sicht_loeschen on public.contacts as restrictive
  for delete using ((select public.sicht_alles()));

-- Weitere Firmen eines Kontakts: sehen, wenn die Firma im Zugriff liegt
-- oder der Kontakt sichtbar ist (dann auch die Namen der anderen
-- Mannschaften). Ändern nur, wer alles sieht — Mannschaftswechsel macht
-- die Leitung.
create policy contact_companies_sicht_lesen on public.contact_companies as restrictive
  for select using ((select public.sicht_alles())
                    or company_id = any ((select public.zugriff_firmen('lesen'))::uuid[])
                    or contact_id = any ((select public.sichtbare_kontakte('lesen'))::uuid[]));
create policy contact_companies_sicht_anlegen on public.contact_companies as restrictive
  for insert with check ((select public.sicht_alles()));
create policy contact_companies_sicht_aendern on public.contact_companies as restrictive
  for update using ((select public.sicht_alles()));
create policy contact_companies_sicht_loeschen on public.contact_companies as restrictive
  for delete using ((select public.sicht_alles()));

-- Leads: über die Firma oder wenn sie der Person gehören.
create policy deals_sicht_lesen on public.deals as restrictive
  for select using ((select public.sicht_alles())
                    or company_id = any ((select public.zugriff_firmen('lesen'))::uuid[])
                    or owner_id = public.current_user_id());
create policy deals_sicht_schreiben on public.deals as restrictive
  for insert with check ((select public.sicht_alles())
                         or company_id = any ((select public.zugriff_firmen('bearbeiten'))::uuid[]));
create policy deals_sicht_aendern on public.deals as restrictive
  for update using ((select public.sicht_alles())
                    or company_id = any ((select public.zugriff_firmen('bearbeiten'))::uuid[])
                    or owner_id = public.current_user_id())
  with check ((select public.sicht_alles())
              or (deleted_at is null
                  and (company_id = any ((select public.zugriff_firmen('bearbeiten'))::uuid[])
                       or owner_id = public.current_user_id())));
create policy deals_sicht_loeschen on public.deals as restrictive
  for delete using ((select public.sicht_alles()));

create policy deal_contacts_sicht on public.deal_contacts as restrictive
  for all using ((select public.sicht_alles())
                 or contact_id = any ((select public.sichtbare_kontakte('lesen'))::uuid[]))
  with check ((select public.sicht_alles())
              or contact_id = any ((select public.sichtbare_kontakte('bearbeiten'))::uuid[]));

create policy quotes_sicht on public.quotes as restrictive
  for all using ((select public.sicht_alles()) or deal_id in (select d.id from public.deals d))
  with check ((select public.sicht_alles()) or deal_id in (select d.id from public.deals d));
create policy quote_items_sicht on public.quote_items as restrictive
  for all using ((select public.sicht_alles()) or quote_id in (select q.id from public.quotes q))
  with check ((select public.sicht_alles()) or quote_id in (select q.id from public.quotes q));

-- Tickets: über Kontakt, Firma oder Lead — oder wenn sie der Person
-- zugewiesen sind bzw. von ihr stammen.
create policy tickets_sicht_lesen on public.tickets as restrictive
  for select using ((select public.sicht_alles())
                    or contact_id = any ((select public.sichtbare_kontakte('lesen'))::uuid[])
                    or company_id = any ((select public.zugriff_firmen('lesen'))::uuid[])
                    or deal_id in (select d.id from public.deals d)
                    or owner_id = public.current_user_id()
                    or created_by = public.current_user_id());
create policy tickets_sicht_schreiben on public.tickets as restrictive
  for insert with check ((select public.sicht_alles())
                         or contact_id = any ((select public.sichtbare_kontakte('bearbeiten'))::uuid[])
                         or company_id = any ((select public.zugriff_firmen('bearbeiten'))::uuid[]));
create policy tickets_sicht_aendern on public.tickets as restrictive
  for update using ((select public.sicht_alles())
                    or contact_id = any ((select public.sichtbare_kontakte('bearbeiten'))::uuid[])
                    or company_id = any ((select public.zugriff_firmen('bearbeiten'))::uuid[])
                    or owner_id = public.current_user_id());
create policy tickets_sicht_loeschen on public.tickets as restrictive
  for delete using ((select public.sicht_alles()));

-- Was an Kontakt, Firma, Lead oder Ticket hängt: sichtbar, wenn eines
-- davon sichtbar ist. Bei der Firma zählt der Zugriff, nicht der Name.
create policy activities_sicht_lesen on public.activities as restrictive
  for select using ((select public.sicht_alles())
                    or contact_id = any ((select public.sichtbare_kontakte('lesen'))::uuid[])
                    or company_id = any ((select public.zugriff_firmen('lesen'))::uuid[])
                    or deal_id in (select d.id from public.deals d)
                    or ticket_id in (select t.id from public.tickets t));
create policy activities_sicht_schreiben on public.activities as restrictive
  for insert with check ((select public.sicht_alles())
                         or contact_id = any ((select public.sichtbare_kontakte('bearbeiten'))::uuid[])
                         or company_id = any ((select public.zugriff_firmen('bearbeiten'))::uuid[])
                         or deal_id in (select d.id from public.deals d)
                         or ticket_id in (select t.id from public.tickets t));
create policy activities_sicht_aendern on public.activities as restrictive
  for update using ((select public.sicht_alles()) or created_by = public.current_user_id());
create policy activities_sicht_loeschen on public.activities as restrictive
  for delete using ((select public.sicht_alles()) or created_by = public.current_user_id());

create policy tasks_sicht_lesen on public.tasks as restrictive
  for select using ((select public.sicht_alles())
                    or assigned_to = public.current_user_id()
                    or created_by = public.current_user_id()
                    or contact_id = any ((select public.sichtbare_kontakte('lesen'))::uuid[])
                    or company_id = any ((select public.zugriff_firmen('lesen'))::uuid[])
                    or deal_id in (select d.id from public.deals d)
                    or ticket_id in (select t.id from public.tickets t));
create policy tasks_sicht_schreiben on public.tasks as restrictive
  for insert with check ((select public.sicht_alles())
                         or (contact_id is null and company_id is null and deal_id is null and ticket_id is null)
                         or contact_id = any ((select public.sichtbare_kontakte('bearbeiten'))::uuid[])
                         or company_id = any ((select public.zugriff_firmen('bearbeiten'))::uuid[])
                         or deal_id in (select d.id from public.deals d)
                         or ticket_id in (select t.id from public.tickets t));
create policy tasks_sicht_aendern on public.tasks as restrictive
  for update using ((select public.sicht_alles())
                    or assigned_to = public.current_user_id()
                    or created_by = public.current_user_id()
                    or contact_id = any ((select public.sichtbare_kontakte('bearbeiten'))::uuid[])
                    or company_id = any ((select public.zugriff_firmen('bearbeiten'))::uuid[]));
create policy tasks_sicht_loeschen on public.tasks as restrictive
  for delete using ((select public.sicht_alles()) or created_by = public.current_user_id());

create policy dokumente_sicht_lesen on public.dokumente as restrictive
  for select using ((select public.sicht_alles())
                    or contact_id = any ((select public.sichtbare_kontakte('lesen'))::uuid[])
                    or company_id = any ((select public.zugriff_firmen('lesen'))::uuid[])
                    or deal_id in (select d.id from public.deals d)
                    or ticket_id in (select t.id from public.tickets t));
create policy dokumente_sicht_schreiben on public.dokumente as restrictive
  for insert with check ((select public.sicht_alles())
                         or contact_id = any ((select public.sichtbare_kontakte('bearbeiten'))::uuid[])
                         or company_id = any ((select public.zugriff_firmen('bearbeiten'))::uuid[]));
create policy dokumente_sicht_aendern on public.dokumente as restrictive
  for update using ((select public.sicht_alles())
                    or contact_id = any ((select public.sichtbare_kontakte('bearbeiten'))::uuid[])
                    or company_id = any ((select public.zugriff_firmen('bearbeiten'))::uuid[]));
create policy dokumente_sicht_loeschen on public.dokumente as restrictive
  for delete using ((select public.sicht_alles())
                    or contact_id = any ((select public.sichtbare_kontakte('bearbeiten'))::uuid[])
                    or company_id = any ((select public.zugriff_firmen('bearbeiten'))::uuid[]));

create policy mails_sicht_lesen on public.mails as restrictive
  for select using ((select public.sicht_alles())
                    or contact_id = any ((select public.sichtbare_kontakte('lesen'))::uuid[])
                    or ticket_id in (select t.id from public.tickets t)
                    or created_by = public.current_user_id());
create policy mails_sicht_schreiben on public.mails as restrictive
  for insert with check ((select public.sicht_alles())
                         or contact_id = any ((select public.sichtbare_kontakte('lesen'))::uuid[])
                         or ticket_id in (select t.id from public.tickets t));

create policy listen_mitglieder_sicht on public.listen_mitglieder as restrictive
  for all using ((select public.sicht_alles())
                 or contact_id = any ((select public.sichtbare_kontakte('lesen'))::uuid[]))
  with check ((select public.sicht_alles())
              or contact_id = any ((select public.sichtbare_kontakte('lesen'))::uuid[]));

create policy oeffentliche_links_sicht on public.oeffentliche_links as restrictive
  for all using ((select public.sicht_alles())
                 or contact_id = any ((select public.sichtbare_kontakte('lesen'))::uuid[]))
  with check ((select public.sicht_alles())
              or contact_id = any ((select public.sichtbare_kontakte('lesen'))::uuid[]));

-- Was über den ganzen Bestand gerechnet oder gesammelt ist, sieht nur,
-- wer alles sieht: Eingang, Aussagen und Themen, Podcasts, Besprechungen,
-- Anreicherungen, Einfuhren, das Protokoll. Schreiben (etwa ein
-- Protokolleintrag) bleibt jeder Person möglich.
create policy eingang_sicht on public.eingang as restrictive
  for select using ((select public.sicht_alles()));
create policy aussagen_sicht on public.aussagen as restrictive
  for select using ((select public.sicht_alles()));
create policy themenlaeufe_sicht on public.themenlaeufe as restrictive
  for select using ((select public.sicht_alles()));
create policy podcasts_sicht on public.podcasts as restrictive
  for select using ((select public.sicht_alles()));
create policy besprechungen_sicht on public.besprechungen as restrictive
  for select using ((select public.sicht_alles()));
create policy besprechung_kontakte_sicht on public.besprechung_kontakte as restrictive
  for select using ((select public.sicht_alles()));
create policy anreicherungen_sicht on public.anreicherungen as restrictive
  for select using ((select public.sicht_alles()));
create policy einfuhren_sicht on public.einfuhren as restrictive
  for select using ((select public.sicht_alles()));
create policy audit_log_sicht on public.audit_log as restrictive
  for select using ((select public.sicht_alles()));
