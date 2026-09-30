"use client";

// Modul RK-FELDGRUPPEN — docs/MODULE.md

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, ChevronDown, Eye, EyeOff, Pencil, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, suchparameter } from "@/lib/api";
import {
  alsEingabe,
  anzeige,
  ausEingabe,
  type Auswahl,
  Eingabefehler,
  istLeer,
  patchFuer,
  sichereUrl,
  waehlbar,
  wertVon,
} from "@/lib/feldwerte";
import type { Anordnung, Feldeintrag, Mitglied, PropertyEntity, Wer } from "@/lib/typen";
import { useWer } from "@/lib/wer";
import { Mehrfachauswahl } from "@/components/mehrfachauswahl";
import { Fehler, Laedt } from "@/components/zustaende";
import { useDialogfalle } from "@/components/dialogfalle";

/** Was eine Seite an einem Feld anders zeigen oder anbieten will. */
export interface Sonderfeld {
  /** Anzeige statt des Standards — etwa ein Verweis auf die Firma. */
  zeige?: (wert: unknown) => React.ReactNode;
  /** `zeige` auch bei leerem Wert (ein Lead ohne Firma ist eine Aufgabe). */
  auchLeer?: boolean;
  /** Auswahl, die erst die Seite kennt (Firmen für `company`). */
  optionen?: Auswahl[];
}

/**
 * Die Eigenschaften eines Datensatzes — in ihren Gruppen, wie in HubSpots
 * „Über diese Firma".
 *
 * Feste und eigene Felder stehen gemischt, so wie unter *Einstellungen ›
 * Eigenschaften* angeordnet. Jede Gruppe klappt auf und zu, und das merkt
 * sich Rocket je Person — wer die Adresse nie braucht, klappt sie einmal
 * zu. „Leere ausblenden" zeigt nur, was gefüllt ist.
 *
 * Zwei Wege zu ändern, beide gewollt (Kai, 30.9.2026):
 * - **ein Feld** mit dem Stift daneben, wie in HubSpot — Enter speichert,
 *   Escape bricht ab;
 * - **alles** mit dem Stift im Kopf — für die Adresse, die sonst vier
 *   Speicherungen wären.
 */
export function Feldgruppen({
  entity,
  titel,
  pfad,
  werte,
  abfrageSchluessel,
  zurueckNach,
  loeschtext,
  kopfrechts,
  sonder = {},
}: {
  entity: PropertyEntity;
  titel: string;
  pfad: string;
  werte: Record<string, unknown>;
  abfrageSchluessel: unknown[];
  zurueckNach: string;
  loeschtext: string;
  kopfrechts?: React.ReactNode;
  sonder?: Record<string, Sonderfeld>;
}) {
  const client = useQueryClient();
  const router = useRouter();
  const { wer } = useWer();
  const [alle, setAlle] = useState(false);
  const [einzeln, setEinzeln] = useState<string | null>(null);
  const [loeschen, setLoeschen] = useState(false);
  const falle = useDialogfalle(() => setLoeschen(false));

  const anordnung = useQuery({
    queryKey: ["anordnung", entity],
    queryFn: () => api.get<Anordnung>(`/api/eigenschaften/anordnung${suchparameter({ entity })}`),
    staleTime: 60_000,
  });
  const mitglieder = useQuery({
    queryKey: ["mitglieder"],
    queryFn: () => api.get<Mitglied[]>("/api/mitglieder"),
    staleTime: 60_000,
  });
  const personen: Auswahl[] = (mitglieder.data ?? []).map((m) => ({
    wert: m.id,
    text: m.display_name ?? m.olares_username,
  }));

  const einstellungen = wer.data?.einstellungen ?? {};
  const zu = new Set(einstellungen.zugeklappt?.[entity] ?? []);
  const leereAus = Boolean(einstellungen.leere_ausblenden);

  // Sofort umschalten, dann speichern — wie bei den Favoriten.
  const merken = useMutation({
    mutationFn: (teil: Record<string, unknown>) => api.patch<Wer>("/api/mitglieder/wer/einstellungen", teil),
    onMutate: (teil) => {
      const vorher = client.getQueryData<Wer>(["wer"]);
      if (vorher) client.setQueryData<Wer>(["wer"], { ...vorher, einstellungen: { ...vorher.einstellungen, ...teil } });
      return { vorher };
    },
    onError: (_f, _t, k) => k?.vorher && client.setQueryData(["wer"], k.vorher),
    onSettled: () => client.invalidateQueries({ queryKey: ["wer"] }),
  });

  function klappen(key: string) {
    const neu = new Set(zu);
    if (neu.has(key)) neu.delete(key);
    else neu.add(key);
    merken.mutate({ zugeklappt: { ...(einstellungen.zugeklappt ?? {}), [entity]: [...neu] } });
  }

  const speichern = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.patch(pfad, patch),
    onSuccess: () => {
      setAlle(false);
      setEinzeln(null);
      client.invalidateQueries({ queryKey: abfrageSchluessel });
    },
  });

  const entfernen = useMutation({
    mutationFn: () => api.del(pfad),
    onSuccess: () => {
      client.invalidateQueries();
      router.push(zurueckNach);
    },
  });

  if (anordnung.isPending) return <Laedt />;
  if (anordnung.isError) return <Fehler text={(anordnung.error as Error).message} />;
  const a = anordnung.data!;

  // Ein gerechnetes Feld, das dieser Datensatz gar nicht mitliefert (etwa
  // „Offene Deals" auf der Firmenseite), ist nicht leer, sondern hier nicht
  // da — es erscheint nicht als Strich.
  const vorhanden = (f: Feldeintrag) => f.bearbeitbar || f.key in werte || !f.is_system;
  const optionenFuer = (f: Feldeintrag): Auswahl[] | undefined =>
    sonder[f.key]?.optionen ?? (f.art === "user" ? personen : undefined);

  // Werte eigener Eigenschaften, die archiviert sind, bleiben lesbar.
  const aktiv = new Set(a.gruppen.flatMap((g) => g.felder.map((f) => f.key)));
  const custom = (werte.custom ?? {}) as Record<string, unknown>;
  const verwaist = Object.entries(custom).filter(([k, v]) => !istLeer(v) && !aktiv.has(k));
  const archivLabel = (k: string) => a.archiviert.find((f) => f.key === k)?.label ?? k;

  return (
    <section className="block">
      <div className="block-kopf">
        <h2>{titel}</h2>
        <span className="fg-kopf-rechts">
          {kopfrechts}
          <button
            type="button"
            className="btn btn-still btn-klein btn-symbol"
            aria-pressed={leereAus}
            aria-label={leereAus ? "Leere Felder zeigen" : "Leere Felder ausblenden"}
            title={leereAus ? "Leere Felder zeigen" : "Leere Felder ausblenden"}
            onClick={() => merken.mutate({ leere_ausblenden: !leereAus })}
          >
            {leereAus ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
          </button>
          {!alle && (
            <button type="button" className="btn btn-still btn-klein btn-symbol" onClick={() => { setEinzeln(null); setAlle(true); }} aria-label="Alles bearbeiten">
              <Pencil size={14} aria-hidden="true" />
            </button>
          )}
        </span>
      </div>
      <div className="block-inhalt">
        {alle ? (
          <Formular
            anordnung={a}
            werte={werte}
            optionenFuer={optionenFuer}
            laeuft={speichern.isPending}
            fehler={speichern.error as Error | null}
            beiSichern={(patch) => speichern.mutate(patch)}
            beiAbbruch={() => { setAlle(false); speichern.reset(); }}
            beiLoeschen={() => setLoeschen(true)}
          />
        ) : (
          <>
            {a.gruppen.map((g) => {
              const felder = g.felder.filter(vorhanden).filter(
                (f) => !leereAus || !istLeer(wertVon(f, werte)) || (sonder[f.key]?.auchLeer ?? false),
              );
              if (felder.length === 0) return null;
              const offen = !zu.has(g.key);
              const gefuellt = g.felder.filter((f) => vorhanden(f) && !istLeer(wertVon(f, werte))).length;
              return (
                <div className="fg-gruppe" key={g.id}>
                  <button
                    type="button"
                    className="fg-gruppe-kopf"
                    aria-expanded={offen}
                    onClick={() => klappen(g.key)}
                  >
                    <ChevronDown size={14} aria-hidden="true" className="fg-pfeil" />
                    <span>{g.label}</span>
                    {!offen && <span className="fg-stand">{gefuellt} gefüllt</span>}
                  </button>
                  {offen && (
                    <dl className="fg-felder">
                      {felder.map((f) => (
                        <Feldzeile
                          key={f.id}
                          feld={f}
                          wert={wertVon(f, werte)}
                          sonder={sonder[f.key]}
                          personen={personen}
                          optionen={optionenFuer(f)}
                          offen={einzeln === f.key}
                          laeuft={speichern.isPending}
                          fehler={einzeln === f.key ? (speichern.error as Error | null) : null}
                          beiOeffnen={() => { speichern.reset(); setEinzeln(f.key); }}
                          beiAbbruch={() => { setEinzeln(null); speichern.reset(); }}
                          beiSichern={(wert) => speichern.mutate(patchFuer([{ feld: f, wert }]))}
                        />
                      ))}
                    </dl>
                  )}
                </div>
              );
            })}

            {verwaist.length > 0 && (
              <div className="fg-gruppe">
                <p className="fg-gruppe-kopf fg-archiv">Archivierte Eigenschaften</p>
                <dl className="fg-felder">
                  {verwaist.map(([k, v]) => (
                    <div className="eigenschaft" key={k}>
                      <dt>{archivLabel(k)}</dt>
                      <dd>{Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Ja" : "Nein") : String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </>
        )}

        {loeschen && (
          <div className="dialog-schicht" role="dialog" aria-modal="true" aria-label="Löschen bestätigen" ref={falle}>
            <div className="karte fg-loeschen">
              <h2>Wirklich löschen?</h2>
              <p>{loeschtext}</p>
              {entfernen.isError && <Fehler text={(entfernen.error as Error).message} />}
              <div className="btn-reihe">
                <button type="button" className="btn btn-primaer" onClick={() => entfernen.mutate()} disabled={entfernen.isPending}>Löschen</button>
                <button type="button" className="btn btn-still" data-autofokus onClick={() => setLoeschen(false)}>Abbrechen</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Eine Zeile — ansehen, und mit dem Stift genau dieses Feld ändern. */
function Feldzeile({
  feld,
  wert,
  sonder,
  personen,
  optionen,
  offen,
  laeuft,
  fehler,
  beiOeffnen,
  beiAbbruch,
  beiSichern,
}: {
  feld: Feldeintrag;
  wert: unknown;
  sonder?: Sonderfeld;
  personen: Auswahl[];
  optionen?: Auswahl[];
  offen: boolean;
  laeuft: boolean;
  fehler: Error | null;
  beiOeffnen: () => void;
  beiAbbruch: () => void;
  beiSichern: (wert: unknown) => void;
}) {
  const [roh, setRoh] = useState<string | string[]>(alsEingabe(feld, wert));
  const [eigenerFehler, setEigenerFehler] = useState<string | null>(null);

  function sichern() {
    try {
      setEigenerFehler(null);
      beiSichern(ausEingabe(feld, roh));
    } catch (e) {
      if (e instanceof Eingabefehler) setEigenerFehler(e.message);
      else throw e;
    }
  }

  if (offen) {
    return (
      <div className="eigenschaft">
        <dt><label htmlFor={`fg-${feld.key}`}>{feld.label}</label></dt>
        <dd>
          <form
            className="fg-einzeln"
            noValidate
            onSubmit={(e) => { e.preventDefault(); sichern(); }}
            onKeyDown={(e) => { if (e.key === "Escape") beiAbbruch(); }}
          >
            <Eingabe feld={feld} id={`fg-${feld.key}`} roh={roh} setRoh={setRoh} optionen={optionen} autoFocus />
            <button type="submit" className="btn btn-primaer btn-klein btn-symbol" aria-label={`${feld.label} speichern`} disabled={laeuft}>
              <Check size={14} aria-hidden="true" />
            </button>
            <button type="button" className="btn btn-still btn-klein btn-symbol" aria-label="Abbrechen" onClick={beiAbbruch}>
              <X size={14} aria-hidden="true" />
            </button>
          </form>
          {feld.description && <p className="feld-hinweis">{feld.description}</p>}
          {eigenerFehler && <Fehler text={eigenerFehler} />}
          {fehler && <Fehler text={fehler.message} />}
        </dd>
      </div>
    );
  }

  return (
    <div className="eigenschaft fg-zeile">
      <dt title={feld.description ?? undefined}>{feld.label}</dt>
      <dd>
        <Wert feld={feld} wert={wert} sonder={sonder} personen={personen} optionen={optionen} />
        {feld.bearbeitbar && (
          <button
            type="button"
            className="fg-stift"
            aria-label={`${feld.label} bearbeiten`}
            onClick={() => { setRoh(alsEingabe(feld, wert)); setEigenerFehler(null); beiOeffnen(); }}
          >
            <Pencil size={12} aria-hidden="true" />
          </button>
        )}
      </dd>
    </div>
  );
}

/** Der Wert zum Lesen — mit Verweis, wo einer hingehört. */
function Wert({
  feld,
  wert,
  sonder,
  personen,
  optionen,
}: {
  feld: Feldeintrag;
  wert: unknown;
  sonder?: Sonderfeld;
  personen: Auswahl[];
  optionen?: Auswahl[];
}) {
  if (sonder?.zeige && (sonder.auchLeer || !istLeer(wert))) return <>{sonder.zeige(wert)}</>;
  // Ein leeres Pflichtfeld sagt es — mit Zeichen und Wort, nicht nur Farbe.
  if (istLeer(wert) && feld.required)
    return (
      <span className="fg-fehlt">
        <AlertCircle size={12} aria-hidden="true" /> fehlt
      </span>
    );
  if (istLeer(wert)) return <span className="fg-leer">—</span>;
  const text = anzeige(feld, wert, personen, optionen);
  if (feld.art === "url") {
    const ziel = sichereUrl(String(wert));
    return ziel ? (
      <a href={ziel} target="_blank" rel="noreferrer noopener" className="fg-verweis">
        {text.replace(/^https?:\/\/(www\.)?/, "")}
      </a>
    ) : <>{text}</>;
  }
  if (feld.art === "email") return <a href={`mailto:${text}`} className="fg-verweis">{text}</a>;
  if (feld.art === "phone") return <a href={`tel:${text.replace(/[^+\d]/g, "")}`} className="fg-verweis">{text}</a>;
  if (feld.art === "textarea") return <span className="fg-lang">{text}</span>;
  return <>{text}</>;
}

/** Das passende Eingabefeld zur Art. */
export function Eingabe({
  feld,
  id,
  roh,
  setRoh,
  optionen,
  autoFocus,
}: {
  feld: Feldeintrag;
  id: string;
  roh: string | string[];
  setRoh: (w: string | string[]) => void;
  optionen?: Auswahl[];
  autoFocus?: boolean;
}) {
  const text = typeof roh === "string" ? roh : "";
  const setze = (e: { target: { value: string } }) => setRoh(e.target.value);
  switch (feld.art) {
    case "select":
    case "user":
    case "company":
      return (
        <select id={id} className="input" value={text} onChange={setze} autoFocus={autoFocus}>
          <option value="">—</option>
          {(optionen ?? waehlbar(feld.options, text)).map((o) => (
            <option key={o.wert} value={o.wert}>{o.text}</option>
          ))}
        </select>
      );
    case "multiselect":
      return (
        <Mehrfachauswahl
          id={id}
          ariaLabel={feld.label}
          optionen={waehlbar(feld.options, roh)}
          gewaehlt={Array.isArray(roh) ? roh : []}
          beiAendern={setRoh}
        />
      );
    case "bool":
      return (
        <select id={id} className="input" value={text} onChange={setze} autoFocus={autoFocus}>
          <option value="">—</option>
          <option value="true">Ja</option>
          <option value="false">Nein</option>
        </select>
      );
    case "textarea":
      return <textarea id={id} className="input" rows={3} value={text} onChange={setze} autoFocus={autoFocus} />;
    case "currency":
      return <input id={id} className="input" inputMode="decimal" value={text} onChange={setze} placeholder="0,00 €" autoFocus={autoFocus} />;
    default: {
      // Keine `url`-Art für den Browser: Er nähme „gruppe.de" nicht an, und
      // genau so steht eine Website meistens da. Die Tastatur passt trotzdem.
      const typ = { number: "number", date: "date", email: "email", phone: "tel" }[feld.art] ?? "text";
      return (
        <input
          id={id}
          className="input"
          type={typ}
          inputMode={feld.art === "url" ? "url" : undefined}
          step={feld.art === "number" ? "any" : undefined}
          value={text}
          onChange={setze}
          autoFocus={autoFocus}
        />
      );
    }
  }
}

/** Alles auf einmal: jede Gruppe als Abschnitt, gespeichert wird der Unterschied. */
function Formular({
  anordnung,
  werte,
  optionenFuer,
  laeuft,
  fehler,
  beiSichern,
  beiAbbruch,
  beiLoeschen,
}: {
  anordnung: Anordnung;
  werte: Record<string, unknown>;
  optionenFuer: (f: Feldeintrag) => Auswahl[] | undefined;
  laeuft: boolean;
  fehler: Error | null;
  beiSichern: (patch: Record<string, unknown>) => void;
  beiAbbruch: () => void;
  beiLoeschen: () => void;
}) {
  const [entwurf, setEntwurf] = useState<Record<string, string | string[]>>({});
  const [eigenerFehler, setEigenerFehler] = useState<string | null>(null);
  const felder = anordnung.gruppen.flatMap((g) => g.felder).filter((f) => f.bearbeitbar);

  function sichern() {
    try {
      setEigenerFehler(null);
      const aenderungen = felder
        .filter((f) => f.key in entwurf)
        .map((f) => ({ feld: f, wert: ausEingabe(f, entwurf[f.key]) }));
      if (aenderungen.length) beiSichern(patchFuer(aenderungen));
      else beiAbbruch();
    } catch (e) {
      if (e instanceof Eingabefehler) setEigenerFehler(e.message);
      else throw e;
    }
  }

  return (
    // `noValidate`: Ein Feld vom Typ `url` hielte „gruppe.de" für ungültig
    // und verhinderte das Absenden lautlos — auch wenn nur die Straße
    // geändert wurde. Geprüft wird hier (`ausEingabe`) und im Backend.
    <form noValidate onSubmit={(e) => { e.preventDefault(); sichern(); }}>
      {anordnung.gruppen.map((g) => {
        const hier = g.felder.filter((f) => f.bearbeitbar);
        if (hier.length === 0) return null;
        return (
          <fieldset className="fg-abschnitt" key={g.id}>
            <legend>{g.label}</legend>
            {hier.map((f) => (
              <div className="feld" key={f.id}>
                <label htmlFor={`fga-${f.key}`}>
                  {f.label}
                  {f.required && <span className="optional"> Pflicht</span>}
                </label>
                <Eingabe
                  feld={f}
                  id={`fga-${f.key}`}
                  roh={f.key in entwurf ? entwurf[f.key] : alsEingabe(f, wertVon(f, werte))}
                  setRoh={(w) => setEntwurf((alt) => ({ ...alt, [f.key]: w }))}
                  optionen={optionenFuer(f)}
                />
                {f.description && <p className="feld-hinweis">{f.description}</p>}
              </div>
            ))}
          </fieldset>
        );
      })}
      {eigenerFehler && <Fehler text={eigenerFehler} />}
      {fehler && <Fehler text={fehler.message} />}
      <div className="btn-reihe">
        <button type="submit" className="btn btn-primaer btn-klein" disabled={laeuft || Object.keys(entwurf).length === 0}>
          {laeuft ? "Speichert …" : "Speichern"}
        </button>
        <button type="button" className="btn btn-still btn-klein" onClick={beiAbbruch}>Abbrechen</button>
        <button type="button" className="btn btn-still btn-klein fg-loeschknopf" onClick={beiLoeschen}>
          <Trash2 size={14} aria-hidden="true" /> Löschen
        </button>
      </div>
    </form>
  );
}
