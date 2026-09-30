"use client";

// Die Pflichtseite: Die Organisation verlangt einen zweiten Faktor, und
// diese Person hat noch keinen. Bis er eingerichtet ist, antwortet jeder
// andere Aufruf mit 403 — `lib/api.ts` führt dann hierher.
//
// Ohne Hülle wie die Anmeldeseiten: Navigation und Kopfleiste stellten
// Abfragen, die hier ohnehin abgewiesen würden.

import { abmelden } from "@/lib/anmeldung";
import { Marke } from "@/components/marke";
import { FaktorEinrichtung } from "@/components/zweiter-faktor";

export default function ZweiterFaktorSeite() {
  return (
    <main className="tor">
      <div className="tor-karte">
        <div className="tor-marke">
          <Marke />
          <span className="marke-produkt">Rocket</span>
        </div>

        <h1 className="tor-titel">Zweiten Faktor einrichten</h1>
        <p className="tor-unter">
          Ihre Organisation verlangt nach dem Passwort einen Code aus einer App auf Ihrem
          Handy. Das dauert eine Minute; danach geht es weiter wie gewohnt.
        </p>

        {/* Harter Wechsel: Jede Antwort im Speicher stammt aus der Zeit
            davor und war ein 403. */}
        <FaktorEinrichtung fertig={() => window.location.assign("/")} />

        <p className="tor-fuss">
          <button
            type="button"
            className="btn btn-still btn-klein"
            onClick={async () => {
              await abmelden();
              window.location.assign("/anmelden");
            }}
          >
            Abmelden
          </button>
        </p>
      </div>
    </main>
  );
}
