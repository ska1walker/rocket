"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive, ArchiveRestore, ArrowDown, ArrowUp, GripVertical, Lock, Pencil, Plus, Trash2, X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api, suchparameter } from "@/lib/api";
import { alsReihenfolge, ablageOrt, gruppeSchieben, passt, schritt, verschiebe, type Ort } from "@/lib/anordnung";
import type {
  Anordnung,
  Eigenschaftsgruppe,
  Eigenschaftsoption,
  Feldeintrag,
  PropertyEntity,
  PropertyKind,
} from "@/lib/typen";
import { Fehler, Laedt } from "@/components/zustaende";
import { Erklaerung } from "@/components/erklaerung";

const OBJEKTE: { wert: PropertyEntity; text: string }[] = [
  { wert: "companies", text: "Firmen" },
  { wert: "contacts", text: "Kontakte" },
  { wert: "deals", text: "Leads" },
];

const TYPEN: { wert: PropertyKind; text: string; hinweis?: string }[] = [
  { wert: "text", text: "Text" },
  { wert: "number", text: "Zahl" },
  { wert: "date", text: "Datum" },
  { wert: "bool", text: "Ja / Nein" },
  { wert: "select", text: "Auswahl", hinweis: "genau ein Wert" },
  { wert: "multiselect", text: "Mehrfachauswahl", hinweis: "beliebig viele Werte" },
];

/** Wie eine Art heißt — auch die, die bisher nur feste Felder haben. */
export const TYP_TEXT: Record<string, string> = {
  ...Object.fromEntries(TYPEN.map((t) => [t.wert, t.text])),
  textarea: "Langer Text",
  url: "Adresse (URL)",
  email: "E-Mail",
  phone: "Telefon",
  currency: "Betrag",
  user: "Person",
};

/** Beide Typen führen eine Werteliste. */
const MIT_OPTIONEN: string[] = ["select", "multiselect"];

/**
 * Eigenschaften einrichten — nach HubSpots Muster, in Gruppen.
 *
 * Jedes Objekt hat Gruppen („Firmeninformationen", „Adresse" …), und jede
 * Eigenschaft steht in genau einer: die festen Felder ebenso wie die
 * eigenen. Ziehen ordnet Felder innerhalb und zwischen Gruppen; wer ohne
 * Maus arbeitet, nimmt den Griff und die Pfeiltasten — dieselbe Regel wie
 * beim Board.
 *
 * Gespeichert wird nach jedem Zug die ganze Anordnung (`PUT
 * /reihenfolge`), sofort sichtbar und bei einem Fehler zurückgenommen.
 * Hat jemand anderes inzwischen ein Feld angelegt, weist der Server die
 * veraltete Anordnung ab, statt dessen Arbeit blind zu verschieben.
 *
 * Feste Felder tragen ein Schloss: verschieben, umbenennen, mit Hilfetext
 * versehen ja — löschen und Typ ändern nein.
 */
export function Eigenschaftenblock() {
  const client = useQueryClient();
  const [objekt, setObjekt] = useState<PropertyEntity>("companies");
  const [suche, setSuche] = useState("");
  const [gezogen, setGezogen] = useState<string | null>(null);
  const [ziel, setZiel] = useState<Ort | null>(null);
  const [fokus, setFokus] = useState<string | null>(null);
  const [offen, setOffen] = useState<string | null>(null);

  const schluessel = ["anordnung", objekt, "mit-anzahl"];
  const anordnung = useQuery({
    queryKey: schluessel,
    queryFn: () =>
      api.get<Anordnung>(`/api/eigenschaften/anordnung${suchparameter({ entity: objekt, mit_anzahl: "true" })}`),
  });

  function neuLaden() {
    client.invalidateQueries({ queryKey: ["anordnung"] });
    client.invalidateQueries({ queryKey: ["eigenschaften"] });
  }

  const ordnen = useMutation({
    mutationFn: (neu: Anordnung) => api.put<Anordnung>("/api/eigenschaften/reihenfolge", alsReihenfolge(neu)),
    onMutate: async (neu) => {
      await client.cancelQueries({ queryKey: schluessel });
      const vorher = client.getQueryData<Anordnung>(schluessel);
      client.setQueryData(schluessel, neu);
      return { vorher };
    },
    onError: (_f, _n, kontext) => {
      if (kontext?.vorher) client.setQueryData(schluessel, kontext.vorher);
    },
    onSettled: neuLaden,
  });

  const archivieren = useMutation({
    mutationFn: ({ id, aktiv }: { id: string; aktiv: boolean }) =>
      aktiv ? api.patch(`/api/eigenschaften/${id}`, { is_active: true }) : api.del(`/api/eigenschaften/${id}`),
    onSuccess: neuLaden,
  });

  // Nach einem Zug mit der Tastatur bleibt der Fokus am Griff — sonst
  // müsste man ihn nach jedem Schritt neu suchen.
  useEffect(() => {
    if (!fokus) return;
    document.querySelector<HTMLElement>(`[data-griff="${fokus}"]`)?.focus();
  }, [fokus, anordnung.data]);

  const a = anordnung.data;
  // Beim Suchen wird nicht gezogen: Eine gefilterte Liste zeigt nicht, wo
  // ein Feld zwischen den ausgeblendeten landen würde.
  const sucht = suche.trim().length > 0;

  function ablegen(ort: Ort) {
    if (!a || !gezogen) return;
    ordnen.mutate(verschiebe(a, gezogen, ablageOrt(a, gezogen, ort)));
    setGezogen(null);
    setZiel(null);
  }

  return (
    <section className="block">
      <div className="block-kopf">
        <h2>Eigenschaften</h2>
      </div>
      <div className="block-inhalt">
        <Erklaerung
          kurz="Welche Felder es gibt, in welcher Gruppe und in welcher Reihenfolge."
          lang={
            <>
              So erscheinen die Felder am Datensatz, im Anlegen-Dialog und in der Spaltenwahl.
              Feste Felder (mit Schloss) lassen sich verschieben und umbenennen, aber nicht
              entfernen. Eigene Felder für das, was nur Ihr Vertrieb braucht — „Serverraum
              vorhanden“, „Wartungsvertrag bis“ —, legen Sie unten an; Typ und Schlüssel stehen
              danach fest. Ziehen Sie am Griff, oder nehmen Sie ihn und die Pfeiltasten.
            </>
          }
        />

        <div className="eig-leiste">
          <div className="wegwahl" role="tablist" aria-label="Objekt">
            {OBJEKTE.map((o) => (
              <button
                key={o.wert}
                type="button"
                role="tab"
                aria-selected={objekt === o.wert}
                className={objekt === o.wert ? "aktiv" : ""}
                onClick={() => {
                  setObjekt(o.wert);
                  setOffen(null);
                }}
              >
                {o.text}
              </button>
            ))}
          </div>
          <input
            className="input eig-suche"
            type="search"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Eigenschaft suchen"
            aria-label="Eigenschaft suchen"
          />
        </div>

        {anordnung.isPending && <Laedt />}
        {anordnung.isError && <Fehler text={(anordnung.error as Error).message} />}
        {ordnen.isError && <Fehler text={(ordnen.error as Error).message} />}
        {archivieren.isError && <Fehler text={(archivieren.error as Error).message} />}

        {a &&
          a.gruppen.map((g, gi) => {
            const sichtbar = g.felder.filter((f) => passt(suche, f.label, f.key));
            if (sucht && sichtbar.length === 0) return null;
            return (
              <Gruppenblock
                key={g.id}
                gruppe={g}
                anordnung={a}
                erste={gi === 0}
                letzte={gi === a.gruppen.length - 1}
                beiSchieben={(r) => ordnen.mutate(gruppeSchieben(a, g.id, r))}
                geaendert={neuLaden}
              >
                <ul
                  className="eig-felder"
                  onDragOver={(e) => {
                    if (!gezogen) return;
                    e.preventDefault();
                    // Unter dem letzten Feld oder in einer leeren Gruppe: hinten an.
                    if (e.target === e.currentTarget) setZiel({ gruppe: g.id, index: g.felder.length });
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (ziel) ablegen(ziel);
                  }}
                  data-leer={g.felder.length === 0 ? "true" : undefined}
                  data-ziel={ziel?.gruppe === g.id && ziel.index === g.felder.length ? "true" : undefined}
                >
                  {g.felder.length === 0 && <li className="eig-leer">Noch kein Feld — hierher ziehen.</li>}
                  {sichtbar.map((f) => {
                    const index = g.felder.indexOf(f);
                    return (
                      <Feldzeile
                        key={f.id}
                        feld={f}
                        ziehbar={!sucht}
                        gezogen={gezogen === f.id}
                        ziel={ziel?.gruppe === g.id && ziel.index === index}
                        offen={offen === f.id}
                        umschalten={() => setOffen(offen === f.id ? null : f.id)}
                        beiZiehen={(an) => setGezogen(an ? f.id : null)}
                        beiUeber={() => gezogen && gezogen !== f.id && setZiel({ gruppe: g.id, index })}
                        beiTaste={(r) => {
                          setFokus(f.id);
                          ordnen.mutate(schritt(a, f.id, r));
                        }}
                        beiArchivieren={() => archivieren.mutate({ id: f.id, aktiv: false })}
                        geaendert={neuLaden}
                      />
                    );
                  })}
                </ul>
              </Gruppenblock>
            );
          })}

        {a && sucht && a.gruppen.every((g) => !g.felder.some((f) => passt(suche, f.label, f.key))) && (
          <p className="eig-hinweis">Keine Eigenschaft passt auf „{suche.trim()}“.</p>
        )}

        {a && <NeueGruppe entity={objekt} geaendert={neuLaden} />}
        {a && <NeueEigenschaft entity={objekt} gruppen={a.gruppen} geaendert={neuLaden} />}

        {a && a.archiviert.length > 0 && (
          <details className="eig-archiv">
            <summary>Archiviert ({a.archiviert.length})</summary>
            <p className="eig-hinweis">
              Nicht mehr am Datensatz zu sehen; die Werte stehen weiter in den Datensätzen.
            </p>
            <ul className="eig-felder">
              {a.archiviert.map((f) => (
                <li key={f.id} className="eig-feld">
                  <span className="eig-name">
                    {f.label} <span className="eig-schluessel">{f.key}</span>
                  </span>
                  <span className="eig-art">{TYP_TEXT[f.art] ?? f.art}</span>
                  <span className="eig-zahl">{zahlText(f.anzahl)}</span>
                  <button
                    type="button"
                    className="btn btn-still btn-klein"
                    onClick={() => archivieren.mutate({ id: f.id, aktiv: true })}
                  >
                    <ArchiveRestore size={14} aria-hidden="true" /> Wiederherstellen
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

function zahlText(n: number | null): string {
  if (n === null) return "gerechnet";
  return n === 1 ? "1 Datensatz" : `${n} Datensätze`;
}

/** Kopf einer Gruppe: Name, Umbenennen, Verschieben, Löschen mit Ziel. */
function Gruppenblock({
  gruppe,
  anordnung,
  erste,
  letzte,
  beiSchieben,
  geaendert,
  children,
}: {
  gruppe: Eigenschaftsgruppe;
  anordnung: Anordnung;
  erste: boolean;
  letzte: boolean;
  beiSchieben: (r: -1 | 1) => void;
  geaendert: () => void;
  children: React.ReactNode;
}) {
  const [name, setName] = useState<string | null>(null);
  const [loeschen, setLoeschen] = useState(false);
  const andere = anordnung.gruppen.filter((g) => g.id !== gruppe.id);
  const [zielgruppe, setZielgruppe] = useState(andere[0]?.id ?? "");

  const umbenennen = useMutation({
    mutationFn: () => api.patch(`/api/eigenschaften/gruppen/${gruppe.id}`, { label: name }),
    onSuccess: () => {
      setName(null);
      geaendert();
    },
  });
  const weg = useMutation({
    mutationFn: () =>
      api.del(
        `/api/eigenschaften/gruppen/${gruppe.id}${suchparameter({ ziel: gruppe.felder.length ? zielgruppe : undefined })}`,
      ),
    onSuccess: geaendert,
  });

  return (
    <div className="eig-gruppe">
      <div className="eig-gruppe-kopf">
        {name === null ? (
          <h3>
            {gruppe.label}
            <span className="eig-anzahl">{gruppe.felder.length}</span>
          </h3>
        ) : (
          <form
            className="eig-umbenennen"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) umbenennen.mutate();
            }}
          >
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Name der Gruppe"
              autoFocus
            />
            <button type="submit" className="btn btn-primaer btn-klein" disabled={!name.trim() || umbenennen.isPending}>
              Speichern
            </button>
            <button type="button" className="btn btn-still btn-klein" onClick={() => setName(null)}>
              Abbrechen
            </button>
          </form>
        )}
        <div className="eig-gruppe-knoepfe">
          <button type="button" className="btn btn-still btn-klein btn-symbol" aria-label={`Gruppe ${gruppe.label} nach oben`} disabled={erste} onClick={() => beiSchieben(-1)}>
            <ArrowUp size={14} aria-hidden="true" />
          </button>
          <button type="button" className="btn btn-still btn-klein btn-symbol" aria-label={`Gruppe ${gruppe.label} nach unten`} disabled={letzte} onClick={() => beiSchieben(1)}>
            <ArrowDown size={14} aria-hidden="true" />
          </button>
          <button type="button" className="btn btn-still btn-klein btn-symbol" aria-label={`Gruppe ${gruppe.label} umbenennen`} onClick={() => setName(gruppe.label)}>
            <Pencil size={14} aria-hidden="true" />
          </button>
          {!gruppe.is_system && (
            <button type="button" className="btn btn-still btn-klein btn-symbol" aria-label={`Gruppe ${gruppe.label} löschen`} onClick={() => setLoeschen((l) => !l)}>
              <Trash2 size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {loeschen && (
        <div className="eig-loeschen">
          {gruppe.felder.length > 0 ? (
            <>
              <label htmlFor={`ziel-${gruppe.id}`}>
                {gruppe.felder.length === 1 ? "Das Feld geht nach" : `Die ${gruppe.felder.length} Felder gehen nach`}
              </label>
              <select id={`ziel-${gruppe.id}`} className="input" value={zielgruppe} onChange={(e) => setZielgruppe(e.target.value)}>
                {andere.map((g) => (
                  <option key={g.id} value={g.id}>{g.label}</option>
                ))}
              </select>
            </>
          ) : (
            <span>Die Gruppe ist leer.</span>
          )}
          <button type="button" className="btn btn-gefahr btn-klein" disabled={weg.isPending} onClick={() => weg.mutate()}>
            Gruppe löschen
          </button>
          <button type="button" className="btn btn-still btn-klein" onClick={() => setLoeschen(false)}>
            Abbrechen
          </button>
        </div>
      )}
      {umbenennen.isError && <Fehler text={(umbenennen.error as Error).message} />}
      {weg.isError && <Fehler text={(weg.error as Error).message} />}
      {children}
    </div>
  );
}

/** Eine Zeile: Griff, Name, Art, Nutzung, Handlungen — und aufgeklappt die Pflege. */
function Feldzeile({
  feld,
  ziehbar,
  gezogen,
  ziel,
  offen,
  umschalten,
  beiZiehen,
  beiUeber,
  beiTaste,
  beiArchivieren,
  geaendert,
}: {
  feld: Feldeintrag;
  ziehbar: boolean;
  gezogen: boolean;
  ziel: boolean;
  offen: boolean;
  umschalten: () => void;
  beiZiehen: (an: boolean) => void;
  beiUeber: () => void;
  beiTaste: (r: -1 | 1) => void;
  beiArchivieren: () => void;
  geaendert: () => void;
}) {
  return (
    <li
      className="eig-feld"
      data-gezogen={gezogen ? "true" : undefined}
      data-ziel={ziel ? "true" : undefined}
      draggable={ziehbar}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", feld.id);
        beiZiehen(true);
      }}
      onDragEnd={() => beiZiehen(false)}
      onDragOver={(e) => {
        e.preventDefault();
        beiUeber();
      }}
    >
      <div className="eig-zeile">
        <button
          type="button"
          className="eig-griff"
          data-griff={feld.id}
          disabled={!ziehbar}
          aria-label={`${feld.label} verschieben — Pfeiltaste hoch oder runter`}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              beiTaste(e.key === "ArrowUp" ? -1 : 1);
            }
          }}
        >
          <GripVertical size={14} aria-hidden="true" />
        </button>
        <span className="eig-name">
          {feld.label}
          {feld.is_system && (
            <span className="eig-fest" title="Festes Feld — verschieben und umbenennen ja, entfernen nein">
              <Lock size={11} aria-hidden="true" /> fest
            </span>
          )}
          <span className="eig-schluessel">{feld.key}</span>
        </span>
        <span className="eig-art">
          {TYP_TEXT[feld.art] ?? feld.art}
          {feld.im_anlegen && <span className="eig-anlegen" title="Erscheint im Anlegen-Dialog">im Anlegen</span>}
        </span>
        <span className="eig-zahl">{zahlText(feld.anzahl)}</span>
        <span className="eig-knoepfe">
          <button
            type="button"
            className="btn btn-still btn-klein btn-symbol"
            aria-label={`${feld.label} bearbeiten`}
            aria-expanded={offen}
            onClick={umschalten}
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
          {!feld.is_system && (
            <button
              type="button"
              className="btn btn-still btn-klein btn-symbol"
              aria-label={`${feld.label} archivieren`}
              title="Archivieren — die Werte bleiben in den Datensätzen"
              onClick={beiArchivieren}
            >
              <Archive size={14} aria-hidden="true" />
            </button>
          )}
        </span>
      </div>
      {offen && <Feldpflege feld={feld} fertig={umschalten} geaendert={geaendert} />}
    </li>
  );
}

/** Beschriftung, Hilfetext und — bei eigener Auswahl — die Werteliste. */
function Feldpflege({ feld, fertig, geaendert }: { feld: Feldeintrag; fertig: () => void; geaendert: () => void }) {
  const [label, setLabel] = useState(feld.label);
  const [hilfe, setHilfe] = useState(feld.description ?? "");
  const [imAnlegen, setImAnlegen] = useState(feld.im_anlegen);
  // Gerechnetes und Felder mit eigenem Weg haben im Anlegen nichts zu tun.
  const anlegbar = feld.bearbeitbar && !(feld.is_system && feld.key === "lost_reason");

  const sichern = useMutation({
    mutationFn: () =>
      api.patch(`/api/eigenschaften/${feld.id}`, {
        label: label.trim(),
        description: hilfe.trim() || null,
        ...(anlegbar ? { im_anlegen: imAnlegen } : {}),
      }),
    onSuccess: () => {
      geaendert();
      fertig();
    },
  });
  const werte = useMutation({
    mutationFn: (options: Eigenschaftsoption[]) => api.patch(`/api/eigenschaften/${feld.id}`, { options }),
    onSuccess: geaendert,
  });

  return (
    <div className="eig-pflege">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim()) sichern.mutate();
        }}
      >
        <div className="feld">
          <label htmlFor={`eig-l-${feld.id}`}>Beschriftung</label>
          <input id={`eig-l-${feld.id}`} className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
          <p className="feld-hinweis">
            Der Schlüssel <span className="mono">{feld.key}</span> bleibt — daran hängen Werte, Einfuhr und Filter.
          </p>
        </div>
        <div className="feld">
          <label htmlFor={`eig-h-${feld.id}`}>Hilfetext</label>
          <input
            id={`eig-h-${feld.id}`}
            className="input"
            value={hilfe}
            onChange={(e) => setHilfe(e.target.value)}
            placeholder="Was hier hineingehört — erscheint am Feld"
          />
        </div>
        {anlegbar && (
          <label className="faktor-bestaetigung">
            <input type="checkbox" checked={imAnlegen} onChange={(e) => setImAnlegen(e.target.checked)} />
            <span>Im Anlegen-Dialog zeigen — zusätzlich zu dem, was der Dialog ohnehin fragt.</span>
          </label>
        )}
        <div className="btn-reihe">
          <button type="submit" className="btn btn-primaer btn-klein" disabled={!label.trim() || sichern.isPending}>
            {sichern.isPending ? "Speichert …" : "Speichern"}
          </button>
          <button type="button" className="btn btn-still btn-klein" onClick={fertig}>
            Abbrechen
          </button>
        </div>
      </form>
      {sichern.isError && <Fehler text={(sichern.error as Error).message} />}
      {!feld.is_system && MIT_OPTIONEN.includes(feld.art) && (
        <div className="feld" style={{ marginTop: "var(--am-raum-3)" }}>
          <label>Erlaubte Werte</label>
          <Werteliste
            werte={feld.options}
            laeuft={werte.isPending}
            beiSichern={(options) => werte.mutate(options)}
            beiAbbruch={fertig}
          />
          {werte.isError && <Fehler text={(werte.error as Error).message} />}
        </div>
      )}
      {feld.is_system && feld.options.length > 0 && (
        <p className="feld-hinweis">
          Werte: {feld.options.map((o) => o.text).join(", ")} — bei festen Feldern vorgegeben.
        </p>
      )}
    </div>
  );
}

function NeueGruppe({ entity, geaendert }: { entity: PropertyEntity; geaendert: () => void }) {
  const [label, setLabel] = useState("");
  const anlegen = useMutation({
    mutationFn: () => api.post("/api/eigenschaften/gruppen", { entity, label: label.trim() }),
    onSuccess: () => {
      setLabel("");
      geaendert();
    },
  });
  return (
    <form
      className="eig-neu"
      onSubmit={(e) => {
        e.preventDefault();
        if (label.trim()) anlegen.mutate();
      }}
    >
      <div className="feld">
        <label htmlFor="eig-gruppe-neu">Neue Gruppe</label>
        <input id="eig-gruppe-neu" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="IT-Umgebung" />
      </div>
      <button type="submit" className="btn btn-sekundaer btn-klein" disabled={!label.trim() || anlegen.isPending}>
        <Plus size={14} aria-hidden="true" /> Gruppe
      </button>
      {anlegen.isError && <Fehler text={(anlegen.error as Error).message} />}
    </form>
  );
}

function NeueEigenschaft({
  entity,
  gruppen,
  geaendert,
}: {
  entity: PropertyEntity;
  gruppen: Eigenschaftsgruppe[];
  geaendert: () => void;
}) {
  const [label, setLabel] = useState("");
  const [typ, setTyp] = useState<PropertyKind>("text");
  const [gruppe, setGruppe] = useState("");
  const [optionen, setOptionen] = useState<Eigenschaftsoption[]>([leereOption()]);
  // Vorgabe: „Weitere Eigenschaften" — oder, falls umbenannt, die letzte Gruppe.
  const vorgabe = (gruppen.find((g) => g.key === "weitere") ?? gruppen[gruppen.length - 1])?.id ?? "";
  const gewaehlt = gruppen.some((g) => g.id === gruppe) ? gruppe : vorgabe;

  const anlegen = useMutation({
    mutationFn: () =>
      api.post("/api/eigenschaften", {
        entity,
        label,
        kind: typ,
        options: MIT_OPTIONEN.includes(typ) ? sauber(optionen) : [],
        group_id: gewaehlt || null,
      }),
    onSuccess: () => {
      setLabel("");
      setOptionen([leereOption()]);
      geaendert();
    },
  });

  const braucht = MIT_OPTIONEN.includes(typ);
  const genug = label.trim() && (!braucht || sauber(optionen).length > 0);

  return (
    <form
      className="eig-neue-eigenschaft"
      onSubmit={(e) => {
        e.preventDefault();
        if (genug) anlegen.mutate();
      }}
    >
      <div className="feld">
        <label htmlFor="eig-label">Neue Eigenschaft</label>
        <input id="eig-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Wartungsvertrag bis" />
      </div>
      <div className="feld">
        <label htmlFor="eig-typ">Typ</label>
        <select id="eig-typ" className="input" value={typ} onChange={(e) => setTyp(e.target.value as PropertyKind)}>
          {TYPEN.map((t) => (
            <option key={t.wert} value={t.wert}>
              {t.text}
              {t.hinweis ? ` — ${t.hinweis}` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="feld">
        <label htmlFor="eig-gruppe">Gruppe</label>
        <select id="eig-gruppe" className="input" value={gewaehlt} onChange={(e) => setGruppe(e.target.value)}>
          {gruppen.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>
      </div>
      {braucht && (
        <div className="feld eig-volle-breite">
          <label>Erlaubte Werte</label>
          <Optionsfelder werte={optionen} beiAendern={setOptionen} />
          <p className="feld-hinweis">
            {typ === "multiselect"
              ? "An jedem Datensatz lassen sich beliebig viele davon setzen."
              : "An jedem Datensatz gilt genau einer davon."}
          </p>
        </div>
      )}
      <div className="btn-reihe eig-volle-breite">
        <button type="submit" className="btn btn-primaer btn-klein" disabled={!genug || anlegen.isPending}>
          {anlegen.isPending ? "Legt an …" : "Anlegen"}
        </button>
      </div>
      {anlegen.isError && (
        <div className="eig-volle-breite">
          <Fehler text={(anlegen.error as Error).message} />
        </div>
      )}
    </form>
  );
}

function leereOption(): Eigenschaftsoption {
  return { wert: "", text: "", verborgen: false };
}

/** Nur Zeilen mit Beschriftung; der Wert kommt beim Anlegen vom Server. */
function sauber(werte: Eigenschaftsoption[]): Eigenschaftsoption[] {
  return werte
    .map((o) => ({ ...o, text: o.text.trim(), wert: o.wert.trim() }))
    .filter((o) => o.text);
}

/** Was in der Übersichtszeile steht. */
function zusammenfassung(optionen: Eigenschaftsoption[]): string {
  if (optionen.length === 0) return "Werte festlegen";
  const offen = optionen.filter((o) => !o.verborgen);
  const archiviert = optionen.length - offen.length;
  const liste = offen.map((o) => o.text).join(", ") || "alle archiviert";
  return archiviert > 0 ? `${liste} · ${archiviert} archiviert` : liste;
}

/**
 * Die Werteliste als Zeilen, nicht als Komma-Text.
 *
 * Ein Feld „Nord, Süd, West“ liest sich harmlos und geht schief, sobald
 * ein Wert selbst ein Komma enthält („Meyer, Schmidt & Partner“). Zeilen
 * haben das Problem nicht, und die Reihenfolge wird nebenbei sichtbar —
 * sie ist die, in der die Werte später überall erscheinen.
 *
 * Geändert wird die **Beschriftung**. Der gespeicherte Wert steht daneben
 * und bleibt, was er ist: Er hängt an jedem Datensatz, der die Option
 * trägt. Wer eine Option aus dem Verkehr ziehen will, archiviert sie —
 * dann wird sie nicht mehr angeboten und bleibt dort trotzdem gültig.
 */
function Optionsfelder({
  werte,
  beiAendern,
}: {
  werte: Eigenschaftsoption[];
  beiAendern: (neu: Eigenschaftsoption[]) => void;
}) {
  function setze(i: number, teil: Partial<Eigenschaftsoption>) {
    beiAendern(werte.map((o, j) => (j === i ? { ...o, ...teil } : o)));
  }

  function schieben(i: number, um: number) {
    const ziel = i + um;
    if (ziel < 0 || ziel >= werte.length) return;
    const neu = [...werte];
    [neu[i], neu[ziel]] = [neu[ziel], neu[i]];
    beiAendern(neu);
  }

  // Eingefügte Zeilen oder Kommas werden aufgeteilt: Wer eine Liste aus
  // einer Tabelle kopiert, soll sie nicht einzeln abtippen.
  function einfuegen(i: number, text: string) {
    const teile = text.split(/[\n;,]/).map((t) => t.trim()).filter(Boolean);
    if (teile.length <= 1) return false;
    beiAendern([
      ...werte.slice(0, i),
      ...teile.map((t) => ({ wert: "", text: t, verborgen: false })),
      ...werte.slice(i + 1),
    ]);
    return true;
  }

  return (
    <div className="optionsliste">
      {werte.map((o, i) => (
        <div className="optionszeile" key={i} data-archiviert={o.verborgen ? "true" : undefined}>
          <input
            value={o.text}
            aria-label={`Beschriftung ${i + 1}`}
            placeholder="Beschriftung"
            onChange={(e) => setze(i, { text: e.target.value })}
            onPaste={(e) => {
              if (einfuegen(i, e.clipboardData.getData("text"))) e.preventDefault();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                beiAendern([...werte.slice(0, i + 1), leereOption(), ...werte.slice(i + 1)]);
              }
            }}
          />
          {o.wert && o.wert !== o.text && (
            <span className="optionswert mono" title="Gespeicherter Wert — steht in den Datensätzen und ändert sich nicht">
              {o.wert}
            </span>
          )}
          <button type="button" className="btn btn-still btn-klein btn-symbol" aria-label="Nach oben" disabled={i === 0} onClick={() => schieben(i, -1)}>
            <ArrowUp size={14} aria-hidden="true" />
          </button>
          <button type="button" className="btn btn-still btn-klein btn-symbol" aria-label="Nach unten" disabled={i === werte.length - 1} onClick={() => schieben(i, 1)}>
            <ArrowDown size={14} aria-hidden="true" />
          </button>
          {o.wert ? (
            <button
              type="button"
              className="btn btn-still btn-klein btn-symbol"
              aria-label={o.verborgen ? "Wieder anbieten" : "Archivieren"}
              title={
                o.verborgen
                  ? "Wieder zur Wahl stellen"
                  : "Nicht mehr anbieten — an vorhandenen Datensätzen bleibt der Wert gültig"
              }
              onClick={() => setze(i, { verborgen: !o.verborgen })}
            >
              {o.verborgen ? <ArchiveRestore size={14} aria-hidden="true" /> : <Archive size={14} aria-hidden="true" />}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-still btn-klein btn-symbol"
            aria-label="Zeile entfernen"
            onClick={() => beiAendern(werte.length === 1 ? [leereOption()] : werte.filter((_, j) => j !== i))}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-still btn-klein" onClick={() => beiAendern([...werte, leereOption()])}>
        <Plus size={14} aria-hidden="true" />
        Wert
      </button>
    </div>
  );
}

/** Werteliste einer bestehenden Eigenschaft ändern. */
function Werteliste({
  werte,
  laeuft,
  beiSichern,
  beiAbbruch,
}: {
  werte: Eigenschaftsoption[];
  laeuft: boolean;
  beiSichern: (neu: Eigenschaftsoption[]) => void;
  beiAbbruch: () => void;
}) {
  const [entwurf, setEntwurf] = useState<Eigenschaftsoption[]>(
    werte.length ? werte : [leereOption()],
  );
  const fertig = sauber(entwurf);

  return (
    <div>
      <Optionsfelder werte={entwurf} beiAendern={setEntwurf} />
      <div className="btn-reihe" style={{ marginTop: "var(--am-raum-2)" }}>
        <button
          type="button"
          className="btn btn-primaer btn-klein"
          disabled={laeuft || fertig.length === 0 || fertig.every((o) => o.verborgen)}
          onClick={() => beiSichern(fertig)}
        >
          {laeuft ? "Speichert …" : "Speichern"}
        </button>
        <button type="button" className="btn btn-still btn-klein" onClick={beiAbbruch}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}
