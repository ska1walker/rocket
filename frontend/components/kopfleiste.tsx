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

import { Profilknopf } from "@/components/konto";
import { ChevronDown, Plus } from "@/lib/symbole";
import Link from "next/link";
import { useId } from "react";
import { neuPfad, NEU_ZIELE } from "@/lib/neu";
import { Marke } from "@/components/marke";
import { Klappschalter } from "@/components/navigation";
import { Suchfeld } from "@/components/suche";
import { useMenue } from "@/components/knopfmenue";
import { useSicht } from "@/lib/sicht";
import { useBegriffe } from "@/lib/modus";
import { NUR_VERTRIEB } from "@/lib/begriffe";

function NeuMenue() {
  const { offen, setOffen, wurzel, knopf, feld } = useMenue();
  const id = useId();
  // Eingeschränkt: Kontakte und Aufgaben — Firmen, Leads und Tickets legt
  // an, wer alles sieht (seit 26.10.17).
  const { eingeschraenkt } = useSicht();
  // Im Verein gibt es keine Leads (seit 26.10.19); Firma und Kontakt
  // heißen dort Mannschaft und Person.
  const b = useBegriffe();
  const ziele = NEU_ZIELE
    .filter((z) => !eingeschraenkt || z.pfad === "/kontakte" || z.pfad === "/aufgaben")
    .filter((z) => b.modus !== "verein" || !NUR_VERTRIEB.includes(z.pfad))
    .map((z) => ({ ...z, text: z.pfad === "/kontakte" ? b.kontakt : z.pfad === "/firmen" ? b.firma : z.text }));

  return (
    <div className="knopfmenue" ref={wurzel}>
      <button
        type="button"
        className="btn btn-sekundaer kopf-neu"
        ref={knopf}
        aria-label="Erstellen"
        title="Erstellen"
        aria-haspopup="menu"
        aria-expanded={offen}
        aria-controls={id}
        onClick={() => setOffen((o) => !o)}
      >
        {/* Nur Plus und Pfeil, als Zweitknopf (Kai, 2.10.2026, ABGLEICH G2):
            Die Hauptaktion einer Seite steht in ihrem Kopf — „Firma
            anlegen“. Ein zweiter gefüllter Knopf hier oben machte auf jeder
            Listenseite zwei Hauptaktionen daraus. Name und Tooltip bleiben. */}
        <Plus size={20} aria-hidden="true" />
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {offen && (
        <div className="knopfmenue-feld" id={id} role="menu" ref={feld}>
          {ziele.map((z) => (
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

      {/* Ganz rechts, auf jedem Gerät an derselben Stelle (CI HB-KONTO). */}
      <Profilknopf />
    </header>
  );
}

