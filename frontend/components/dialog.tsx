"use client";

// Modul HB-DIALOG — docs/MODULE.md

// Der Rahmen jedes Anlegen- und Bearbeiten-Dialogs: Schicht, Karte, Kopf mit
// Titel und Schließen-Kreuz, darunter ein Formular. Stand bis 26.9.6 in jeder
// Datei einzeln — mit leicht verschiedenen Breiten, und drei Dialoge hatten
// die Tastaturführung vergessen. Jetzt steckt beides hier.
//
// Die Kinder sind Mitte und Fuß: `.dialog-koerper` (rollt allein) und
// `.dialog-fuss` (bleibt stehen, darin die Knöpfe).

import { X } from "@/lib/symbole";
import { useDialogfalle } from "@/components/dialogfalle";

export function Dialog({
  titel,
  label,
  breite = "normal",
  beiSchliessen,
  beiSenden,
  children,
}: {
  titel: string;
  /** Was ein Vorleser hört, wenn es vom sichtbaren Titel abweicht. */
  label?: string;
  breite?: "normal" | "schmal" | "breit";
  beiSchliessen: () => void;
  /** Enter im Formular oder der Senden-Knopf im Fuß. */
  beiSenden: () => void;
  children: React.ReactNode;
}) {
  const falle = useDialogfalle(beiSchliessen);
  return (
    <div className="dialog-schicht" role="dialog" aria-modal="true" aria-label={label ?? titel} ref={falle}>
      <div className="karte dialog-karte" data-breite={breite}>
        <div className="dialog-kopf">
          <h2>{titel}</h2>
          <button type="button" className="dialog-zu" aria-label="Schließen" onClick={beiSchliessen}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <form
          className="dialog-form"
          onSubmit={(e) => {
            e.preventDefault();
            beiSenden();
          }}
        >
          {children}
        </form>
      </div>
    </div>
  );
}

/**
 * Eine Rückfrage vor einem Schritt mit Folgen — löschen, als verloren
 * vermerken. Schmaler als ein Dialog, ohne Formular. Bei `vorsicht` steht der
 * Fokus zuerst auf „Abbrechen", damit ein Enter nichts löscht.
 */
export function Rueckfrage({
  titel,
  label,
  text,
  beiSchliessen,
  knopf,
  vorsicht = true,
  children,
}: {
  titel: React.ReactNode;
  label: string;
  /** Der Satz unter dem Titel — was geschieht, wenn man bestätigt. */
  text?: React.ReactNode;
  beiSchliessen: () => void;
  /** Der bestätigende Knopf, fertig gebaut (mit Zustand „läuft"). */
  knopf: React.ReactNode;
  vorsicht?: boolean;
  /** Felder zwischen Satz und Knöpfen, etwa ein Ziel oder ein Grund. */
  children?: React.ReactNode;
}) {
  const falle = useDialogfalle(beiSchliessen);
  return (
    <div className="dialog-schicht" role="dialog" aria-modal="true" aria-label={label} ref={falle}>
      <div className="karte rueckfrage">
        <h2>{titel}</h2>
        {text && <p className="rueckfrage-text">{text}</p>}
        {children}
        <div className="btn-reihe">
          {knopf}
          <button type="button" className="btn btn-still" data-autofokus={vorsicht ? "" : undefined} onClick={beiSchliessen}>
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}
