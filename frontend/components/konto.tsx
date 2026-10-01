"use client";

// Modul HB-KONTO — docs/MODULE.md

import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, Globe, KeyRound, LogOut, Server } from "@/lib/symbole";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { abmelden, lage } from "@/lib/anmeldung";
import { nachweis } from "@/lib/datenwege";
import { initialenAusName } from "@/lib/format";
import type { OrgSettings } from "@/lib/typen";
import { useWer } from "@/lib/wer";
import { Darstellungsschalter } from "@/components/darstellung";

/**
 * Der Fuß der Navigation: eine Zeile für das Konto, eine für den Nachweis.
 *
 * Vorher standen hier drei Dinge nebeneinander, die nichts miteinander zu
 * tun haben — eine Personenkarte mit Rahmen, ein Dreifach-Schalter für die
 * Darstellung und der Satz „läuft auf dieser Box". Die Karte wog mehr als
 * jeder Navigationseintrag und sagte „angemeldet", was man ohnehin sieht;
 * der Schalter stand dauerhaft da für eine Entscheidung, die man einmal
 * trifft; und der Satz war eine Zusage ohne Beleg, die seit dem ersten
 * fremden Endpunkt schlicht nicht mehr stimmte.
 *
 * Jetzt: eine ruhige Zeile, die ein Menü öffnet (Darstellung, Zugang),
 * und darunter der gemessene Stand — oder nichts.
 */

export function Kontozeile() {
  const aktuell = usePathname();
  const [offen, setOffen] = useState(false);
  const knopf = useRef<HTMLButtonElement>(null);
  const { wer } = useWer();

  useEffect(() => {
    setOffen(false);
  }, [aktuell]);

  const person = wer.data;
  const name = person?.display_name ?? person?.login_username ?? "…";

  function schliessen(fokus = true) {
    setOffen(false);
    if (fokus) knopf.current?.focus();
  }

  return (
    <div className="person">
      <button
        ref={knopf}
        type="button"
        className="person-knopf"
        aria-expanded={offen}
        aria-haspopup="dialog"
        aria-controls="konto-menue"
        aria-label={`Sie arbeiten als ${name}. Konto und Darstellung`}
        onClick={() => setOffen((o) => !o)}
      >
        <span className="person-kreis" aria-hidden="true">
          {initialenAusName(person?.display_name ?? person?.login_username)}
        </span>
        <span className="person-text">
          <span className="person-name">{name}</span>
        </span>
        <ChevronsUpDown size={16} aria-hidden="true" className="person-pfeil" />
      </button>

      {offen && (
        <Kontomenue schliessen={schliessen} knopf={knopf} />
      )}
    </div>
  );
}

/**
 * Das Menü klappt nach oben. Es schließt bei Escape, bei einem Klick
 * außerhalb und beim Seitenwechsel, und der Fokus kehrt zum Knopf zurück —
 * dasselbe Verhalten wie das Feld „Mehr" in der Hülle. Die alte
 * Personenliste schloss nur durch Auswahl; wer sie versehentlich öffnete,
 * wurde sie nicht mehr los.
 */
function Kontomenue({
  schliessen,
  knopf,
}: {
  schliessen: (fokus?: boolean) => void;
  knopf: React.RefObject<HTMLButtonElement | null>;
}) {
  const wurzel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    wurzel.current?.querySelector<HTMLElement>("button")?.focus();
    function taste(e: KeyboardEvent) {
      if (e.key === "Escape") schliessen(true);
    }
    function klick(e: MouseEvent) {
      const ziel = e.target as Node;
      if (wurzel.current?.contains(ziel) || knopf.current?.contains(ziel)) return;
      schliessen(false);
    }
    document.addEventListener("keydown", taste);
    document.addEventListener("mousedown", klick);
    return () => {
      document.removeEventListener("keydown", taste);
      document.removeEventListener("mousedown", klick);
    };
  }, [schliessen, knopf]);

  return (
    <div className="person-liste" id="konto-menue" role="dialog" aria-label="Konto" ref={wurzel}>
      <div>
        <p className="konto-abschnitt">Darstellung</p>
        <Darstellungsschalter />
      </div>

      <Abmeldeteil />
    </div>
  );
}

/**
 * Abmelden — nur, wenn es etwas abzumelden gibt.
 *
 * Im Modus `olares` prüft der Sidecar, und ein „Abmelden" in Rocket wäre
 * eine Attrappe: Der nächste Aufruf käme mit demselben geprüften Kopf
 * zurück und wäre wieder drin. Deshalb fragt diese Zeile erst, wie die
 * Lage ist, und zeigt sich nur dann, wenn die Antwort eine eigene
 * Sitzung nennt.
 */
function Abmeldeteil() {
  const stand = useQuery({ queryKey: ["anmeldelage"], queryFn: lage, staleTime: 60_000 });
  if (!stand.data?.angemeldet) return null;

  return (
    <div className="konto-teil">
      <p className="konto-abschnitt">Zugang</p>
      <Link href="/einstellungen?bereich=firma" className="person-eintrag">
        <KeyRound size={16} aria-hidden="true" />
        <span className="person-eintrag-text">Passwort und zweiter Faktor</span>
      </Link>
      <button
        type="button"
        className="person-eintrag"
        onClick={async () => {
          await abmelden();
          // Harter Wechsel: Alles im Speicher gehörte der abgemeldeten Person.
          window.location.assign("/anmelden");
        }}
      >
        <LogOut size={16} aria-hidden="true" />
        <span className="person-eintrag-text">Abmelden</span>
      </button>
    </div>
  );
}

/**
 * Der Nachweis — gemessen an dem, was eingetragen ist.
 *
 * docs/DESIGN.md §5: „mit gemessenen Werten — oder gar nicht". Solange die
 * Einstellungen nicht da sind, steht hier deshalb nichts. Farbe trägt die
 * Aussage nie allein: Das Zeichen wechselt mit.
 */
export function Nachweiszeile() {
  const einstellungen = useQuery({
    queryKey: ["einstellungen"],
    queryFn: () => api.get<OrgSettings>("/api/settings"),
    staleTime: 5 * 60_000,
  });

  const stand = nachweis(einstellungen.data);
  if (!stand) return null;

  const Zeichen = stand.extern ? Globe : Server;
  const titel = stand.extern
    ? stand.ziele.map((z) => `${z.was}: ${z.host}`).join(" · ")
    : "Kein eingetragenes Ziel außerhalb dieser Box";

  return (
    <Link href="/einstellungen?bereich=daten" className="nachweis" data-extern={stand.extern ? "true" : undefined} title={titel}>
      <Zeichen size={16} aria-hidden="true" />
      <span>{stand.text}</span>
    </Link>
  );
}
