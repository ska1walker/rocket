"use client";

// Modul HB-KONTO — docs/MODULE.md

import { useQuery } from "@tanstack/react-query";
import { KeyRound, LogOut, Settings, Users } from "@/lib/symbole";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { abmelden, lage } from "@/lib/anmeldung";
import { initialenAusName } from "@/lib/format";
import { useWer } from "@/lib/wer";
import { useSicht } from "@/lib/sicht";
import { useBegriffe } from "@/lib/modus";
import { Darstellungsschalter, Dichteschalter } from "@/components/darstellung";

/**
 * Das Profil oben rechts (ABGLEICH G8, Kai 6.10.2026).
 *
 * Bis 26.10.20 stand hier der Fuß der Navigation: Initialen, Name und
 * darunter „Alles auf dieser Box“. Am Handy war der Fuß ausgeblendet —
 * Abmelden und Darstellung waren dort gar nicht erreichbar. Jetzt sitzt
 * das Profil ganz rechts in der Kopfleiste, am Desktop und am Handy an
 * derselben Stelle, wie bei HubSpot, Google und Microsoft. Der Nachweis
 * entfiel: Er war kein Mehrwert; die Datenwege stehen unter Einstellungen.
 *
 * Seit 26.10.22 ist das Profil auch der einzige Weg zu den Einstellungen:
 * Das Zahnrad unten in der Navigation stand allein da und wirkte lauter als
 * die Arbeit (Kai, 6.10.2026, CI G8 Nachtrag).
 */
export function Profilknopf() {
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
        aria-label={`Konto: ${name}`}
        title={`Konto: ${name}`}
        onClick={() => setOffen((o) => !o)}
      >
        <span className="person-kreis" aria-hidden="true">
          {initialenAusName(person?.display_name ?? person?.login_username)}
        </span>
      </button>

      {offen && <Kontomenue schliessen={schliessen} knopf={knopf} />}
    </div>
  );
}

/** Was eine Rolle im Satz heißt — wie in der Teamliste. */
const ROLLE: Record<string, string> = {
  owner: "Eigentümerin",
  admin: "Verwalter",
  member: "Mitglied",
  viewer: "Nur lesen",
};

/**
 * Das Menü klappt nach unten, am Handy als Blatt über die ganze Breite.
 * Reihenfolge wie in jeder AImighty-App (CI HB-KONTO): Kopf, „Mein Konto“,
 * „Einstellungen der Organisation“ (nur wer verwaltet), Darstellung,
 * Abmelden zuletzt. Es schließt bei Escape, bei einem Klick
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
  const { wer } = useWer();
  const person = wer.data;
  const { verwaltet } = useSicht();
  const w = useBegriffe();

  useEffect(() => {
    wurzel.current?.querySelector<HTMLElement>("a, button")?.focus();
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
      <div className="person-kopf">
        <span className="person-kreis" aria-hidden="true">
          {initialenAusName(person?.display_name ?? person?.login_username)}
        </span>
        <span className="person-text">
          <span className="person-name">{person?.display_name ?? person?.login_username ?? "…"}</span>
          {person && (
            <span className="person-unter">
              {person.login_username} · {ROLLE[person.rolle] ?? person.rolle}
            </span>
          )}
        </span>
      </div>

      <Link href="/einstellungen?bereich=profil" className="person-eintrag">
        <Settings size={16} aria-hidden="true" />
        <span className="person-eintrag-text">Mein Konto</span>
      </Link>
      {verwaltet && (
        <Link href="/einstellungen?bereich=firma" className="person-eintrag">
          <Users size={16} aria-hidden="true" />
          <span className="person-eintrag-text">{w.modus === "verein" ? "Einstellungen des Vereins" : "Einstellungen der Organisation"}</span>
        </Link>
      )}

      <div className="konto-teil">
        <p className="konto-abschnitt">Darstellung</p>
        <Darstellungsschalter />
        <Dichteteil />
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
      <Link href="/einstellungen?bereich=sicherheit" className="person-eintrag">
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

/** Die Dichte — nur am Zeiger; am Touchscreen fällt der ganze Teil weg. */
function Dichteteil() {
  const [zeiger, setZeiger] = useState(false);
  useEffect(() => setZeiger(!window.matchMedia("(pointer: coarse)").matches), []);
  if (!zeiger) return null;
  return (
    <>
      <p className="konto-abschnitt">Dichte</p>
      <Dichteschalter />
    </>
  );
}
