"use client";

// Modul HB-FAKTOR — docs/MODULE.md

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "@/lib/symbole";
import { useState } from "react";
import {
  codesNeu,
  type Einrichtung,
  faktorAbschalten,
  faktorBestaetigen,
  faktorEinrichten,
  faktorStand,
  lage,
  pflichtSetzen,
} from "@/lib/anmeldung";
import { datum } from "@/lib/format";
import { useWer } from "@/lib/wer";
import { Erklaerung } from "@/components/erklaerung";
import { Fehler, Laedt } from "@/components/zustaende";

/**
 * Der zweite Faktor — ein Code aus einer Authenticator-App.
 *
 * Drei Dinge sind hier bewusst so und nicht anders:
 *
 * - **Der QR-Code kommt vom Server** als SVG. Ein fremder Bilderdienst
 *   bekäme sonst das Geheimnis zu sehen.
 * - **Erst ein bestätigter Code schaltet ihn ein.** Wer den QR-Code
 *   abbricht, sperrt sich nicht aus.
 * - **Die Wiederherstellungscodes stehen genau einmal da.** Gespeichert
 *   ist nur ihr Hash; wer sie nicht notiert, erzeugt neue.
 */

/** Sechs Ziffern oder ein Wiederherstellungscode — beides nimmt dasselbe Feld. */
export function Codefeld({
  id,
  wert,
  setWert,
  label = "Code aus der App",
  hinweis,
  autoFocus,
}: {
  id: string;
  wert: string;
  setWert: (w: string) => void;
  label?: string;
  hinweis?: React.ReactNode;
  autoFocus?: boolean;
}) {
  return (
    <div className="feld">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input tor-kennung"
        value={wert}
        onChange={(e) => setWert(e.target.value)}
        inputMode="text"
        autoComplete="one-time-code"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="123 456"
        maxLength={40}
        required
        autoFocus={autoFocus}
      />
      {hinweis && <p className="feld-hinweis">{hinweis}</p>}
    </div>
  );
}

/** Die Codes für das verlorene Handy. Einmal gezeigt, nie wieder. */
export function Codeliste({ codes, weiter }: { codes: string[]; weiter: () => void }) {
  const [notiert, setNotiert] = useState(false);
  return (
    <div>
      <div className="hinweis" data-art="achtung">
        <span>
          <strong>Notieren Sie diese Codes jetzt.</strong> Jeder gilt einmal, falls Ihr Handy
          weg ist. Rocket speichert nur ihren Abdruck und kann sie Ihnen nicht noch einmal
          zeigen.
        </span>
      </div>
      <ul className="faktor-codes" aria-label="Wiederherstellungscodes">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <label className="faktor-bestaetigung">
        <input type="checkbox" checked={notiert} onChange={(e) => setNotiert(e.target.checked)} />
        <span>Ich habe die Codes an einem sicheren Ort notiert.</span>
      </label>
      <button type="button" className="btn btn-primaer" disabled={!notiert} onClick={weiter}>
        Fertig
      </button>
    </div>
  );
}

/**
 * Einrichten: QR-Code zeigen, Code bestätigen, Codes zeigen.
 * Gebraucht in den Einstellungen und auf der Pflichtseite `/zweiter-faktor`.
 */
export function FaktorEinrichtung({ fertig, abbrechen }: { fertig: () => void; abbrechen?: () => void }) {
  const client = useQueryClient();
  const [einrichtung, setEinrichtung] = useState<Einrichtung | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);

  const starten = useMutation({
    mutationFn: faktorEinrichten,
    onSuccess: setEinrichtung,
  });

  const bestaetigen = useMutation({
    mutationFn: () => faktorBestaetigen(code.trim()),
    onSuccess: (r) => {
      setCodes(r.codes);
      setCode("");
      client.invalidateQueries({ queryKey: ["zweiter-faktor"] });
      client.invalidateQueries({ queryKey: ["mitglieder"] });
    },
  });

  if (codes) {
    return (
      <Codeliste
        codes={codes}
        weiter={() => {
          client.invalidateQueries({ queryKey: ["wer"] });
          fertig();
        }}
      />
    );
  }

  if (!einrichtung) {
    return (
      <div>
        <p className="feld-hinweis">
          Sie brauchen eine Authenticator-App auf dem Handy, etwa die von Microsoft, Google
          oder 1Password. Jede App, die TOTP-Codes erzeugt, funktioniert.
        </p>
        <div className="faktor-zeile">
          <button
            type="button"
            className="btn btn-primaer"
            onClick={() => starten.mutate()}
            disabled={starten.isPending}
          >
            {starten.isPending ? "Einen Moment …" : "Einrichten"}
          </button>
          {abbrechen && (
            <button type="button" className="btn btn-still" onClick={abbrechen}>
              Abbrechen
            </button>
          )}
        </div>
        {starten.isError && <Fehler text={(starten.error as Error).message} />}
      </div>
    );
  }

  // Das SVG geht als Bild hinein, nicht als Markup: So kann es kein Skript
  // tragen, auch wenn es einmal nicht vom eigenen Server käme.
  const bild = `data:image/svg+xml;base64,${btoa(einrichtung.qr_svg)}`;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) bestaetigen.mutate();
      }}
    >
      <div className="faktor-einrichtung">
        <img className="faktor-qr" src={bild} alt="QR-Code für die Authenticator-App" />
        <div>
          <p>
            <strong>1.</strong> Scannen Sie den Code mit der App.
          </p>
          <p className="feld-hinweis">
            Geht das nicht, tippen Sie diesen Schlüssel ein:
            <br />
            <span className="faktor-geheimnis">{einrichtung.geheimnis}</span>
          </p>
          <p>
            <strong>2.</strong> Geben Sie den Code ein, den die App jetzt zeigt.
          </p>
        </div>
      </div>
      <div className="faktor-zeile">
        <Codefeld id="faktor-bestaetigen" wert={code} setWert={setCode} autoFocus />
        <button type="submit" className="btn btn-primaer" disabled={!code.trim() || bestaetigen.isPending}>
          {bestaetigen.isPending ? "Prüft …" : "Bestätigen"}
        </button>
        {abbrechen && (
          <button type="button" className="btn btn-still" onClick={abbrechen}>
            Abbrechen
          </button>
        )}
      </div>
      {bestaetigen.isError && <Fehler text={(bestaetigen.error as Error).message} />}
    </form>
  );
}

/** Der Block in „Firma und Team": Stand, Einrichten, neue Codes, Abschalten, Pflicht. */
export function Faktorblock() {
  const client = useQueryClient();
  const angemeldet = useQuery({ queryKey: ["anmeldelage"], queryFn: lage, staleTime: 60_000 });
  const stand = useQuery({
    queryKey: ["zweiter-faktor"],
    queryFn: faktorStand,
    enabled: Boolean(angemeldet.data?.angemeldet),
  });
  const { wer } = useWer();
  const verwaltet = wer.data?.rolle === "owner" || wer.data?.rolle === "admin";

  const [modus, setModus] = useState<"ruhe" | "einrichten" | "codes" | "abschalten">("ruhe");
  const [code, setCode] = useState("");
  const [passwort, setPasswort] = useState("");
  const [neueCodes, setNeueCodes] = useState<string[] | null>(null);

  function zurueck() {
    setModus("ruhe");
    setCode("");
    setPasswort("");
    setNeueCodes(null);
  }

  const codesErneuern = useMutation({
    mutationFn: () => codesNeu(code.trim()),
    onSuccess: (r) => {
      setNeueCodes(r.codes);
      setCode("");
      client.invalidateQueries({ queryKey: ["zweiter-faktor"] });
    },
  });

  const abschalten = useMutation({
    mutationFn: () => faktorAbschalten(passwort, code.trim()),
    onSuccess: () => {
      zurueck();
      client.invalidateQueries({ queryKey: ["zweiter-faktor"] });
      client.invalidateQueries({ queryKey: ["mitglieder"] });
    },
  });

  const pflicht = useMutation({
    mutationFn: pflichtSetzen,
    onSuccess: (neu) => client.setQueryData(["zweiter-faktor"], neu),
  });

  // Ohne eigene Anmeldung prüft der Olares-Sidecar — ein Faktor hier wäre
  // ein Schloss an einer Tür, durch die niemand kommt.
  if (!angemeldet.data?.angemeldet) return null;
  if (stand.isPending) return <Laedt />;
  if (stand.isError) return <Fehler text={(stand.error as Error).message} />;

  const s = stand.data!;

  return (
    <section className="block">
      <div className="block-kopf">
        <h2>Zweiter Faktor</h2>
        {s.aktiv && (
          <span className="stufe" data-art="won">
            <ShieldCheck size={16} aria-hidden="true" /> eingeschaltet
          </span>
        )}
      </div>
      <div className="block-inhalt">
        <Erklaerung
          kurz="Nach dem Passwort ein Code aus der App auf Ihrem Handy."
          lang={
            <>
              Wer Ihr Passwort errät oder mitliest, kommt ohne Ihr Handy trotzdem nicht herein.
              Für den Fall, dass das Handy weg ist, bekommen Sie zehn Wiederherstellungscodes.
              Sind auch die weg, setzt die Datei auf der Box (Passwort vergessen) den Faktor mit
              zurück.
            </>
          }
        />

        {modus === "einrichten" && <FaktorEinrichtung fertig={zurueck} abbrechen={zurueck} />}

        {modus === "ruhe" && !s.aktiv && (
          <>
            <p>
              Noch nicht eingerichtet.
              {s.pflicht && <strong> Ihre Organisation verlangt ihn.</strong>}
            </p>
            <button type="button" className="btn btn-primaer" onClick={() => setModus("einrichten")}>
              Einrichten
            </button>
          </>
        )}

        {modus === "ruhe" && s.aktiv && (
          <>
            <p>
              Eingeschaltet{s.seit ? ` seit ${datum(s.seit)}` : ""}. Noch{" "}
              <strong>{s.codes_uebrig}</strong> von zehn Wiederherstellungscodes übrig.
            </p>
            {s.codes_uebrig <= 3 && (
              <div className="hinweis" data-art="achtung">
                <span>Nur noch wenige Codes. Erzeugen Sie neue, solange Sie das Handy haben.</span>
              </div>
            )}
            <div className="faktor-zeile">
              <button type="button" className="btn btn-sekundaer" onClick={() => setModus("codes")}>
                Neue Wiederherstellungscodes
              </button>
              {!s.pflicht && (
                <button type="button" className="btn btn-still" onClick={() => setModus("abschalten")}>
                  Abschalten
                </button>
              )}
            </div>
          </>
        )}

        {modus === "codes" &&
          (neueCodes ? (
            <Codeliste codes={neueCodes} weiter={zurueck} />
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim()) codesErneuern.mutate();
              }}
            >
              <p className="feld-hinweis">Die bisherigen Codes gelten danach nicht mehr.</p>
              <div className="faktor-zeile">
                <Codefeld id="faktor-codes" wert={code} setWert={setCode} autoFocus />
                <button type="submit" className="btn btn-primaer" disabled={!code.trim() || codesErneuern.isPending}>
                  {codesErneuern.isPending ? "Prüft …" : "Neue Codes erzeugen"}
                </button>
                <button type="button" className="btn btn-still" onClick={zurueck}>
                  Abbrechen
                </button>
              </div>
              {codesErneuern.isError && <Fehler text={(codesErneuern.error as Error).message} />}
            </form>
          ))}

        {modus === "abschalten" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (passwort && code.trim()) abschalten.mutate();
            }}
          >
            <p className="feld-hinweis">
              Zum Abschalten brauchen Sie beides: Passwort und einen Code. Wer nur eines davon
              hat, soll den Schutz nicht entfernen können.
            </p>
            <div className="feld">
              <label htmlFor="faktor-passwort">Passwort</label>
              <input
                id="faktor-passwort"
                className="input"
                type="password"
                autoComplete="current-password"
                value={passwort}
                onChange={(e) => setPasswort(e.target.value)}
              />
            </div>
            <div className="faktor-zeile">
              <Codefeld id="faktor-aus" wert={code} setWert={setCode} />
              <button type="submit" className="btn btn-gefahr" disabled={!passwort || !code.trim() || abschalten.isPending}>
                {abschalten.isPending ? "Prüft …" : "Abschalten"}
              </button>
              <button type="button" className="btn btn-still" onClick={zurueck}>
                Abbrechen
              </button>
            </div>
            {abschalten.isError && <Fehler text={(abschalten.error as Error).message} />}
          </form>
        )}

        {verwaltet && modus === "ruhe" && (
          <div className="faktor-pflicht">
            <label className="faktor-bestaetigung">
              <input
                type="checkbox"
                checked={s.pflicht}
                disabled={pflicht.isPending || (!s.aktiv && !s.pflicht)}
                onChange={(e) => pflicht.mutate(e.target.checked)}
              />
              <span>
                <strong>Für alle verlangen.</strong> Wer noch keinen zweiten Faktor hat, wird beim
                nächsten Aufruf zur Einrichtung geführt und kann vorher nichts anderes tun.
                {!s.aktiv && !s.pflicht && " Richten Sie dafür zuerst Ihren eigenen ein."}
              </span>
            </label>
            {pflicht.isError && <Fehler text={(pflicht.error as Error).message} />}
          </div>
        )}
      </div>
    </section>
  );
}
