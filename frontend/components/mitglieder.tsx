"use client";

// Modul RK-EINSTELLUNGEN — docs/MODULE.md

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, KeyRound, Pencil, ShieldCheck, UserMinus } from "@/lib/symbole";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { lage, passwortAendern } from "@/lib/anmeldung";
import { datum } from "@/lib/format";
import type { Mitglied, Wer } from "@/lib/typen";
import { Fehler, Laedt } from "@/components/zustaende";
import { Erklaerung } from "@/components/erklaerung";
import { SichtDialog } from "@/components/sicht-verwalten";

export function Mitgliederblock() {
  const client = useQueryClient();
  const [name, setName] = useState("");
  // Welche Zeile gerade umbenannt wird, und der Entwurf des Namens.
  const [bearbeitet, setBearbeitet] = useState<string | null>(null);
  const [entwurf, setEntwurf] = useState("");
  // Wessen Sicht gerade im Dialog steht.
  const [sichtFuer, setSichtFuer] = useState<Mitglied | null>(null);

  const mitglieder = useQuery({
    queryKey: ["mitglieder"],
    queryFn: () => api.get<Mitglied[]>("/api/mitglieder"),
  });

  const wer = useQuery({
    queryKey: ["wer"],
    queryFn: () => api.get<Wer>("/api/mitglieder/wer"),
  });

  const anlegen = useMutation({
    mutationFn: () => api.post<Mitglied>("/api/mitglieder", { display_name: name }),
    onSuccess: () => {
      setName("");
      client.invalidateQueries({ queryKey: ["mitglieder"] });
    },
  });

  const umbenennen = useMutation({
    mutationFn: ({ id, display_name }: { id: string; display_name: string }) =>
      api.patch<Mitglied>(`/api/mitglieder/${id}`, { display_name }),
    onSuccess: () => {
      setBearbeitet(null);
      client.invalidateQueries({ queryKey: ["mitglieder"] });
      client.invalidateQueries({ queryKey: ["wer"] });
    },
  });

  // Rollen vergibt nur die Eigentümerin. Ohne diesen Weg hieß Hilfe auf
  // einer fremden Box: „gib mir dein Passwort" — jede angelegte Person
  // war fest `member` und sah die Einstellungen nicht.
  const rolleSetzen = useMutation({
    mutationFn: ({ id, role }: { id: string; role: "admin" | "member" | "viewer" }) =>
      api.patch<Mitglied>(`/api/mitglieder/${id}/rolle`, { role }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["mitglieder"] }),
  });

  const entfernen = useMutation({
    mutationFn: (id: string) => api.del(`/api/mitglieder/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["mitglieder"] }),
  });

  // Der Link kommt zurück und wird **einmal** angezeigt. Er landet
  // absichtlich in keiner Liste und in keiner Mail: Wer ihn hat, setzt das
  // Passwort, und ein Zugang, der am Mailversand hängt, wäre genau dann
  // nicht da, wenn eine frische Box noch kein SMTP kennt.
  const [kopiert, setKopiert] = useState(false);
  const feld = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState<
    { fuer: string; kennung: string; adresse: string; tage: number; uebernahme: boolean } | null
  >(null);
  const einladen = useMutation({
    mutationFn: async (id: string) => {
      const a = await api.post<{ pfad: string; name: string; gilt_tage: number }>(
        `/api/mitglieder/${id}/einladung`,
      );
      const person = mitglieder.data?.find((m) => m.id === id);
      return { ...a, kennung: person?.olares_username ?? "", uebernahme: person?.passwort_gesetzt ?? false };
    },
    onSuccess: (a) => {
      setKopiert(false);
      setLink({
        fuer: a.name,
        kennung: a.kennung,
        adresse: `${window.location.origin}${a.pfad}`,
        tage: a.gilt_tage,
        uebernahme: a.uebernahme,
      });
    },
  });

  // Nur die Eigentümerin. Ein Verwalter darf schon alles, was die
  // Einstellungen schützen; dürfte er auch Rollen setzen, könnte er die
  // Eigentümerin herabstufen und sich die Organisation aneignen.
  const darfRollen = wer.data?.rolle === "owner";
  // Sicht vergibt, wer verwaltet und selbst alles sieht (auth.verwaltet).
  const darfSicht = (wer.data?.rolle === "owner" || wer.data?.rolle === "admin") && wer.data?.sicht !== "eingeschraenkt";
  // Umbenennen, Einladen, Entfernen und Hinzufügen sind Sache der Verwaltung
  // (auth.verwaltet) — anderen bietet die Tabelle sie nicht erst an.
  const darfVerwalten = darfSicht;

  if (mitglieder.isPending) return <Laedt />;

  return (
    <section className="block">
      <div className="block-kopf">
        <h2>Wer hier arbeitet</h2>
        {wer.data && (
          <span className="text-leise-klein">
            Zugang: {wer.data.login_username}
          </span>
        )}
      </div>
      <div className="block-inhalt">
        <Erklaerung kurz="Wer mit Ihnen in Rocket arbeitet — und was jede Person sieht." lang={<>Jede Person meldet sich mit
          eigenem Namen und Passwort an — dazu gibt es den Einladungslink. Was sie anlegt,
          gehört ihr; das Protokoll nennt sie. Unter „Sicht“ legen Sie fest, ob jemand alles
          sieht oder nur die Kontakte bestimmter Firmen und Bereiche. „Nur lesen“ ändert nichts.</>} />

        <table className="tabelle mitgliedertabelle" style={{ marginBottom: "var(--am-raum-4)" }}>
          <thead>
            <tr>
              <th>Person</th>
              <th>Zugang</th>
              <th>Rolle</th>
              <th><span className="nur-vorleser">Aktionen</span></th>
            </tr>
          </thead>
          <tbody>
            {mitglieder.data!.map((m) => (
              <tr key={m.id}>
                <td className="haupt">
                  {bearbeitet === m.id ? (
                    <form
                      style={{ display: "flex", gap: "var(--am-raum-2)", alignItems: "center" }}
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (entwurf.trim().length >= 2) umbenennen.mutate({ id: m.id, display_name: entwurf });
                      }}
                    >
                      <input
                        aria-label="Name der Person"
                        value={entwurf}
                        onChange={(e) => setEntwurf(e.target.value)}
                        autoFocus
                        style={{ minWidth: 0 }}
                      />
                      <button type="submit" className="btn btn-primaer btn-klein" disabled={entwurf.trim().length < 2 || umbenennen.isPending}>
                        Speichern
                      </button>
                      <button type="button" className="btn btn-still btn-klein" onClick={() => setBearbeitet(null)}>
                        Abbrechen
                      </button>
                    </form>
                  ) : (
                    <span className="mitglied-name">
                      <span className="mitglied-name-zeile">
                        {m.display_name ?? m.olares_username}
                      {darfVerwalten && <button
                        type="button"
                        className="btn btn-still btn-klein"
                        aria-label={`${m.display_name ?? m.olares_username} umbenennen`}
                        title={`${m.display_name ?? m.olares_username} umbenennen`}
                        onClick={() => {
                          setBearbeitet(m.id);
                          setEntwurf(m.display_name ?? "");
                        }}
                      >
                        <Pencil size={16} aria-hidden="true" />
                      </button>}
                      </span>
                      {/* Die Kennung ist der Name, mit dem sich diese Person
                          anmeldet — sie gehört unter den Anzeigenamen, nicht
                          in eine eigene Spalte. */}
                      <span className="mitglied-kennung">{m.olares_username}</span>
                    </span>
                  )}
                </td>
                <td>
                  {/* Zugangsart und „zuletzt hier" gehören zusammen: beides
                      sagt etwas über den Zugang dieser Person. Die Rolle
                      nicht — die bekommt eine eigene Spalte, weil sie hier
                      als Bedienelement steht und keine Aussage ist. */}
                  <span className="mitglied-zugang">
                    <span className="stufe" data-art={m.passwort_gesetzt ? "won" : undefined}>
                      {m.passwort_gesetzt ? "Passwort" : m.zugang === "olares" ? "Box-Konto" : "eingeladen"}
                    </span>
                    {m.passwort_gesetzt && (
                      <span className="stufe" data-art={m.zweiter_faktor ? "won" : undefined}>
                        {m.zweiter_faktor ? "zweiter Faktor" : "ohne zweiten Faktor"}
                      </span>
                    )}
                    <span className="mitglied-zuletzt">
                      {m.last_seen_at ? `zuletzt ${datum(m.last_seen_at)}` : "noch nie hier"}
                    </span>
                  </span>
                </td>
                <td>
                  {darfRollen && m.role !== "owner" ? (
                    <select
                      className="mitglied-rolle"
                      aria-label={`Rolle von ${m.display_name ?? m.olares_username}`}
                      value={m.role === "admin" || m.role === "viewer" ? m.role : "member"}
                      disabled={rolleSetzen.isPending}
                      onChange={(e) =>
                        rolleSetzen.mutate({
                          id: m.id,
                          role: e.target.value as "admin" | "member" | "viewer",
                        })
                      }
                    >
                      <option value="member">Mitglied</option>
                      <option value="viewer">Nur lesen</option>
                      <option value="admin">Verwalter</option>
                    </select>
                  ) : (
                    <span className="mitglied-rolle-fest">{ROLLENTEXT[m.role] ?? m.role}</span>
                  )}
                  {/* Die Sicht gehört zur Rolle: beides sagt, was die Person darf. */}
                  {darfSicht ? (
                    <button
                      type="button"
                      className="btn btn-still btn-klein mitglied-sicht"
                      onClick={() => setSichtFuer(m)}
                      aria-label={`Sicht von ${m.display_name ?? m.olares_username} festlegen`}
                    >
                      <Eye size={16} aria-hidden="true" />
                      {m.sicht === "eingeschraenkt" ? "eingeschränkt" : "alles"}
                      {/* Seit 26.10.18: sieht auch vertrauliche Felder. */}
                      {m.vertraulich_sehen && m.role !== "owner" && m.role !== "admin" && (
                        <span className="mitglied-sicht-schloss" title="sieht vertrauliche Felder">
                          <ShieldCheck size={16} aria-hidden="true" />
                        </span>
                      )}
                    </button>
                  ) : (
                    m.sicht === "eingeschraenkt" && <span className="mitglied-zuletzt mitglied-sicht-text">sieht eingeschränkt</span>
                  )}
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {/* Beide Handlungen als Zeichen.
                      Gemessen auf der Box: Mit dem Wort „Entfernen" war die
                      Tabelle 744 px breit, ihr Rahmen 638 — der Schlüssel der
                      ersten Zeile stand bei 697 und war damit unsichtbar,
                      ausgerechnet für die Person, die ihn zuerst braucht. */}
                  {darfVerwalten && <button
                    type="button"
                    className="btn btn-still btn-klein"
                    title="Einladungslink erzeugen — damit setzt diese Person ihr Passwort"
                    aria-label={`Einladungslink für ${m.display_name ?? m.olares_username} erzeugen`}
                    onClick={() => einladen.mutate(m.id)}
                    disabled={einladen.isPending}
                  >
                    <KeyRound size={16} aria-hidden="true" />
                  </button>}
                  {darfVerwalten && m.zugang === "sitzplatz" && m.id !== wer.data?.user_id && (
                    <button
                      type="button"
                      className="btn btn-still btn-klein"
                      title="Aus der Organisation entfernen"
                      aria-label={`${m.display_name ?? m.olares_username} aus der Organisation entfernen`}
                      onClick={() => entfernen.mutate(m.id)}
                    >
                      <UserMinus size={16} aria-hidden="true" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {sichtFuer && <SichtDialog mitglied={sichtFuer} beiSchliessen={() => setSichtFuer(null)} />}

        {link && (
          <div className="einladung-ausgabe">
            <p className="einladung-fuer">
              Einladung für <span className="mono">{link.kennung}</span>
              {link.fuer && link.fuer !== link.kennung ? <> ({link.fuer})</> : null}
            </p>
            {/* Wer schon ein Passwort hat, bekommt keinen Zugang, sondern
                einen neuen — der alte gilt danach nicht mehr. Das ist der
                Rettungsweg des Eigentümers, und es ist ein Eingriff. */}
            {link.uebernahme && (
              <p className="feld-hinweis" style={{ margin: "0 0 var(--am-raum-2)" }}>
                <strong>Achtung:</strong> Diese Person hat bereits ein Passwort. Wer den Link
                einlöst, <strong>ersetzt</strong> es — der bisherige Zugang gilt dann nicht mehr.
              </p>
            )}
            <div className="einladungslink">
              <input
                ref={feld}
                className="input"
                readOnly
                value={link.adresse}
                onFocus={(e) => e.target.select()}
                aria-label={`Einladungslink für ${link.fuer}`}
              />
              <button
                type="button"
                className="btn btn-sekundaer btn-klein einladung-kopieren"
                onClick={async () => {
                  // „Kopiert" erst sagen, wenn es wirklich geklappt hat. Die
                  // Zwischenablage darf verweigern (fehlender Fokus, fehlende
                  // Berechtigung); dann bleibt der Text markiert und Strg-C hilft.
                  try {
                    await navigator.clipboard.writeText(link.adresse);
                    setKopiert(true);
                  } catch {
                    setKopiert(false);
                    feld.current?.select();
                  }
                }}
              >
                <Copy size={16} aria-hidden="true" /> {kopiert ? "Kopiert" : "Kopieren"}
              </button>
            </div>
            {/* Der Klartext des Tokens existiert genau einmal, hier. Gespeichert
                wird nur sein SHA-256 — sonst könnte sich jeder mit Zugriff auf
                die Datenbank damit anmelden. Wer die Seite neu lädt, bekommt
                ihn deshalb nicht zurück, sondern muss einen neuen erzeugen. */}
            <p className="feld-hinweis" style={{ margin: "var(--am-raum-2) 0 0" }}>
              <strong>Jetzt kopieren.</strong> Dieser Link steht nur hier und ist nach
              einem Neuladen der Seite verloren — gespeichert wird nur seine Prüfsumme.
              Er gilt {link.tage} Tage und <strong>genau einmal</strong>; ein neuer Link
              entwertet diesen.
            </p>
          </div>
        )}

        {entfernen.isError && <Fehler text={(entfernen.error as Error).message} />}
        {einladen.isError && <Fehler text={(einladen.error as Error).message} />}
        {umbenennen.isError && <Fehler text={(umbenennen.error as Error).message} />}

        {darfVerwalten && <form
          style={{ display: "flex", gap: "var(--am-raum-2)", alignItems: "flex-end" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2) anlegen.mutate();
          }}
        >
          <div className="feld" style={{ flex: 1, marginBottom: 0 }}>
            <label htmlFor="mitgliedname">Person hinzufügen</label>
            <input
              id="mitgliedname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Marc Bayer"
            />
            <p className="feld-hinweis">
              Aus dem Namen wird der Anmeldename. Danach erzeugen Sie mit dem Schlüssel einen
              Einladungslink; damit setzt die Person ihr Passwort.
            </p>
          </div>
          <button
            type="submit"
            className="btn btn-primaer"
            disabled={name.trim().length < 2 || anlegen.isPending}
          >
            {anlegen.isPending ? "Legt an …" : "Hinzufügen"}
          </button>
        </form>}
        {anlegen.isError && <Fehler text={(anlegen.error as Error).message} />}

        <p style={{ fontSize: "0.75rem", color: "var(--am-text-gedaempft)", marginTop: "var(--am-raum-3)" }}>
          Wer nicht eingeschränkt ist, sieht alles; Besitz ist Arbeitsteilung, keine Schranke.
          Der Name lässt sich für jede Person ändern, auch für den Olares-Zugang selbst — die
          Kennung bleibt.
        </p>
      </div>
    </section>
  );
}

/**
 * Das eigene Passwort ändern.
 *
 * Steht nur da, wenn es ein Passwort gibt — im Modus `olares` prüft der
 * Sidecar, und Rocket hätte nichts zu ändern. Das alte wird verlangt:
 * Sonst genügte ein fremder, offener Browser, um jemanden auszusperren.
 */
export function Passwortblock() {
  const [alt, setAlt] = useState("");
  const [neu, setNeu] = useState("");
  const [wieder, setWieder] = useState("");
  const [meldung, setMeldung] = useState<string | null>(null);

  const stand = useQuery({ queryKey: ["anmeldelage"], queryFn: lage, staleTime: 60_000 });

  const aendern = useMutation({
    mutationFn: () => passwortAendern(alt, neu),
    onSuccess: () => {
      setAlt("");
      setNeu("");
      setWieder("");
      setMeldung("Geändert. Andere Geräte wurden abgemeldet.");
    },
  });

  if (!stand.data?.angemeldet) return null;

  const bereit = alt.length > 0 && neu.length >= 12 && neu === wieder;

  return (
    <section className="block">
      <div className="block-kopf">
        <h2>Ihr Passwort</h2>
      </div>
      <div className="block-inhalt">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setMeldung(null);
            if (bereit) aendern.mutate();
          }}
        >
          <div className="feld">
            <label htmlFor="pw-alt">Bisheriges Passwort</label>
            <input id="pw-alt" className="input" type="password" autoComplete="current-password" value={alt} onChange={(e) => setAlt(e.target.value)} />
          </div>
          <div className="feld">
            <label htmlFor="pw-neu">Neues Passwort</label>
            <input id="pw-neu" className="input" type="password" autoComplete="new-password" value={neu} onChange={(e) => setNeu(e.target.value)} />
            <p className="feld-hinweis">
              Mindestens zwölf Zeichen. Eine lange Wortfolge trägt weiter als kurze
              Sonderzeichen — und ein Wechsel meldet alle anderen Geräte ab.
            </p>
          </div>
          <div className="feld">
            <label htmlFor="pw-wieder">Noch einmal</label>
            <input id="pw-wieder" className="input" type="password" autoComplete="new-password" value={wieder} onChange={(e) => setWieder(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primaer" disabled={!bereit || aendern.isPending}>
            {aendern.isPending ? "Ändert …" : "Passwort ändern"}
          </button>
        </form>
        {aendern.isError && <Fehler text={(aendern.error as Error).message} />}
        {meldung && <p className="feld-hinweis">{meldung}</p>}
      </div>
    </section>
  );
}

/** Was eine Rolle im Satz heißt. „viewer“ liest seit 26.10.15 nur. */
const ROLLENTEXT: Record<string, string> = {
  owner: "Eigentümerin",
  admin: "Verwalter",
  member: "Mitglied",
  viewer: "Nur lesen",
};
