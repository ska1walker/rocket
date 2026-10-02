"use client";

// Modul RK-POSTFACH — docs/MODULE.md

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { datum } from "@/lib/format";
import { Erklaerung } from "@/components/erklaerung";
import { Rueckfrage } from "@/components/dialog";
import { Fehler, Laedt } from "@/components/zustaende";
import { AlertCircle, Check } from "@/lib/symbole";

interface Anbieter {
  schluessel: string;
  name: string;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  smtp_sicherheit: "ssl" | "starttls";
  hinweis: string;
}

interface Mailkonto {
  id: string;
  anbieter: string;
  adresse: string;
  absender_name: string | null;
  benutzer: string;
  passwort_gesetzt: boolean;
  imap_host: string;
  imap_port: number;
  smtp_host: string | null;
  smtp_port: number;
  smtp_sicherheit: "ssl" | "starttls";
  ordner_ein: string;
  ordner_aus: string | null;
  aktiv: boolean;
  zuletzt: string | null;
  letzter_fehler: string | null;
  eingelesen: number;
}

interface Pruefung {
  imap: string | null;
  smtp: string | null;
  gesendet: string | null;
  ok: boolean;
}

interface Bilanz {
  gelesen: number;
  zugeordnet: number;
  privat: number;
  doppelt: number;
}

const EIGEN = "eigen";

/**
 * Mein Postfach (seit 26.10.20): Jede Person verbindet ihr eigenes Postfach.
 * Rocket liest Posteingang und Gesendet und legt nur ab, was einen Kontakt
 * betrifft — der Rest verlässt das Postfach nicht. Niemand sonst sieht diese
 * Einstellung, auch keine Verwaltung.
 */
export function MeinPostfachblock() {
  const client = useQueryClient();
  const liste = useQuery({
    queryKey: ["mailanbieter"],
    queryFn: () => api.get<{ anbieter: Anbieter[]; microsoft: string }>("/api/mailkonto/anbieter"),
    staleTime: Infinity,
  });
  const konto = useQuery({ queryKey: ["mailkonto"], queryFn: () => api.get<Mailkonto | null>("/api/mailkonto") });

  const [anbieter, setAnbieter] = useState("google");
  const [adresse, setAdresse] = useState("");
  const [name, setName] = useState("");
  const [benutzer, setBenutzer] = useState("");
  const [passwort, setPasswort] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("993");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("465");
  const [sicherheit, setSicherheit] = useState<"ssl" | "starttls">("ssl");
  const [trennen, setTrennen] = useState(false);
  const [bilanz, setBilanz] = useState<Bilanz | null>(null);

  // Gespeichertes in die Maske; eine Voreinstellung füllt die Server.
  useEffect(() => {
    const k = konto.data;
    if (!k) return;
    setAnbieter(k.anbieter);
    setAdresse(k.adresse);
    setName(k.absender_name ?? "");
    setBenutzer(k.benutzer === k.adresse ? "" : k.benutzer);
    setImapHost(k.imap_host);
    setImapPort(String(k.imap_port));
    setSmtpHost(k.smtp_host ?? "");
    setSmtpPort(String(k.smtp_port));
    setSicherheit(k.smtp_sicherheit);
  }, [konto.data]);

  // Noch nichts verbunden: Die vorgewählte Voreinstellung füllt die Server gleich.
  useEffect(() => {
    if (konto.data === null && liste.data) waehlen("google");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [konto.data, liste.data]);

  function waehlen(schluessel: string) {
    setAnbieter(schluessel);
    const a = liste.data?.anbieter.find((x) => x.schluessel === schluessel);
    if (a) {
      setImapHost(a.imap_host);
      setImapPort(String(a.imap_port));
      setSmtpHost(a.smtp_host);
      setSmtpPort(String(a.smtp_port));
      setSicherheit(a.smtp_sicherheit);
    } else {
      setImapHost("");
      setSmtpHost("");
    }
  }

  const neu = () => client.invalidateQueries({ queryKey: ["mailkonto"] });
  const speichern = useMutation({
    mutationFn: () =>
      api.put<Mailkonto>("/api/mailkonto", {
        anbieter,
        adresse: adresse.trim(),
        absender_name: name.trim() || null,
        benutzer: benutzer.trim() || null,
        passwort: passwort || null,
        imap_host: imapHost.trim() || null,
        imap_port: Number(imapPort) || null,
        smtp_host: smtpHost.trim() || null,
        smtp_port: Number(smtpPort) || null,
        smtp_sicherheit: sicherheit,
      }),
    onSuccess: () => {
      setPasswort("");
      neu();
    },
  });
  const testen = useMutation({ mutationFn: () => api.post<Pruefung>("/api/mailkonto/testen", {}) });
  const abholen = useMutation({
    mutationFn: () => api.post<Bilanz>("/api/mailkonto/abholen", {}),
    onSuccess: (b) => {
      setBilanz(b);
      neu();
    },
    onError: neu,
  });
  const loesen = useMutation({
    mutationFn: () => api.del("/api/mailkonto"),
    onSuccess: () => {
      setTrennen(false);
      setPasswort("");
      setAdresse("");
      waehlen("google");
      client.setQueryData(["mailkonto"], null);
    },
  });

  if (konto.isPending || liste.isPending) return <Laedt />;
  if (konto.isError) return <Fehler text={(konto.error as Error).message} />;
  const k = konto.data;
  const vorlage = liste.data?.anbieter.find((a) => a.schluessel === anbieter);

  return (
    <section className="block">
      <div className="block-kopf">
        <h2>Mein Postfach</h2>
        <span className="stufe" data-art={k && !k.letzter_fehler ? "won" : undefined}>
          {!k ? "nicht verbunden" : k.letzter_fehler ? "Fehler" : "verbunden"}
        </span>
      </div>
      <div className="block-inhalt">
        <Erklaerung
          kurz="Ihre Mails mit Kontakten erscheinen von selbst im Verlauf — alles andere bleibt in Ihrem Postfach."
          lang={
            <>
              Rocket liest Posteingang und Gesendet alle zwei Minuten, wie ein zweites Mailprogramm. Abgelegt wird
              nur, was ein Kontakt geschrieben hat oder was an einen Kontakt ging; von allen anderen Mails liest
              Rocket nur Absender und Empfänger, nicht einmal den Text. Nichts wird als gelesen markiert, verschoben
              oder gelöscht. Beim ersten Lauf kommen die letzten 14 Tage herein. Diese Einstellung sieht nur Sie —
              auch die Verwaltung nicht. Microsoft 365 und Outlook.com gehen vorerst nicht: Microsoft nimmt für
              IMAP kein Passwort mehr an.
            </>
          }
        />

        {k?.letzter_fehler && (
          <div className="hinweis" data-art="fehler" role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <span>{k.letzter_fehler}</span>
          </div>
        )}
        {k && !k.letzter_fehler && k.zuletzt && (
          <p className="text-leise-klein">
            Zuletzt gelesen {datum(k.zuletzt)} · {k.eingelesen} {k.eingelesen === 1 ? "Mail" : "Mails"} im Verlauf
            {k.ordner_aus ? ` · Gesendet: „${k.ordner_aus}“` : ""}
          </p>
        )}

        <form onSubmit={(e) => { e.preventDefault(); speichern.mutate(); }}>
          <div className="feld">
            <label htmlFor="pf-anbieter">Anbieter</label>
            <select className="input" id="pf-anbieter" value={anbieter} onChange={(e) => waehlen(e.target.value)}>
              {liste.data?.anbieter.map((a) => <option key={a.schluessel} value={a.schluessel}>{a.name}</option>)}
              <option value={EIGEN}>Anderer Anbieter</option>
            </select>
            <p className="feld-hinweis">{vorlage ? vorlage.hinweis : "Server und Ports finden Sie in der Hilfe Ihres Anbieters."}</p>
          </div>
          <div className="feldreihe">
            <div className="feld">
              <label htmlFor="pf-adresse">E-Mail-Adresse</label>
              <input className="input" id="pf-adresse" type="email" value={adresse} onChange={(e) => setAdresse(e.target.value)} required autoComplete="off" />
            </div>
            <div className="feld">
              <label htmlFor="pf-name">Angezeigter Name <span className="optional">optional</span></label>
              <input className="input" id="pf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Marc Bayer" />
            </div>
          </div>
          <div className="feldreihe">
            <div className="feld">
              <label htmlFor="pf-passwort">{anbieter === "google" ? "App-Passwort" : "Passwort"}</label>
              <input
                id="pf-passwort"
                type="password"
                value={passwort}
                onChange={(e) => setPasswort(e.target.value)}
                placeholder={k?.passwort_gesetzt ? "gespeichert — leer lassen" : ""}
                autoComplete="new-password"
              />
            </div>
            <div className="feld">
              <label htmlFor="pf-benutzer">Benutzer <span className="optional">wenn nicht die Adresse</span></label>
              <input className="input" id="pf-benutzer" value={benutzer} onChange={(e) => setBenutzer(e.target.value)} autoComplete="off" />
            </div>
          </div>
          <div className="feldreihe" style={{ "--spalten": "minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)" } as React.CSSProperties}>
            <div className="feld">
              <label htmlFor="pf-imap">IMAP-Server (Empfang)</label>
              <input className="input" id="pf-imap" value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="imap.ihr-anbieter.de" />
            </div>
            <div className="feld">
              <label htmlFor="pf-imap-port">Port</label>
              <input className="input" id="pf-imap-port" inputMode="numeric" value={imapPort} onChange={(e) => setImapPort(e.target.value)} />
            </div>
            <div />
          </div>
          <div className="feldreihe" style={{ "--spalten": "minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)" } as React.CSSProperties}>
            <div className="feld">
              <label htmlFor="pf-smtp">SMTP-Server (Versand)</label>
              <input className="input" id="pf-smtp" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.ihr-anbieter.de" />
            </div>
            <div className="feld">
              <label htmlFor="pf-smtp-port">Port</label>
              <input className="input" id="pf-smtp-port" inputMode="numeric" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} />
            </div>
            <div className="feld">
              <label htmlFor="pf-sicherheit">Verschlüsselung</label>
              <select className="input" id="pf-sicherheit" value={sicherheit} onChange={(e) => setSicherheit(e.target.value as "ssl" | "starttls")}>
                <option value="ssl">SSL</option>
                <option value="starttls">STARTTLS</option>
              </select>
            </div>
          </div>
          <div className="btn-reihe">
            <button type="submit" className="btn btn-primaer" disabled={!adresse.trim() || speichern.isPending}>
              {speichern.isPending ? "Speichert …" : k ? "Speichern" : "Verbinden"}
            </button>
            {k && (
              <>
                <button type="button" className="btn btn-sekundaer" onClick={() => testen.mutate()} disabled={testen.isPending}>
                  {testen.isPending ? "Prüft …" : "Verbindung testen"}
                </button>
                <button type="button" className="btn btn-sekundaer" onClick={() => abholen.mutate()} disabled={abholen.isPending}>
                  {abholen.isPending ? "Liest …" : "Jetzt lesen"}
                </button>
                <button type="button" className="btn btn-still" onClick={() => setTrennen(true)}>Trennen</button>
              </>
            )}
          </div>
        </form>

        {speichern.isError && <Fehler text={(speichern.error as Error).message} />}
        {testen.data && (
          <ul className="postfach-pruefung" role="status">
            <li>{testen.data.imap ? <AlertCircle size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />} Empfang: {testen.data.imap ?? "angemeldet"}</li>
            <li>{testen.data.smtp ? <AlertCircle size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />} Versand: {testen.data.smtp ?? "angemeldet"}</li>
            {testen.data.gesendet && <li><Check size={16} aria-hidden="true" /> Ordner „Gesendet“: {testen.data.gesendet}</li>}
          </ul>
        )}
        {testen.isError && <Fehler text={(testen.error as Error).message} />}
        {bilanz && (
          <p className="text-leise-klein" role="status">
            {bilanz.gelesen === 0
              ? "Nichts Neues."
              : `${bilanz.gelesen} neue ${bilanz.gelesen === 1 ? "Mail" : "Mails"} angesehen, ${bilanz.zugeordnet} im Verlauf abgelegt, ${bilanz.privat} nicht zu Kontakten.`}
          </p>
        )}
        {abholen.isError && <Fehler text={(abholen.error as Error).message} />}

        {trennen && (
          <Rueckfrage
            titel="Postfach trennen?"
            label="Trennen bestätigen"
            text="Rocket liest Ihr Postfach dann nicht mehr und vergisst das Passwort. Was schon im Verlauf steht, bleibt."
            beiSchliessen={() => setTrennen(false)}
            knopf={<button type="button" className="btn btn-gefahr" onClick={() => loesen.mutate()} disabled={loesen.isPending}>Postfach trennen</button>}
          >
            {loesen.isError && <Fehler text={(loesen.error as Error).message} />}
          </Rueckfrage>
        )}
      </div>
    </section>
  );
}
