"use client";

// Modul RK-VERSAND — docs/MODULE.md

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { datum } from "@/lib/format";
import type { Liste } from "@/lib/typen";
import { Seitenkopf } from "@/components/seitenkopf";
import { Fehler, Laedt, Leer } from "@/components/zustaende";
import { Dialog } from "@/components/dialog";

/** Eine Liste anlegen — statisch von Hand, aktiv als Frage an den Bestand. */
function ListeAnlegen({ beiSchliessen, beiErfolg }: { beiSchliessen: () => void; beiErfolg: (id: string) => void }) {
  const [name, setName] = useState("");
  const [art, setArt] = useState<"statisch" | "aktiv">("statisch");
  const [beschreibung, setBeschreibung] = useState("");
  const anlegen = useMutation({
    mutationFn: () => api.post<Liste>("/api/listen", { name, art, beschreibung: beschreibung || null }),
    onSuccess: (l) => beiErfolg(l.id),
  });
  return (
    <Dialog titel="Liste anlegen" breite="schmal" beiSchliessen={beiSchliessen} beiSenden={() => anlegen.mutate()}>
          <div className="dialog-koerper">
          <div className="feld">
            <label htmlFor="liste-name">Name</label>
            <input id="liste-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Messe Hannover 2026" />
          </div>
          <div className="feld">
            <label htmlFor="liste-art">Art</label>
            <select id="liste-art" value={art} onChange={(e) => setArt(e.target.value as "statisch" | "aktiv")}>
              <option value="statisch">Statisch — ich wähle die Kontakte selbst</option>
              <option value="aktiv">Aktiv — wer zum Filter passt, ist drin</option>
            </select>
            <p className="feld-hinweis">
              {art === "statisch"
                ? "Bleibt, wie Sie sie füllen. Gut für eine Messe oder eine Handvoll Kunden."
                : "Ändert sich mit dem Bestand. Den Filter legen Sie gleich fest."}
            </p>
          </div>
          <div className="feld">
            <label htmlFor="liste-beschreibung">Wozu <span className="optional">optional</span></label>
            <input id="liste-beschreibung" value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} />
          </div>
          {anlegen.isError && <Fehler text={(anlegen.error as Error).message} />}
          </div>
          <div className="dialog-fuss">
            <button type="submit" className="btn btn-primaer" disabled={anlegen.isPending || !name.trim()}>
              {anlegen.isPending ? "Wird angelegt …" : "Anlegen"}
            </button>
            <button type="button" className="btn btn-still" onClick={beiSchliessen}>Abbrechen</button>
          </div>
    </Dialog>
  );
}

export default function ListenSeite() {
  const router = useRouter();
  const client = useQueryClient();
  const [offen, setOffen] = useState(false);
  const listen = useQuery({ queryKey: ["listen"], queryFn: () => api.get<Liste[]>("/api/listen") });

  return (
    <>
      <Seitenkopf titel="Listen" zahl={listen.data ? `${listen.data.length}` : undefined}>
        <button type="button" className="btn btn-primaer" onClick={() => setOffen(true)}>Liste anlegen</button>
      </Seitenkopf>

      {offen && (
        <ListeAnlegen
          beiSchliessen={() => setOffen(false)}
          beiErfolg={(id) => { setOffen(false); client.invalidateQueries({ queryKey: ["listen"] }); router.push(`/listen/${id}`); }}
        />
      )}

      <div className="liste">
        {listen.isPending && <Laedt />}
        {listen.isError && <Fehler text={(listen.error as Error).message} />}
        {listen.data && listen.data.length === 0 && (
          <Leer titel="Noch keine Liste" text="Eine Liste sagt, wem eine Kampagne gilt. Ob Sie schreiben dürfen, sagt der Kontakt." />
        )}
        {listen.data && listen.data.length > 0 && (
          <div className="rollbar" tabIndex={0}>
            <table className="tabelle" style={{ minInlineSize: "40rem" }}>
              <thead>
                <tr>
                  <th>Liste</th>
                  <th>Art</th>
                  <th className="rechts">Gemeint</th>
                  <th className="rechts">Darf Post</th>
                  <th>Geändert</th>
                </tr>
              </thead>
              <tbody>
                {listen.data.map((l) => (
                  <tr key={l.id} data-ziel onClick={() => router.push(`/listen/${l.id}`)}>
                    <td className="haupt"><Link href={`/listen/${l.id}`} className="zeilen-ziel" onClick={(e) => e.stopPropagation()}>{l.name}</Link>{l.beschreibung && <div className="zeile-unter">{l.beschreibung}</div>}</td>
                    <td><span className="stufe">{l.art === "aktiv" ? "aktiv" : "statisch"}</span></td>
                    <td className="zahl">{l.gemeint}</td>
                    <td className="zahl">{l.berechtigt}</td>
                    <td>{datum(l.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
