"use client";

// Modul RK-MODUS — docs/MODULE.md

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { begriffe, type Modus } from "@/lib/begriffe";
import { useSicht } from "@/lib/sicht";
import type { Anordnung, OrgSettings } from "@/lib/typen";
import { Erklaerung } from "@/components/erklaerung";
import { Fehler } from "@/components/zustaende";

/**
 * Vorschläge für Eigenschaften im Verein. Angelegt wird nur, was fehlt; wer
 * „Spielerdaten“ schon hat oder umbenannt hat, bekommt nichts doppelt.
 */
export const VEREINSFELDER: {
  gruppe: string;
  vertraulich: boolean;
  felder: { label: string; kind: string; options?: string[] }[];
}[] = [
  {
    gruppe: "Spielerdaten",
    vertraulich: false,
    felder: [
      { label: "Position", kind: "select", options: ["Tor", "Abwehr", "Mittelfeld", "Sturm"] },
      { label: "Rückennummer", kind: "number" },
      { label: "Passnummer", kind: "text" },
    ],
  },
  {
    gruppe: "Beitrag und Bank",
    vertraulich: true,
    felder: [
      { label: "Mitgliedsnummer", kind: "text" },
      { label: "Beitrag", kind: "currency" },
      { label: "IBAN", kind: "text" },
      { label: "Kontoinhaber", kind: "text" },
    ],
  },
];

async function vereinsfelderAnlegen(): Promise<number> {
  const anordnung = await api.get<Anordnung>("/api/eigenschaften/anordnung?entity=contacts");
  const vorhanden = new Set([...anordnung.gruppen.flatMap((g) => g.felder), ...anordnung.archiviert].map((f) => f.label.toLowerCase()));
  let neu = 0;
  for (const v of VEREINSFELDER) {
    let gruppe = anordnung.gruppen.find((g) => g.label.toLowerCase() === v.gruppe.toLowerCase());
    if (!gruppe) {
      gruppe = await api.post<Anordnung["gruppen"][number]>("/api/eigenschaften/gruppen", { entity: "contacts", label: v.gruppe });
    }
    if (v.vertraulich && !gruppe.vertraulich) {
      await api.patch(`/api/eigenschaften/gruppen/${gruppe.id}`, { vertraulich: true });
    }
    for (const f of v.felder) {
      if (vorhanden.has(f.label.toLowerCase())) continue;
      await api.post("/api/eigenschaften", { entity: "contacts", group_id: gruppe.id, ...f });
      neu += 1;
    }
  }
  return neu;
}

/**
 * Modus der Organisation (seit 26.10.19): Vertrieb oder Verein.
 *
 * Nur Darstellung — Begriffe, Navigation, Vorlagen. Daten und Rechte bleiben,
 * wie sie sind; wer zurückschaltet, hat Leads, Angebote und Prognose wieder.
 */
export function Modusblock({ e }: { e: OrgSettings }) {
  const client = useQueryClient();
  const { verwaltet } = useSicht();
  const [modus, setModus] = useState<Modus>(e.modus ?? "vertrieb");
  const [angelegt, setAngelegt] = useState<number | null>(null);
  useEffect(() => setModus(e.modus ?? "vertrieb"), [e.modus]);

  const speichern = useMutation({
    mutationFn: () => api.put<OrgSettings>("/api/settings", { modus }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["einstellungen"] });
      client.invalidateQueries({ queryKey: ["wer"] });
    },
  });
  const vorschlaege = useMutation({
    mutationFn: vereinsfelderAnlegen,
    onSuccess: (n) => {
      setAngelegt(n);
      client.invalidateQueries({ queryKey: ["anordnung", "contacts"] });
    },
  });

  if (!verwaltet) return null;
  const jetzt = begriffe(e.modus);

  return (
    <section className="block">
      <div className="block-kopf">
        <h2>Modus</h2>
        <span className="stufe">{jetzt.modus === "verein" ? "Verein" : "Vertrieb"}</span>
      </div>
      <div className="block-inhalt">
        <Erklaerung
          kurz="Wie Rocket spricht: im Vertrieb von Firmen und Kontakten, im Verein von Mannschaften und Personen."
          lang={<>Der Modus ändert nur Begriffe, Navigation und Vorlagen. Im Verein fehlen Start, Leads, Angebote und Prognose in der Navigation, und „Kampagnen“ heißen Rundmails. Daten und Rechte bleiben unverändert — wer zurückschaltet, findet alles wieder, wie es war.</>}
        />
        <form onSubmit={(ev) => { ev.preventDefault(); speichern.mutate(); }}>
          <div className="feld">
            <label htmlFor="modus-wahl">Modus</label>
            <select id="modus-wahl" value={modus} onChange={(ev) => setModus(ev.target.value as Modus)}>
              <option value="vertrieb">Vertrieb — Firmen, Kontakte, Leads</option>
              <option value="verein">Verein — Mannschaften, Personen, Rundmails</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primaer" disabled={modus === jetzt.modus || speichern.isPending}>
            {speichern.isPending ? "Speichert …" : "Speichern"}
          </button>
        </form>
        {speichern.isError && <Fehler text={(speichern.error as Error).message} />}

        {jetzt.modus === "verein" && (
          <div className="modus-vorschlag">
            <p className="text-leise">
              Vorschläge für Felder an Personen: „Spielerdaten“ (Position, Rückennummer, Passnummer) und die
              vertrauliche Gruppe „Beitrag und Bank“ (Mitgliedsnummer, Beitrag, IBAN, Kontoinhaber). Vorhandenes
              bleibt, wie es ist.
            </p>
            <button type="button" className="btn btn-sekundaer btn-klein" onClick={() => vorschlaege.mutate()} disabled={vorschlaege.isPending}>
              {vorschlaege.isPending ? "Legt an …" : "Vereinsfelder anlegen"}
            </button>
            {angelegt !== null && (
              <p className="text-leise-klein" role="status">
                {angelegt === 0 ? "Alle Felder gab es schon." : `${angelegt} ${angelegt === 1 ? "Feld" : "Felder"} angelegt.`}
              </p>
            )}
            {vorschlaege.isError && <Fehler text={(vorschlaege.error as Error).message} />}
          </div>
        )}
      </div>
    </section>
  );
}
