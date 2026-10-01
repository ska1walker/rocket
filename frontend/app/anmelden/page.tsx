"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ApiFehler } from "@/lib/api";
import { anmelden, codeEinloesen, einrichten, lage, zielPfad } from "@/lib/anmeldung";
import { Tor } from "@/components/tor";
import { Codefeld } from "@/components/zweiter-faktor";

function Maske() {
  const parameter = useSearchParams();
  const [name, setName] = useState("");
  const [passwort, setPasswort] = useState("");
  const [code, setCode] = useState("");
  // Passwort stimmt, der Code steht aus. Auch beim Laden: Wer vom
  // Zurücksetzen kommt, hat die Vorstufe schon.
  const [codeSchritt, setCodeSchritt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  // Noch niemand hat ein Passwort: Dann gibt es nichts anzumelden, sondern
  // Rocket wird eingerichtet — mit dem Code aus dem Datenordner der Box.
  const [einrichtungOrdner, setEinrichtungOrdner] = useState<string | null>(null);
  const [wiederholt, setWiederholt] = useState("");

  useEffect(() => {
    lage()
      .then((l) => {
        if (l.zweiter_faktor) setCodeSchritt(true);
        if (l.einrichtung) setEinrichtungOrdner(l.einrichtung_ordner ?? "Data › rocket");
      })
      .catch(() => {
        /* ohne Auskunft beginnt es beim Passwort */
      });
  }, []);

  function hinein() {
    // Harter Wechsel statt `router.push`: Der Keks ist neu, und jede
    // zwischengespeicherte Antwort aus der Zeit davor ist eine Antwort
    // für jemand anderen.
    window.location.assign(zielPfad(parameter.get("weiter")));
  }

  async function codeSenden() {
    setFehler(null);
    setLaeuft(true);
    try {
      await codeEinloesen(code.trim());
      hinein();
    } catch (e) {
      const f = e as ApiFehler;
      if (f.status === 401) {
        // Die Vorstufe gilt fünf Minuten. Danach von vorn.
        setCodeSchritt(false);
        setFehler("Das hat zu lange gedauert. Bitte melden Sie sich noch einmal an.");
      } else {
        setFehler(
          f.status === 429
            ? "Zu viele Versuche. Bitte warten Sie eine Viertelstunde."
            : "Der Code stimmt nicht. Bitte nehmen Sie den aktuellen aus der App.",
        );
      }
      setCode("");
      setLaeuft(false);
    }
  }

  async function senden() {
    setFehler(null);
    setLaeuft(true);
    try {
      const ergebnis = await anmelden(name.trim(), passwort);
      if (ergebnis.zweiter_faktor) {
        setPasswort("");
        setCodeSchritt(true);
        setLaeuft(false);
        return;
      }
      hinein();
    } catch (e) {
      const f = e as ApiFehler;
      setFehler(
        f.status === 429
          ? "Zu viele Versuche. Bitte warten Sie eine Viertelstunde."
          : "Name oder Passwort stimmt nicht.",
      );
      setPasswort("");
      setLaeuft(false);
    }
  }

  async function einrichtenSenden() {
    setFehler(null);
    if (passwort !== wiederholt) {
      setFehler("Die beiden Passwörter stimmen nicht überein.");
      return;
    }
    setLaeuft(true);
    try {
      await einrichten(code.trim(), name.trim(), passwort);
      hinein();
    } catch (e) {
      const f = e as ApiFehler;
      setFehler(
        f.status === 429
          ? "Zu viele Versuche. Bitte warten Sie eine Viertelstunde."
          : f.status === 403
            ? "Der Code stimmt nicht. Bitte nehmen Sie ihn genau so aus der Datei."
            : f.status === 409
              ? "Rocket ist schon eingerichtet. Bitte laden Sie die Seite neu und melden sich an."
              : f.message,
      );
      setLaeuft(false);
    }
  }

  if (einrichtungOrdner) {
    return (
      <Tor
        titel="Rocket einrichten"
        unter={
          <>
            Noch hat niemand hier ein Passwort. Den Code finden Sie in der Dateien-App von
            Olares unter <strong>{einrichtungOrdner}</strong> — nur wer an diese Box kommt, kann
            ihn lesen. Steht dort schon ein Zugang, tragen Sie genau diesen als Namen ein.
          </>
        }
        fehler={fehler}
        laeuft={laeuft}
        knopf="Einrichten"
        onSenden={einrichtenSenden}
        fuss={<>Danach melden Sie sich mit diesem Namen und Passwort an und laden Ihr Team ein.</>}
      >
        <div className="feld">
          <label htmlFor="tor-einrichtungscode">Code aus der Datei</label>
          <input
            id="tor-einrichtungscode"
            className="input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            required
            autoFocus
          />
        </div>
        <div className="feld">
          <label htmlFor="tor-name">Name des Zugangs</label>
          <input
            id="tor-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="vorname-nachname"
            required
          />
        </div>
        <div className="feld">
          <label htmlFor="tor-passwort">Passwort</label>
          <input
            id="tor-passwort"
            className="input"
            type="password"
            value={passwort}
            onChange={(e) => setPasswort(e.target.value)}
            autoComplete="new-password"
            minLength={12}
            required
          />
        </div>
        <div className="feld">
          <label htmlFor="tor-wiederholt">Passwort wiederholen</label>
          <input
            id="tor-wiederholt"
            className="input"
            type="password"
            value={wiederholt}
            onChange={(e) => setWiederholt(e.target.value)}
            autoComplete="new-password"
            minLength={12}
            required
          />
        </div>
      </Tor>
    );
  }

  if (codeSchritt) {
    return (
      <Tor
        titel="Code eingeben"
        unter="Öffnen Sie die Authenticator-App auf Ihrem Handy und geben Sie den Code für Rocket ein."
        fehler={fehler}
        laeuft={laeuft}
        knopf="Weiter"
        onSenden={codeSenden}
        fuss={<>Handy nicht zur Hand? Geben Sie einen Ihrer Wiederherstellungscodes ein.</>}
      >
        <Codefeld id="tor-code" wert={code} setWert={setCode} autoFocus />
      </Tor>
    );
  }

  return (
    <Tor
      titel="Anmelden"
      unter="Bitte melden Sie sich an, um mit Ihrem Bestand zu arbeiten."
      fehler={fehler}
      laeuft={laeuft}
      knopf="Anmelden"
      onSenden={senden}
      fuss={
        <>
          <Link href="/passwort-vergessen">Passwort vergessen?</Link>
          <br />
          Noch kein Zugang? Der Eigentümer erzeugt Ihnen einen Einladungslink.
        </>
      }
    >
      <div className="feld">
        <label htmlFor="tor-name">Name</label>
        <input
          id="tor-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus
        />
      </div>
      <div className="feld">
        <label htmlFor="tor-passwort">Passwort</label>
        <input
          id="tor-passwort"
          className="input"
          type="password"
          value={passwort}
          onChange={(e) => setPasswort(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
    </Tor>
  );
}

export default function AnmeldeSeite() {
  // `useSearchParams` verlangt eine Grenze, sonst rendert Next die ganze
  // Seite zur Anfragezeit statt beim Bauen.
  return (
    <Suspense fallback={null}>
      <Maske />
    </Suspense>
  );
}
