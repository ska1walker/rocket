-- ========================================================================
-- 0038_sicht_listen.sql
-- Sicht nach Zuordnung, Schritt 2 (26.10.16): was 0037 noch offen ließ.
--
-- Listen und Kampagnen hingen bisher nur an der Organisation. Eine
-- eingeschränkte Person sähe damit die Rundmails und Listen der Leitung —
-- Namen, Betreff, Text, Filter — und könnte eine fremde Kampagne starten.
-- Seit hier sieht sie nur, was sie selbst angelegt hat. Die Mitglieder
-- einer Liste sind ohnehin nach Sicht geschützt (0037); die Empfänger
-- einer Kampagne stehen beim Start fest, gelesen unter der Sicht dessen,
-- der startet (kampagnen.starten läuft mit acquire_as).
--
-- `auswertungen` merkt sich, welche Notizen die Erkenntnisse schon
-- gelesen haben — über den ganzen Bestand, also nur für volle Sicht.
-- ========================================================================

create policy listen_sicht on public.listen as restrictive
  for all using ((select public.sicht_alles()) or created_by = public.current_user_id())
  with check ((select public.sicht_alles()) or created_by = public.current_user_id());

create policy kampagnen_sicht on public.kampagnen as restrictive
  for all using ((select public.sicht_alles()) or created_by = public.current_user_id())
  with check ((select public.sicht_alles()) or created_by = public.current_user_id());

create policy auswertungen_sicht on public.auswertungen as restrictive
  for select using ((select public.sicht_alles()));
