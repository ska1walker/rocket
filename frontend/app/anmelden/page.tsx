"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ApiFehler } from "@/lib/api";
import { anmelden, codeEinloesen, lage, zielPfad } from "@/lib/anmeldung";
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

  useEffect(() => {
    lage()
      .then((l) => {
        if (l.zweiter_faktor) setCodeSchritt(true);
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
