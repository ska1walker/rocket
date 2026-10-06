"use client";

// Modul HB-NAVIGATION — docs/MODULE.md

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bookmark,
  Building2,
  CheckSquare,
  Ellipsis,
  FileText,
  Handshake,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Lightbulb,
  ListChecks,
  Megaphone,
  MessageCircleQuestion,
  MessagesSquare,
  TrendingUp,
  Users,
} from "@/lib/symbole";
import type { SymbolKomponente } from "@/components/symbol";
import { useEffect, useRef, useState } from "react";
import { Assistent } from "@/components/assistent";
import { useNavigationKlapp } from "@/components/navigation";
import { Kopfleiste } from "@/components/kopfleiste";
import {
  gruppenFuer,
  istAktiv,
  offenFuerEingeschraenkt,
  leisteZiele,
  mobilRest,
  mobilZiele,
  type NavZeichen,
  type NavZiel,
} from "@/lib/navigation";
import { useFavoriten } from "@/lib/wer";
import { useSicht } from "@/lib/sicht";
import { useBegriffe } from "@/lib/modus";
import { Laedt, Leer } from "@/components/zustaende";

// Die Hülle hat drei Bereiche: Navigation, Inhalt, Ablage. Die Ablage
// trägt Kontext zum gewählten Ding und ist nie eine zweite Inhaltsspalte —
// die Seiten liefern sie über <aside class="huelle-ablage">.
//
// Die Navigation selbst steht in lib/navigation.ts als Daten; hier hängen
// nur die Symbole daran.
const ZEICHEN: Record<NavZeichen, SymbolKomponente> = {
  start: LayoutDashboard,
  leads: Handshake,
  angebote: FileText,
  prognose: TrendingUp,
  aufgaben: CheckSquare,
  firmen: Building2,
  kontakte: Users,
  listen: ListChecks,
  eingang: Inbox,
  besprechungen: MessagesSquare,
  tickets: LifeBuoy,
  kampagnen: Megaphone,
  fragen: MessageCircleQuestion,
  erkenntnisse: Lightbulb,
};

export function Huelle({ children }: { children: React.ReactNode }) {
  const aktuell = usePathname();
  const { favoriten, umschalten } = useFavoriten();
  const [eingeklappt, klappen] = useNavigationKlapp();
  const [mobilMehr, setMobilMehr] = useState(false);
  const [feldOffen, setFeldOffen] = useState(false);
  const mehrKnopf = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const { eingeschraenkt } = useSicht();
  const b = useBegriffe();
  // Start rechnet über den ganzen Bestand; wer eingeschränkt ist, beginnt
  // bei den Kontakten (seit 26.10.17). Im Verein ebenso: Start zeigt die
  // Pipeline, und die gibt es dort nicht (seit 26.10.19).
  const verschlossen = eingeschraenkt && !offenFuerEingeschraenkt(aktuell);
  const ohneStart = aktuell === "/" && (verschlossen || b.modus === "verein");
  useEffect(() => {
    setMobilMehr(false);
    setFeldOffen(false);
  }, [aktuell]);
  useEffect(() => {
    if (ohneStart) router.replace("/kontakte");
  }, [ohneStart, router]);

  function feldSchliessen(fokus = true) {
    setFeldOffen(false);
    if (fokus) mehrKnopf.current?.focus();
  }

  // Die Anmeldeseiten stehen ohne Hülle da: keine Navigation, kein
  // Konto-Fuß, keine Abfragen. Alles davon setzte voraus, dass jemand
  // angemeldet ist — und genau das ist dort noch offen. (Die Prüfung steht
  // **nach** allen Haken, damit React sie in jedem Anlauf gleich zählt.)
  if (
    aktuell === "/anmelden"
    || aktuell === "/passwort-vergessen"
    || aktuell === "/zweiter-faktor"
    || aktuell.startsWith("/einladung/")
  ) {
    return <>{children}</>;
  }

  return (
    <div className="huelle">
      <Kopfleiste eingeklappt={eingeklappt} klappen={klappen} />

      <nav className="huelle-nav" aria-label="Hauptnavigation">
        {/* Die Leiste: Favoriten — oder die Vorgabe, solange es keine gibt.
            Alles andere steht hinter „Mehr“, wie bei HubSpot. */}
        <NavGruppe ziele={leisteZiele(favoriten, eingeschraenkt, b)} aktuell={aktuell} favoriten={favoriten} umschalten={umschalten} eingeklappt={eingeklappt === true} />
        <div className="huelle-nav-gruppe">
          <button
            ref={mehrKnopf}
            type="button"
            className={`huelle-nav-item huelle-mehr-knopf${feldOffen ? " aktiv" : ""}`}
            aria-expanded={feldOffen}
            aria-controls="huelle-mehr"
            aria-haspopup="dialog"
            title={eingeklappt === true ? "Mehr" : undefined}
            onClick={() => setFeldOffen((o) => !o)}
          >
            <Ellipsis size={20} aria-hidden="true" />
            <span>Mehr</span>
          </button>
        </div>
        {feldOffen && (
          <MehrFeld eingeschraenkt={eingeschraenkt} aktuell={aktuell} favoriten={favoriten} umschalten={umschalten} schliessen={feldSchliessen} knopf={mehrKnopf} />
        )}

        {/* Unten steht nichts: Einstellungen und Konto sind im Profil oben
            rechts (CI G8, seit 26.10.22). */}

        {/* Die schmale Leiste unten: Favoriten oder die Vorgabe, dazu „Mehr“. */}
        <div className="huelle-nav-mobil">
          {mobilZiele(favoriten, eingeschraenkt, b).map((z) => (
            <NavLink key={z.pfad} ziel={z} aktuell={aktuell} />
          ))}
          <button
            type="button"
            className={`huelle-nav-item${mobilMehr ? " aktiv" : ""}`}
            aria-expanded={mobilMehr}
            aria-controls="huelle-nav-mehr"
            onClick={() => setMobilMehr((o) => !o)}
          >
            <Ellipsis size={20} aria-hidden="true" />
            <span>Mehr</span>
          </button>
        </div>
        {mobilMehr && (
          <div className="huelle-nav-mehr" id="huelle-nav-mehr" role="group" aria-label="Weitere Bereiche">
            {mobilRest(favoriten, eingeschraenkt, b).map((z) => (
              <NavLink key={z.pfad} ziel={z} aktuell={aktuell} />
            ))}
          </div>
        )}

      </nav>

      <main className="huelle-inhalt">
        {ohneStart ? (
          <Laedt />
        ) : !verschlossen ? (
          children
        ) : (
          // Der Server sagte hier ohnehin 403; die Seite sagt es vorher und
          // in einem Satz, statt in jedem Block einen Fehler zu zeigen.
          <Leer
            titel="Dieser Bereich ist nicht freigegeben"
            text={`Sie sehen die ${b.kontakte}, Aufgaben, Listen und ${b.kampagnen} der ${b.firmenDativ}, für die Sie Zugriff haben. Weitere Bereiche gibt Ihnen die Leitung frei.`}
          />
        )}
      </main>
      <Assistent />
    </div>
  );
}

/**
 * „Mehr“: alle Bereiche in vier Gruppen nebeneinander, je Eintrag der
 * Lesezeichen. Ein Feld, kein Untermenü — bei vierzehn Zielen ist alles auf
 * einen Blick da. Escape, ein Klick außerhalb oder ein Seitenwechsel
 * schließen es; der Fokus kehrt zum Knopf zurück.
 */
function MehrFeld({
  eingeschraenkt,
  aktuell,
  favoriten,
  umschalten,
  schliessen,
  knopf,
}: {
  eingeschraenkt: boolean;
  aktuell: string;
  favoriten: string[];
  umschalten: (pfad: string) => void;
  schliessen: (fokus?: boolean) => void;
  knopf: React.RefObject<HTMLButtonElement | null>;
}) {
  const wurzel = useRef<HTMLDivElement>(null);

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

  const spalten = gruppenFuer(eingeschraenkt, useBegriffe());

  return (
    <div className="huelle-mehr" id="huelle-mehr" role="dialog" aria-label="Alle Bereiche" ref={wurzel}>
      <p className="huelle-mehr-hinweis">Das Lesezeichen merkt einen Bereich in der Leiste.</p>
      <div className="huelle-mehr-spalten">
        {spalten.map((g) => (
          <NavGruppe key={g.titel} titel={g.titel} ziele={g.ziele} aktuell={aktuell} favoriten={favoriten} umschalten={umschalten} eingeklappt={false} />
        ))}
      </div>
    </div>
  );
}

function NavLink({ ziel, aktuell, eingeklappt = false }: { ziel: NavZiel; aktuell: string; eingeklappt?: boolean }) {
  const Zeichen = ZEICHEN[ziel.zeichen];
  const aktiv = istAktiv(ziel.pfad, aktuell);
  return (
    <Link
      href={ziel.pfad}
      className={`huelle-nav-item${aktiv ? " aktiv" : ""}`}
      aria-current={aktiv ? "page" : undefined}
      title={eingeklappt ? ziel.text : undefined}
    >
      <Zeichen size={20} aria-hidden="true" />
      <span>{ziel.text}</span>
    </Link>
  );
}

/**
 * Eine Gruppe: Überschrift und Einträge. Das Lesezeichen steht **neben** dem
 * Link, nicht darin — ein Knopf in einem Link ist kein gültiges HTML.
 */
function NavGruppe({
  titel,
  ziele,
  aktuell,
  favoriten,
  umschalten,
  eingeklappt,
}: {
  titel?: string;
  ziele: NavZiel[];
  aktuell: string;
  favoriten: string[];
  umschalten: (pfad: string) => void;
  eingeklappt: boolean;
}) {
  const id = titel ? `huelle-nav-${titel.toLowerCase()}` : undefined;
  return (
    <div className="huelle-nav-gruppe" role="group" aria-labelledby={id}>
      {titel && <p className="huelle-nav-titel" id={id}>{titel}</p>}
      {ziele.map((z) => {
        const istFavorit = favoriten.includes(z.pfad);
        return (
          <div key={z.pfad} className={`huelle-nav-eintrag${istFavorit ? " ist-favorit" : ""}`}>
            <NavLink ziel={z} aktuell={aktuell} eingeklappt={eingeklappt} />
            <button
              type="button"
              className="huelle-nav-stern"
              aria-pressed={istFavorit}
              aria-label={istFavorit ? `${z.text} als Favorit entfernen` : `${z.text} als Favorit merken`}
              title={istFavorit ? "Favorit entfernen" : "Als Favorit merken"}
              onClick={() => umschalten(z.pfad)}
            >
              <Bookmark size={16} fill={istFavorit ? "currentColor" : "none"} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
