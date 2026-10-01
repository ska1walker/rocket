"use client";

// Modul HB-KOPFLEISTE — docs/MODULE.md

// Die Kopfleiste — die zwei Dinge, die man von überall tut.
//
// Suchen und Anlegen gehören nicht in die Navigationsspalte. Die Suche
// geht über den ganzen Bestand und beantwortet Fragen; zwischen den
// Bereichen stehend las sie sich wie ein Filter für die Bereiche.
// Anlegen gab es nur je Seite — wer auf dem Lead-Brett stand und einen
// Kontakt brauchte, musste erst wechseln.
//
// Bewusst **nur** diese zwei. HubSpots Leiste ist voll, weil dort acht
// Produkte, Telefonie und Hinweise unterzubringen sind. Rocket ist ein
// Produkt für ein kleines Team; wer den Behälter kopiert, ohne den
// Inhalt zu haben, bekommt eine leere Leiste.
//
// Das Konto und der Datenweg-Nachweis bleiben unten in der Spalte. Der
// Nachweis ist kein Bedienelement, sondern die Aussage des Produkts —
// oben würde daraus ein Symbol neben anderen, und der Satz wäre weg.

import { ChevronDown, Plus } from "@/lib/symbole";
import Link from "next/link";
import { useId } from "react";
import { neuPfad, NEU_ZIELE } from "@/lib/neu";
import { Marke } from "@/components/marke";
import { Klappschalter } from "@/components/navigation";
import { Suchfeld } from "@/components/suche";
import { useMenue } from "@/components/knopfmenue";

function NeuMenue() {
  const { offen, setOffen, wurzel, knopf, feld } = useMenue();
  const id = useId();

  return (
    <div className="knopfmenue" ref={wurzel}>
      <button
        type="button"
        className="btn btn-primaer kopf-neu"
        ref={knopf}
        // Auf schmalen Schirmen weicht das Wort — der Name bleibt.
        aria-label="Erstellen"
        title="Erstellen"
        aria-haspopup="menu"
        aria-expanded={offen}
        aria-controls={id}
        onClick={() => setOffen((o) => !o)}
      >
        {/* Kein Plus davor: Ein Knopf, der „Erstellen" sagt und ein
            Menü öffnet, trägt bei HubSpot die Beschriftung und den Pfeil
            und sonst nichts. Auf dem Handy weicht das Wort und das
            Zeichen bleibt — dort ist es der einzige Weg, es zu erkennen. */}
        <Plus size={16} aria-hidden="true" className="kopf-neu-zeichen" />
        <span className="kopf-neu-text">Erstellen</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {offen && (
        <div className="knopfmenue-feld" id={id} role="menu" ref={feld}>
          {NEU_ZIELE.map((z) => (
            <Link
              key={z.pfad}
              role="menuitem"
              className="knopfmenue-punkt"
              href={neuPfad(z.pfad)}
              onClick={() => setOffen(false)}
            >
              {z.text}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function Kopfleiste({
  eingeklappt,
  klappen,
}: {
  eingeklappt: boolean | null;
  klappen: () => void;
}) {
  return (
    <header className="kopfleiste">
      {/* Die Marke sitzt über der Spalte, nicht darin: So beginnt die
          Navigation mit Navigation, und die Leiste hat einen Anfang. */}
      <div className="kopfleiste-marke">
        <Link href="/" className="marke" aria-label="AImighty Rocket — zur Startseite">
          <Marke />
          <span className="marke-produkt" aria-hidden="true">Rocket</span>
        </Link>
        <Klappschalter eingeklappt={eingeklappt} umschalten={klappen} />
      </div>

      <div className="kopfleiste-suche">
        <Suchfeld />
      </div>

      <NeuMenue />
    </header>
  );
}

