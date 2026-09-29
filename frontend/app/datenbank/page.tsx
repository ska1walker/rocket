"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Download, Lock, Play } from "lucide-react";
import { useState } from "react";
import { api, ApiFehler, suchparameter } from "@/lib/api";
import { liesSitzplatz } from "@/lib/sitzplatz";
import type { DbErgebnis, DbSeite, DbUebersicht, Wer } from "@/lib/typen";
import { Seitenkopf } from "@/components/seitenkopf";
import { Fehler, Laedt, Leer } from "@/components/zustaende";
import { Erklaerung } from "@/components/erklaerung";

/**
 * Der Blick in die Datenbank — lesend, für Verwalter.
 *
 * Zwei Reiter: in einer Tabelle blättern, oder eine eigene Abfrage
 * stellen. Beides läuft über das Backend und damit unter derselben
 * Zeilensicherheit wie der Rest von Rocket; ein externer
 * Datenbank-Browser sähe hier nur leere Tabellen. Geändert wird nichts —
 * dafür gibt es die Masken, die prüfen und protokollieren.
 */

type Reiter = "tabellen" | "sql";

const BEISPIEL = `select s.name as stufe, count(*) as geschaefte, round(sum(d.amount_cents) / 100.0, 2) as summe_eur
  from deals d
  join pipeline_stages s on s.id = d.stage_id
 group by s.name
 order by 2 desc`;

function Zelle({ wert }: { wert: unknown }) {
  if (wert === null || wert === undefined) return <td className="db-leer">—</td>;
  const text = typeof wert === "object" ? JSON.stringify(wert) : String(wert);
  return <td title={text.length > 40 ? text : undefined}>{text}</td>;
}

function Ergebnistabelle({
  spalten,
  zeilen,
  sort,
  richtung,
  sortieren,
}: {
  spalten: string[];
  zeilen: unknown[][];
  sort?: string | null;
  richtung?: "asc" | "desc";
  sortieren?: (spalte: string) => void;
}) {
  return (
    <div className="rollbar">
      <table className="tabelle db-tabelle">
        <thead>
          <tr>
            {spalten.map((s) => (
              <th key={s} aria-sort={sort === s ? (richtung === "asc" ? "ascending" : "descending") : undefined}>
                {sortieren ? (
                  <button type="button" onClick={() => sortieren(s)}>
                    {s}
                    {sort === s && (richtung === "asc"
                      ? <ArrowUp size={12} aria-hidden="true" />
                      : <ArrowDown size={12} aria-hidden="true" />)}
                  </button>
                ) : s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z, i) => (
            <tr key={i}>
              {z.map((w, j) => <Zelle key={j} wert={w} />)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tabellenblick({ uebersicht }: { uebersicht: DbUebersicht }) {
  const [name, setName] = useState(uebersicht.frei[0]?.name ?? "");
  const [seite, setSeite] = useState(1);
  const [sort, setSort] = useState<string | null>(null);
  const [richtung, setRichtung] = useState<"asc" | "desc">("asc");
  const [spalte, setSpalte] = useState("");
  const [suche, setSuche] = useState("");

  const tabelle = uebersicht.frei.find((t) => t.name === name);

  const daten = useQuery({
    queryKey: ["datenbank-tabelle", name, seite, sort, richtung, spalte, suche],
    queryFn: () =>
      api.get<DbSeite>(
        `/api/datenbank/tabellen/${encodeURIComponent(name)}${suchparameter({
          seite, sort, richtung, spalte: suche ? spalte : "", suche: spalte ? suche : "",
        })}`,
      ),
    enabled: Boolean(name),
    placeholderData: (vorher) => vorher,
  });

  function wechseln(neu: string) {
    setName(neu);
    setSeite(1);
    setSort(null);
    setSpalte("");
    setSuche("");
  }

  function sortieren(s: string) {
    if (sort === s) setRichtung(richtung === "asc" ? "desc" : "asc");
    else { setSort(s); setRichtung("asc"); }
    setSeite(1);
  }

  const seiten = daten.data ? Math.max(1, Math.ceil(daten.data.gesamt / daten.data.je_seite)) : 1;

  return (
    <>
      <div className="db-leiste">
        <select aria-label="Tabelle" value={name} onChange={(e) => wechseln(e.target.value)}>
          {uebersicht.frei.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name} ({t.zeilen.toLocaleString("de-DE")})
            </option>
          ))}
        </select>
        <select aria-label="Suchen in Spalte" value={spalte} onChange={(e) => { setSpalte(e.target.value); setSeite(1); }}>
          <option value="">Suchen in …</option>
          {tabelle?.spalten.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
        </select>
        <input
          className="input"
          type="search"
          aria-label="Suchbegriff"
          placeholder={spalte ? `enthält …` : "erst eine Spalte wählen"}
          disabled={!spalte}
          value={suche}
          onChange={(e) => { setSuche(e.target.value); setSeite(1); }}
        />
      </div>

      {daten.isError && <Fehler text={(daten.error as Error).message} />}
      {daten.isPending && <Laedt />}
      {daten.data && daten.data.zeilen.length === 0 && (
        <Leer titel="Keine Zeilen" text={suche ? "Nichts passt zu dieser Suche." : "Diese Tabelle ist in Ihrer Organisation leer."} />
      )}
      {daten.data && daten.data.zeilen.length > 0 && (
        <>
          <Ergebnistabelle
            spalten={daten.data.spalten}
            zeilen={daten.data.zeilen}
            sort={sort ?? daten.data.spalten[0]}
            richtung={richtung}
            sortieren={sortieren}
          />
          <div className="db-fuss">
            <span>
              {daten.data.gesamt.toLocaleString("de-DE")} Zeilen · Seite {seite} von {seiten}
            </span>
            <div className="btn-reihe">
              <button type="button" className="btn btn-sekundaer btn-klein" disabled={seite <= 1} onClick={() => setSeite(seite - 1)}>
                Zurück
              </button>
              <button type="button" className="btn btn-sekundaer btn-klein" disabled={seite >= seiten} onClick={() => setSeite(seite + 1)}>
                Weiter
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

async function csvHerunterladen(sql: string): Promise<void> {
  // Ein Link reicht hier nicht wie bei der Listen-Ausfuhr: Die Abfrage
  // geht im Körper eines POST mit, nicht in der Adresse — sie gehört
  // nicht in den Verlauf des Browsers und nicht in ein Zugriffsprotokoll.
  const antwort = await fetch("/api/datenbank/abfrage/csv", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Wie bei jedem anderen Aufruf: Das Protokoll soll die richtige Person nennen.
      ...(liesSitzplatz() ? { "X-Rocket-Sitzplatz": liesSitzplatz() as string } : {}),
    },
    body: JSON.stringify({ sql }),
  });
  if (!antwort.ok) {
    let grund = `Ausfuhr fehlgeschlagen (${antwort.status})`;
    try {
      const koerper = await antwort.json();
      if (typeof koerper?.detail === "string") grund = koerper.detail;
    } catch { /* keine JSON-Antwort */ }
    throw new ApiFehler(antwort.status, grund);
  }
  const datei = await antwort.blob();
  const name = /filename="([^"]+)"/.exec(antwort.headers.get("Content-Disposition") ?? "")?.[1] ?? "rocket-abfrage.csv";
  const adresse = URL.createObjectURL(datei);
  const a = document.createElement("a");
  a.href = adresse;
  a.download = name;
  a.click();
  URL.revokeObjectURL(adresse);
}

function Abfrageblick() {
  const [sql, setSql] = useState(BEISPIEL);

  const ausfuehren = useMutation({
    mutationFn: (text: string) => api.post<DbErgebnis>("/api/datenbank/abfrage", { sql: text }),
  });
  const ausfuhr = useMutation({ mutationFn: csvHerunterladen });

  return (
    <>
      <div className="feld">
        <label htmlFor="db-sql">Abfrage</label>
        <textarea
          id="db-sql"
          className="db-sql"
          spellCheck={false}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") ausfuehren.mutate(sql);
          }}
        />
        <p className="feld-hinweis">
          Nur SELECT, nur freigegebene Tabellen, höchstens 1.000 Zeilen und 10 Sekunden.
          Jede Abfrage steht im Protokoll. Ausführen mit ⌘/Strg + Enter.
        </p>
      </div>
      <div className="btn-reihe" style={{ marginBottom: "var(--am-raum-4)" }}>
        <button type="button" className="btn btn-primaer" disabled={ausfuehren.isPending} onClick={() => ausfuehren.mutate(sql)}>
          <Play size={16} aria-hidden="true" /> {ausfuehren.isPending ? "Läuft …" : "Ausführen"}
        </button>
        <button type="button" className="btn btn-sekundaer" disabled={ausfuhr.isPending} onClick={() => ausfuhr.mutate(sql)}>
          <Download size={16} aria-hidden="true" /> Als CSV
        </button>
      </div>

      {ausfuehren.isError && <Fehler text={(ausfuehren.error as Error).message} />}
      {ausfuhr.isError && <Fehler text={(ausfuhr.error as Error).message} />}
      {ausfuehren.data && (
        <>
          {ausfuehren.data.zeilen.length === 0
            ? <Leer titel="Keine Zeilen" text="Die Abfrage lief, fand aber nichts." />
            : <Ergebnistabelle spalten={ausfuehren.data.spalten} zeilen={ausfuehren.data.zeilen} />}
          <div className="db-fuss">
            <span>
              {ausfuehren.data.zeilen.length.toLocaleString("de-DE")} Zeilen · {ausfuehren.data.dauer_ms} ms
              {ausfuehren.data.abgeschnitten && " · nach 1.000 Zeilen abgeschnitten — die CSV-Ausfuhr enthält alle"}
            </span>
          </div>
        </>
      )}
    </>
  );
}

export default function DatenbankSeite() {
  const [reiter, setReiter] = useState<Reiter>("tabellen");
  const wer = useQuery({ queryKey: ["wer"], queryFn: () => api.get<Wer>("/api/mitglieder/wer") });
  const darf = wer.data?.rolle === "owner" || wer.data?.rolle === "admin";
  const uebersicht = useQuery({
    queryKey: ["datenbank-uebersicht"],
    queryFn: () => api.get<DbUebersicht>("/api/datenbank/tabellen"),
    enabled: darf,
  });

  return (
    <>
      <Seitenkopf titel="Datenbank" pfad={{ text: "Einstellungen", href: "/einstellungen?bereich=daten" }} />
      <div className="liste">
        {wer.isPending && <Laedt />}
        {wer.data && !darf && (
          <div className="hinweis" data-art="achtung" style={{ maxWidth: 640 }}>
            <Lock size={16} aria-hidden="true" />
            <span>Den Blick in die Datenbank haben nur Eigentümer und Verwalter.</span>
          </div>
        )}
        {darf && (
          <>
            <div style={{ maxWidth: 720, marginBottom: "var(--am-raum-4)" }}>
              <Erklaerung
                kurz="Sie sehen die Tabellen Ihrer Organisation, so wie Rocket sie speichert — nur lesend."
                lang={<>Alles läuft unter derselben Zeilensicherheit wie der Rest von Rocket: Daten anderer Organisationen auf dieser Box bleiben unsichtbar. Ändern lässt sich hier nichts; dafür gibt es die Masken, die prüfen und protokollieren. Tabellen mit Zugangsdaten und Sitzungen sind gesperrt.</>}
              />
            </div>
            <div role="tablist" style={{ borderBottom: "1px solid var(--am-rand)", marginBottom: "var(--am-raum-4)" }}>
              <button type="button" role="tab" aria-selected={reiter === "tabellen"} className={`ansicht-reiter${reiter === "tabellen" ? " aktiv" : ""}`} onClick={() => setReiter("tabellen")}>
                Tabellen
              </button>
              <button type="button" role="tab" aria-selected={reiter === "sql"} className={`ansicht-reiter${reiter === "sql" ? " aktiv" : ""}`} onClick={() => setReiter("sql")}>
                SQL
              </button>
            </div>

            {uebersicht.isError && <Fehler text={(uebersicht.error as Error).message} />}
            {uebersicht.isPending && <Laedt />}
            {uebersicht.data && reiter === "tabellen" && <Tabellenblick uebersicht={uebersicht.data} />}
            {uebersicht.data && reiter === "sql" && <Abfrageblick />}

            {uebersicht.data && (
              <section className="block" style={{ maxWidth: 720, marginTop: "var(--am-raum-8)" }}>
                <div className="block-kopf"><h2>Gesperrt</h2></div>
                <div className="block-inhalt">
                  <dl>
                    {uebersicht.data.gesperrt.map((g) => (
                      <div key={g.name} className="eigenschaft">
                        <dt><code>{g.name}</code></dt>
                        <dd>{g.grund}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
