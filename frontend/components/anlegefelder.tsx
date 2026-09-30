"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, suchparameter } from "@/lib/api";
import { ausEingabe, type Auswahl, istLeer, patchFuer } from "@/lib/feldwerte";
import type { Anordnung, Mitglied, PropertyEntity } from "@/lib/typen";
import { Eingabe } from "@/components/feldgruppen";

/**
 * Die Felder, die unter *Einstellungen › Eigenschaften* „im Anlegen
 * zeigen" tragen — zusätzlich zu dem, was ein Dialog ohnehin fragt.
 *
 * Wie HubSpots „Show in create form": Wer „Kammer" bei jeder neuen Firma
 * braucht, soll nicht erst anlegen und dann die Seite öffnen. Leere Felder
 * gehen nicht mit — Anlegen ist kein Löschen.
 *
 * `vorhanden` nennt die Schlüssel, für die der Dialog selbst ein Feld hat;
 * die erscheinen hier nicht ein zweites Mal.
 */
export function useAnlegefelder(entity: PropertyEntity, vorhanden: string[]) {
  const [entwurf, setEntwurf] = useState<Record<string, string | string[]>>({});
  const anordnung = useQuery({
    queryKey: ["anordnung", entity],
    queryFn: () => api.get<Anordnung>(`/api/eigenschaften/anordnung${suchparameter({ entity })}`),
    staleTime: 60_000,
  });
  const felder = (anordnung.data?.gruppen ?? [])
    .flatMap((g) => g.felder)
    .filter((f) => f.im_anlegen && f.bearbeitbar && !vorhanden.includes(f.key));
  const brauchtPersonen = felder.some((f) => f.art === "user");
  const mitglieder = useQuery({
    queryKey: ["mitglieder"],
    queryFn: () => api.get<Mitglied[]>("/api/mitglieder"),
    enabled: brauchtPersonen,
    staleTime: 60_000,
  });
  const personen: Auswahl[] = (mitglieder.data ?? []).map((m) => ({ wert: m.id, text: m.display_name ?? m.olares_username }));

  const element =
    felder.length === 0 ? null : (
      <div className="anlege-zusatz">
        {felder.map((f) => (
          <div className="feld" key={f.id}>
            <label htmlFor={`anl-${entity}-${f.key}`}>{f.label}</label>
            <Eingabe
              feld={f}
              id={`anl-${entity}-${f.key}`}
              roh={entwurf[f.key] ?? (f.art === "multiselect" ? [] : "")}
              setRoh={(w) => setEntwurf((a) => ({ ...a, [f.key]: w }))}
              optionen={f.art === "user" ? personen : undefined}
            />
            {f.description && <p className="feld-hinweis">{f.description}</p>}
          </div>
        ))}
      </div>
    );

  /** Was mit dem Anlegen mitgeht. Wirft `Eingabefehler` bei Unsinn. */
  function nutzlast(): Record<string, unknown> {
    const werte = felder
      .filter((f) => f.key in entwurf)
      .map((f) => ({ feld: f, wert: ausEingabe(f, entwurf[f.key]) }))
      .filter((w) => !istLeer(w.wert));
    return patchFuer(werte);
  }

  return { element, nutzlast };
}
