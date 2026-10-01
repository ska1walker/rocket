"use client";

// Modul RK-EINSTELLUNGEN — docs/MODULE.md

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Plus } from "@/lib/symbole";
import { useState } from "react";
import { api } from "@/lib/api";
import { datum, datumZeit } from "@/lib/format";
import type { ApiSchluessel, ApiSchluesselNeu } from "@/lib/typen";
import { Fehler, Laedt } from "@/components/zustaende";
import { Erklaerung } from "@/components/erklaerung";
import { Dialog, Rueckfrage } from "@/components/dialog";

const BEREICH_TEXT: Record<string, string> = {
  eigenschaften: "Eigenschaften",
};

/**
 * Schlüssel, mit denen ein Programm Rocket ohne Browser aufruft (seit
 * 26.10.14) — Skript, Make, n8n, Claude.
 *
 * Ein Schlüssel handelt im Namen der Person, die ihn erzeugt hat, mit ihrer
 * jeweils aktuellen Rolle, und nur in seinem Bereich. Er wird genau einmal
 * gezeigt: Ihn später noch einmal auszuliefern hieße, ihn dauerhaft
 * ausliefern zu können.
 */
export function ApiSchluesselblock() {
  const client = useQueryClient();
  const [anlegen, setAnlegen] = useState(false);
  const [neu, setNeu] = useState<ApiSchluesselNeu | null>(null);
  const [widerrufen, setWiderrufen] = useState<ApiSchluessel | null>(null);
  const [kopiert, setKopiert] = useState(false);

  const liste = useQuery({
    queryKey: ["api-schluessel"],
    queryFn: () => api.get<ApiSchluessel[]>("/api/api-schluessel"),
    // Ein Mitglied darf die Liste nicht sehen; der Block sagt das, statt zu fehlen.
    retry: false,
  });

  const zurueckziehen = useMutation({
    mutationFn: (id: string) => api.del(`/api/api-schluessel/${id}`),
    onSuccess: () => {
      setWiderrufen(null);
      client.invalidateQueries({ queryKey: ["api-schluessel"] });
    },
  });

  const basis = typeof window === "undefined" ? "" : window.location.origin;
  const aktiv = (liste.data ?? []).filter((s) => !s.widerrufen_am);

  return (
    <section className="block">
      <div className="block-kopf">
        <h2>API-Schlüssel</h2>
        {liste.isSuccess && (
          <button type="button" className="btn btn-sekundaer btn-klein" onClick={() => setAnlegen(true)}>
            <Plus size={16} aria-hidden="true" />
            Erzeugen
          </button>
        )}
      </div>
      <div className="block-inhalt">
        <Erklaerung
          kurz="Damit ein Programm Rocket ohne Browser aufruft — etwa um Eigenschaften anzulegen oder umzubenennen."
          lang={<>Ein Schlüssel handelt im Namen der Person, die ihn erzeugt hat, mit ihrer jeweils aktuellen Rolle. Verliert sie die Verwaltung, kann der Schlüssel nur noch lesen; wird sie entfernt, gilt er nicht mehr. Er öffnet nur seinen Bereich, nie Zugangsdaten, Team oder Sicherung, und erzeugt keine weiteren Schlüssel. Was er ändert, steht im Protokoll unter „api:Name“.</>}
        />

        {neu && (
          <div className="hinweis" data-art="achtung" role="status">
            <KeyRound size={16} aria-hidden="true" />
            <div className="api-schluessel-neu">
              <strong>Einmalig — jetzt kopieren.</strong>
              <code className="mono">{neu.schluessel}</code>
              <div className="btn-reihe">
                <button
                  type="button"
                  className="btn btn-still btn-klein"
                  onClick={() => {
                    navigator.clipboard?.writeText(neu.schluessel).then(() => setKopiert(true), () => setKopiert(false));
                  }}
                >
                  <Copy size={16} aria-hidden="true" />
                  {kopiert ? "Kopiert" : "Kopieren"}
                </button>
                <button type="button" className="btn btn-still btn-klein" onClick={() => { setNeu(null); setKopiert(false); }}>
                  Habe ich
                </button>
              </div>
              <span className="text-leise-klein">
                Der Schlüssel wird nicht wieder angezeigt. Wer ihn verliert, widerruft ihn und erzeugt einen neuen.
              </span>
            </div>
          </div>
        )}

        {liste.isPending && <Laedt />}
        {liste.isError && (
          <p className="text-leise">API-Schlüssel sehen und erzeugen nur die Eigentümerin und Verwalter.</p>
        )}
        {liste.isSuccess && aktiv.length === 0 && !neu && (
          <p className="text-leise">Noch kein Schlüssel. Ohne Schlüssel kommt kein Programm herein.</p>
        )}
        {aktiv.length > 0 && (
          <div className="tabelle-rahmen">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Bereich</th>
                  <th>Zuletzt benutzt</th>
                  <th>Läuft ab</th>
                  <th><span className="nur-vorleser">Aktionen</span></th>
                </tr>
              </thead>
              <tbody>
                {aktiv.map((s) => (
                  <tr key={s.id}>
                    <td className="haupt">
                      {s.name}
                      <span className="api-schluessel-herkunft text-leise-klein">
                        <span className="mono">{s.praefix}…</span> · von {s.erstellt_von ?? "—"}
                      </span>
                    </td>
                    <td>{s.bereiche.map((b) => BEREICH_TEXT[b] ?? b).join(", ")}</td>
                    <td>{s.zuletzt_benutzt ? datumZeit(s.zuletzt_benutzt) : "noch nie"}</td>
                    <td>{s.laeuft_ab ? datum(s.laeuft_ab) : "nie"}</td>
                    <td className="rechts">
                      <button type="button" className="btn btn-still btn-klein" onClick={() => setWiderrufen(s)}>
                        Widerrufen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {liste.isSuccess && (
          <p className="feld-hinweis api-schluessel-aufruf">
            Aufruf: <code className="mono">curl -H &quot;Authorization: Bearer rk_…&quot; {basis}/api/eigenschaften?entity=companies</code>
            {" "}— alle Wege stehen in der Betriebsanleitung unter „Eigenschaften über die API“.
          </p>
        )}
      </div>

      {anlegen && (
        <SchluesselDialog
          beiSchliessen={() => setAnlegen(false)}
          beiNeu={(s) => {
            setAnlegen(false);
            setKopiert(false);
            setNeu(s);
            client.invalidateQueries({ queryKey: ["api-schluessel"] });
          }}
        />
      )}

      {widerrufen && (
        <Rueckfrage
          titel={<>„{widerrufen.name}“ widerrufen</>}
          label="API-Schlüssel widerrufen"
          text="Ab sofort kommt kein Programm mehr mit diesem Schlüssel herein. Das lässt sich nicht zurücknehmen — für einen neuen Zugang erzeugen Sie einen neuen Schlüssel."
          beiSchliessen={() => setWiderrufen(null)}
          knopf={
            <button
              type="button"
              className="btn btn-gefahr"
              disabled={zurueckziehen.isPending}
              onClick={() => zurueckziehen.mutate(widerrufen.id)}
            >
              {zurueckziehen.isPending ? "Widerruft …" : "Schlüssel widerrufen"}
            </button>
          }
        >
          {zurueckziehen.isError && <Fehler text={(zurueckziehen.error as Error).message} />}
        </Rueckfrage>
      )}
    </section>
  );
}

function SchluesselDialog({
  beiSchliessen,
  beiNeu,
}: {
  beiSchliessen: () => void;
  beiNeu: (s: ApiSchluesselNeu) => void;
}) {
  const [name, setName] = useState("");
  const [ablauf, setAblauf] = useState("");
  const erzeugen = useMutation({
    mutationFn: () =>
      api.post<ApiSchluesselNeu>("/api/api-schluessel", {
        name: name.trim(),
        bereiche: ["eigenschaften"],
        // Bis zum Ende des gewählten Tages.
        laeuft_ab: ablauf ? new Date(`${ablauf}T23:59:59`).toISOString() : null,
      }),
    onSuccess: beiNeu,
  });

  return (
    <Dialog titel="API-Schlüssel erzeugen" breite="schmal" beiSchliessen={beiSchliessen} beiSenden={() => name.trim() && erzeugen.mutate()}>
      <div className="dialog-koerper">
        <div className="feld">
          <label htmlFor="api-name">Wofür</label>
          <input id="api-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Make — Felder pflegen" maxLength={80} required data-autofokus="" />
          <p className="feld-hinweis">Steht im Protokoll bei allem, was der Schlüssel ändert.</p>
        </div>
        <div className="feld">
          <label htmlFor="api-bereich">Bereich</label>
          <select id="api-bereich" value="eigenschaften" disabled>
            <option value="eigenschaften">Eigenschaften — Felder und Gruppen</option>
          </select>
        </div>
        <div className="feld">
          <label htmlFor="api-ablauf">Läuft ab <span className="optional">optional</span></label>
          <input id="api-ablauf" type="date" value={ablauf} onChange={(e) => setAblauf(e.target.value)} />
          <p className="feld-hinweis">Leer heißt: gilt, bis er widerrufen wird.</p>
        </div>
        {erzeugen.isError && <Fehler text={(erzeugen.error as Error).message} />}
      </div>
      <div className="dialog-fuss">
        <button type="submit" className="btn btn-primaer" disabled={!name.trim() || erzeugen.isPending}>
          {erzeugen.isPending ? "Erzeugt …" : "Erzeugen"}
        </button>
        <button type="button" className="btn btn-still" onClick={beiSchliessen}>
          Abbrechen
        </button>
      </div>
    </Dialog>
  );
}
