"use client";

// Der Weg zurück, wenn das Passwort weg ist. Zwei Wege, ein Feld:
//
// - **Datei auf der Box.** Rocket legt einen Code in seinen Datenordner.
//   Wer an die Box kommt, liest ihn dort. Dieser Weg setzt auch den
//   zweiten Faktor zurück — er ist die Rettung, wenn das Handy weg ist.
// - **Mail** (seit 26.10.1), wenn die Organisation einen Versand
//   eingerichtet hat und die Person eine Adresse hat. Wer nur das Postfach
//   hat, hat nicht das Handy: Der zweite Faktor bleibt und wird danach
//   verlangt.
//
// Diese Seite verrät nie, ob es den eingegebenen Zugang gibt. Der erste
// Schritt sieht in beiden Fällen gleich aus.

import Link from "next/link";
import { useState } from "react";
import { ApiFehler } from "@/lib/api";
import { Ablageort, ruecksetzungAnfordern, ruecksetzungEinloesen } from "@/lib/anmeldung";
import { Tor } from "@/components/tor";

export default function PasswortVergessenSeite() {
  const [name, setName] = useState("");
  const [ort, setOrt] = useState<Ablageort | null>(null);
  const [code, setCode] = useState("");
  const [passwort, setPasswort] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  function melden(e: unknown, wenn403: string) {
    const f = e as ApiFehler;
    if (f.status === 429) return "Zu viele Versuche. Bitte warten Sie eine Viertelstunde.";
    if (f.status === 403) return wenn403;
    if (f.status === 422) return f.message;
    return "Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.";
  }

  async function anfordern() {
    setFehler(null);
    setLaeuft(true);
    try {
      setOrt(await ruecksetzungAnfordern(name.trim()));
    } catch (e) {
      setFehler(melden(e, "Das hat nicht geklappt."));
    } finally {
      setLaeuft(false);
    }
  }

  async function einloesen() {
    setFehler(null);
    setLaeuft(true);
    try {
      const ergebnis = await ruecksetzungEinloesen(name.trim(), code.trim(), passwort);
      // Mit zweitem Faktor steht noch der Code aus der App aus — die
      // Anmeldeseite erkennt die Vorstufe selbst.
      window.location.assign(ergebnis.zweiter_faktor ? "/anmelden" : "/");
    } catch (e) {
      setFehler(melden(e, "Der Code stimmt nicht oder ist abgelaufen."));
      setLaeuft(false);
    }
  }

  if (ort === null) {
    return (
      <Tor
        titel="Passwort vergessen"
        unter={
          <>
            Rocket legt einen Code in seinen Datenordner auf dieser Box und schickt ihn,
            wenn Ihre Organisation Mail eingerichtet hat, auch an Ihre Adresse. Kennen Sie
            Ihren Namen nicht, tragen Sie irgendetwas ein — die Datei nennt dann die Zugänge
            dieser Box.
          </>
        }
        fehler={fehler}
        laeuft={laeuft}
        knopf="Code erzeugen"
        onSenden={anfordern}
        fuss={<Link href="/anmelden">Zurück zur Anmeldung</Link>}
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
      </Tor>
    );
  }

  return (
    <Tor
      titel="Code eingeben"
      unter={
        <>
          Nehmen Sie den Code aus Ihrer Mail — oder öffnen Sie auf dieser Box die{" "}
          <strong>Dateien</strong>-App und darin <code className="tor-kennung">{ort.ordner}</code>.
          Der Code in der Datei gilt {ort.minuten} Minuten.
        </>
      }
      fehler={fehler}
      laeuft={laeuft}
      knopf="Passwort ersetzen"
      onSenden={einloesen}
      fuss={<Link href="/anmelden">Zurück zur Anmeldung</Link>}
    >
      <div className="feld">
        <label htmlFor="tor-code">Code aus Mail oder Datei</label>
        <input
          id="tor-code"
          className="input tor-kennung"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXX-XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          autoFocus
        />
      </div>
      <div className="feld">
        <label htmlFor="tor-passwort">Neues Passwort</label>
        <input
          id="tor-passwort"
          className="input"
          type="password"
          value={passwort}
          onChange={(e) => setPasswort(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>
    </Tor>
  );
}
