"use client";

// Modul HB-EINSTELLUNGEN — docs/MODULE.md

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, Cpu, Database, Info, Mail, SlidersHorizontal, TrendingUp, Users } from "@/lib/symbole";
import { lage } from "@/lib/anmeldung";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { OrgSettings, Wer } from "@/lib/typen";
import { Seitenkopf } from "@/components/seitenkopf";
import { Fehler, Laedt } from "@/components/zustaende";
import { Erklaerung } from "@/components/erklaerung";
import { Sicherungsblock } from "@/components/sicherung";
import { Absenderblock } from "@/components/absender";
import { InsiloAblageblock } from "@/components/insilo-ablage";
import { Quellenblock } from "@/components/quellen";
import { ApiSchluesselblock } from "@/components/api-schluessel";
import { Postfachblock } from "@/components/postfach";
import { Mitgliederblock, Passwortblock } from "@/components/mitglieder";
import { Geraeteblock } from "@/components/geraete";
import { Faktorblock } from "@/components/zweiter-faktor";
import { Eigenschaftenblock } from "@/components/eigenschaften-verwalten";
import { Pipelinesblock } from "@/components/pipelines-verwalten";
import { Katalogblock, Verlustgruendeblock } from "@/components/katalog";
import { Postausgangblock } from "@/components/postausgang";
import { Marketingversandblock, Versandblock } from "@/components/versand";
import { Absenderkontoblock } from "@/components/absenderkonto";
import { AnreicherungEinstellungen } from "@/components/anreicherung-einstellungen";
import { Sprachausgabeblock } from "@/components/podcast";
import { Unternavigation, type UnternavGruppe } from "@/components/unternavigation";
import { Bereicheblock } from "@/components/sicht-verwalten";
import { useSicht } from "@/lib/sicht";
import { useBegriffe } from "@/lib/modus";
import type { Begriffe } from "@/lib/begriffe";
import { Modusblock } from "@/components/modus";

/**
 * Die Einstellungen in sechs Unterpunkten.
 *
 * Eine Seite mit vierzehn Blöcken untereinander liest niemand. Jeder
 * Unterpunkt trägt, was zusammengehört; jeder Block sagt in einem Satz,
 * wozu er da ist, und hält das Kleingedruckte hinter dem Symbol.
 */
const BEREICHE = [
  { schluessel: "firma", text: "Firma und Team", beschreibung: "Firmendaten, Team, Passwort, zweiter Faktor, Geräte", symbol: Users },
  { schluessel: "vertrieb", text: "Vertrieb", beschreibung: "Pipelines und Stufen, Produktkatalog, Verlustgründe", symbol: TrendingUp },
  { schluessel: "eigenschaften", text: "Eigenschaften", beschreibung: "Felder und Gruppen für Firmen, Kontakte und Leads", symbol: SlidersHorizontal },
  { schluessel: "email", text: "E-Mail", beschreibung: "Konto, Absenderadresse, Marketing, Postfach, Relay", symbol: Mail },
  { schluessel: "ki", text: "AI und Programme", beschreibung: "Sprachmodell, Sprachausgabe, Ergänzen, Insilo, Programme, API-Schlüssel", symbol: Cpu },
  { schluessel: "daten", text: "Daten", beschreibung: "Sicherung, Import und Export, Datenbank, Datenwege", symbol: Database },
] as const;

type Bereich = (typeof BEREICHE)[number]["schluessel"];

/** Drei Gruppen wie in HubSpots Einstellungen: wer, womit verkauft wird, worauf es läuft. */
const GRUPPEN: { titel: string; schluessel: Bereich[] }[] = [
  { titel: "Konto", schluessel: ["firma"] },
  { titel: "Vertrieb", schluessel: ["vertrieb", "eigenschaften", "email"] },
  { titel: "System", schluessel: ["ki", "daten"] },
];

/** Was ein Bereich nach Modus heißt und ob es ihn gibt (seit 26.10.19):
 *  Im Verein fehlt „Vertrieb“ (Pipelines, Katalog, Verlustgründe). */
function bereicheFuer(w: Begriffe) {
  return BEREICHE
    .filter((b) => w.modus !== "verein" || b.schluessel !== "vertrieb")
    .map((b) => {
      if (b.schluessel === "firma") {
        return { ...b, text: w.firmaUndTeam, beschreibung: w.modus === "verein" ? "Modus, Team, Bereiche, Passwort, zweiter Faktor, Geräte" : b.beschreibung };
      }
      if (b.schluessel === "eigenschaften") {
        return { ...b, beschreibung: `Felder und Gruppen für ${w.firmen}, ${w.kontakte}${w.modus === "verein" ? "" : " und Leads"}` };
      }
      return b;
    });
}

function navigation(w: Begriffe, eingeschraenkt: boolean): UnternavGruppe[] {
  const bereiche = bereicheFuer(w);
  const eintrag = (k: Bereich) => {
    const b = bereiche.find((x) => x.schluessel === k);
    return b ? [{ ...b, href: `/einstellungen?bereich=${b.schluessel}` }] : [];
  };
  // Wer eingeschränkt sieht, verwaltet nichts: Für ihn gibt es nur das
  // eigene Konto (Passwort, zweiter Faktor, Geräte).
  if (eingeschraenkt) return [{ titel: "Konto", eintraege: eintrag("firma") }];
  return GRUPPEN.map((g) => ({
    titel: g.titel === "Vertrieb" && w.modus === "verein" ? "Verein" : g.titel,
    eintraege: g.schluessel.flatMap(eintrag),
  }));
}

/** Der KI-Assistent: Adresse, Modell, Schlüssel. */
function KIBlock({ e }: { e: OrgSettings }) {
  const client = useQueryClient();
  const [adresse, setAdresse] = useState(e.llm_base_url);
  const [modell, setModell] = useState(e.llm_model);
  const [schluessel, setSchluessel] = useState("");
  useEffect(() => {
    setAdresse(e.llm_base_url);
    setModell(e.llm_model);
  }, [e.llm_base_url, e.llm_model]);

  const speichern = useMutation({
    mutationFn: () =>
      api.put<OrgSettings>("/api/settings", {
        llm_base_url: adresse,
        llm_model: modell,
        // Leer heißt „nicht angefasst“ — der hinterlegte Schlüssel bleibt.
        llm_api_key: schluessel,
      }),
    onSuccess: () => {
      setSchluessel("");
      client.invalidateQueries({ queryKey: ["einstellungen"] });
      client.invalidateQueries({ queryKey: ["ki-status"] });
      // Der Anlegen-Dialog fragt denselben Stand ab — sonst sagt er noch
      // eine Minute lang „kein Sprachmodell“, obwohl gerade eins gespeichert wurde.
      client.invalidateQueries({ queryKey: ["anreicherung-status"] });
    },
  });

  return (
    <section className="block">
      <div className="block-kopf">
        <h2>Sprachmodell</h2>
        <span className="stufe" data-art={e.llm_ready ? "won" : undefined}>
          {e.llm_ready ? "eingerichtet" : "nicht eingerichtet"}
        </span>
      </div>
      <div className="block-inhalt">
        <Erklaerung
          kurz="Rocket braucht ein Sprachmodell — meist die LiteLLM-App auf dieser Box."
          lang={<>Rocket bringt kein eigenes Modell mit. Es spricht einen OpenAI-kompatiblen Endpunkt an. Es gibt bewusst keine Vorgabe: Jede geratene Adresse wäre auf einer anderen Box falsch. Solange hier nichts steht, bleiben die AI-Funktionen gesperrt und sagen das — statt in einen Verbindungsfehler zu laufen.</>}
        />
        <form onSubmit={(ev) => { ev.preventDefault(); speichern.mutate(); }}>
          <div className="feld">
            <label htmlFor="adresse">Adresse</label>
            <input id="adresse" value={adresse} onChange={(ev) => setAdresse(ev.target.value)} placeholder="https://litellm-beispiel.olares.com/v1" />
            <p className="feld-hinweis">Mit <code>/v1</code> am Ende.</p>
          </div>
          <div className="feld">
            <label htmlFor="modell">Modell</label>
            <input id="modell" value={modell} onChange={(ev) => setModell(ev.target.value)} placeholder="aim-qwen3.6-35b" />
          </div>
          <div className="feld">
            <label htmlFor="schluessel">Zugangsschlüssel <span className="optional">optional</span></label>
            <input
              id="schluessel"
              type="password"
              value={schluessel}
              onChange={(ev) => setSchluessel(ev.target.value)}
              placeholder={e.llm_api_key_kennung ? `${e.llm_api_key_kennung} — leer lassen, um ihn zu behalten` : "keiner hinterlegt"}
              autoComplete="off"
            />
          </div>
          {speichern.isError && <Fehler text={(speichern.error as Error).message} />}
          <div className="btn-reihe">
            <button type="submit" className="btn btn-primaer" disabled={speichern.isPending}>
              {speichern.isPending ? "Wird gespeichert …" : "Speichern"}
            </button>
            {speichern.isSuccess && <span className="text-gelungen">Gespeichert.</span>}
          </div>
        </form>
      </div>
    </section>
  );
}

/** Wohin Daten gehen — gemessen an dem, was eingetragen ist. */
function Datenwege({ e }: { e: OrgSettings }) {
  return (
    <section className="block">
      <div className="block-kopf"><h2>Wohin Daten gehen</h2></div>
      <div className="block-inhalt">
        <Erklaerung
          kurz="Alles bleibt auf dieser Box — außer dem, was Sie hier ausdrücklich an eine fremde Adresse schicken."
          lang={<>Steht bei Sprachmodell oder Suchdienst eine fremde Adresse, gehen die Inhalte der Anfragen dorthin. Diese Übersicht nennt sie beim Namen, statt pauschal „lokal“ zu behaupten.</>}
        />
        <dl>
          <div className="eigenschaft"><dt>Datenbank, Suche, Anhänge</dt><dd>auf dieser Box</dd></div>
          <div className="eigenschaft"><dt>Sprachmodell</dt><dd>{e.llm_ready ? e.llm_base_url : "nicht eingerichtet — keine Anfragen"}</dd></div>
          <div className="eigenschaft"><dt>Sprachausgabe</dt><dd>{e.tts_ready ? `Skripte der Podcasts an ${e.tts_endpoint_url}` : "nicht eingerichtet — keine Anfragen"}</dd></div>
          <div className="eigenschaft"><dt>Automatisch ergänzen</dt><dd>{e.suche_endpoint_url ? `Firmen- und Personennamen an ${e.suche_endpoint_url}; Websites der Firmen` : "nur die Websites der Firmen — kein Suchdienst eingetragen"}</dd></div>
          <div className="eigenschaft"><dt>E-Mail</dt><dd>{e.smtp_ready ? `über ${e.smtp_host}` : "kein Konto eingetragen"}{e.marketing_versand === "brevo" && e.brevo_api_key_set ? " · Marketing über Brevo" : ""}</dd></div>
          <div className="eigenschaft"><dt>Telemetrie</dt><dd>keine</dd></div>
        </dl>
      </div>
    </section>
  );
}

function Inhalt() {
  const suche = useSearchParams();
  // Ohne gültigen Bereich zeigt der Desktop „Firma und Team“, das Handy die
  // Übersicht (CSS an `data-auswahl`, siehe HB-UNTERNAV).
  const { eingeschraenkt } = useSicht();
  const w = useBegriffe();
  const moeglich = bereicheFuer(w);
  const gewaehlt = suche.get("bereich") as Bereich | null;
  const ausgewaehlt = moeglich.some((b) => b.schluessel === gewaehlt && (!eingeschraenkt || b.schluessel === "firma"));
  const bereich: Bereich = ausgewaehlt ? gewaehlt! : "firma";
  const bereichName = moeglich.find((b) => b.schluessel === bereich)!.text;

  const abfrage = useQuery({
    queryKey: ["einstellungen"],
    queryFn: () => api.get<OrgSettings>("/api/settings"),
  });

  if (abfrage.isPending) return <Laedt />;
  if (abfrage.isError) return <Fehler text={(abfrage.error as Error).message} />;
  const e = abfrage.data!;

  return (
    <>
      <Seitenkopf titel="Einstellungen" />

      <div className="unternav-seite" data-auswahl={ausgewaehlt ? "ja" : "nein"}>
        <Unternavigation gruppen={navigation(w, eingeschraenkt)} aktiv={bereich} label="Bereiche der Einstellungen" />

        <div className="unternav-inhalt">
          <div className="unternav-zurueck">
            <Link href="/einstellungen">
              <ChevronLeft size={16} aria-hidden="true" />
              Alle Einstellungen
            </Link>
            <span aria-hidden="true">·</span>
            <span>{bereichName}</span>
          </div>

          <div className="seitenhinweise">
            <Passworthinweis />
            <Tresorhinweis e={e} />
            <Rollenhinweis />
          </div>

          <div className="datensatz datensatz-lesespalte">
            {bereich === "firma" && (
              <>
                {!eingeschraenkt && <Modusblock e={e} />}
                {/* Firmendaten für Angebote — die gibt es im Verein nicht. */}
                {!eingeschraenkt && w.modus === "vertrieb" && <Absenderblock />}
                <Mitgliederblock />
                <Bereicheblock />
                <Passwortblock />
                <Faktorblock />
                <Geraeteblock />
              </>
            )}
            {bereich === "vertrieb" && (
              <>
                <Pipelinesblock />
                <Katalogblock />
                <Verlustgruendeblock />
              </>
            )}
            {bereich === "eigenschaften" && <Eigenschaftenblock />}
            {bereich === "email" && (
              <>
                <Versandblock />
                <Absenderkontoblock />
                <Marketingversandblock />
                <Postfachblock />
                <Postausgangblock />
              </>
            )}
            {bereich === "ki" && (
              <>
                <KIBlock e={e} />
                <Sprachausgabeblock e={e} />
                <AnreicherungEinstellungen einstellungen={e} />
                <InsiloAblageblock />
                <Quellenblock />
                <ApiSchluesselblock />
              </>
            )}
            {bereich === "daten" && (
              <>
                <Sicherungsblock />
                <Einfuhrverweis />
                <Datenbankverweis />
                <Datenwege e={e} />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function EinstellungenSeite() {
  return (
    <Suspense fallback={<Laedt />}>
      <Inhalt />
    </Suspense>
  );
}

/**
 * Sagt vorher, was nicht geht.
 *
 * Schlüssel, Sicherung und Team ändert nur, wer verwaltet — das setzt der
 * Server durch. Ohne diesen Satz drückt ein Mitglied auf „Speichern" und
 * bekommt eine Absage, deren Grund es nicht kennt. Die Knöpfe bleiben
 * stehen: Sie zu verstecken hieße, dass niemand mehr sieht, was hier
 * überhaupt einstellbar ist.
 */
function Rollenhinweis() {
  const wer = useQuery({
    queryKey: ["wer"],
    queryFn: () => api.get<Wer>("/api/mitglieder/wer"),
  });
  const rolle = wer.data?.rolle;
  if (!rolle || rolle === "owner" || rolle === "admin") return null;

  return (
    <div className="hinweis" data-art="achtung">
      <Info size={16} aria-hidden="true" />
      <span>
        Sie können hier alles <strong>ansehen</strong>. Ändern lassen sich Einstellungen,
        Zugangsdaten, Team und Sicherung nur von der Eigentümerin oder einer Person, die sie
        zur Verwaltung berechtigt hat.
      </span>
    </div>
  );
}

/**
 * Sagt es, statt es zu verschweigen.
 *
 * Solange in dieser Installation **niemand** ein Passwort hat, lässt der
 * Olares-Kopf den ersten noch herein — sonst wäre eine frisch installierte
 * App eine Sackgasse, 401 auf alles und niemand, der einen Zugang anlegen
 * könnte. Diese Ausnahme schließt sich mit dem ersten Passwort endgültig.
 * Bis 26.10.1 schützte bis dahin nichts: Der Entrance ist `public`, und
 * den Kopf konnte jeder mitschicken. Seitdem richtet ein Code aus dem
 * Datenordner Rocket ein (`backend/app/einrichtung.py`).
 */
function Passworthinweis() {
  const wer = useQuery({
    queryKey: ["wer"],
    queryFn: () => api.get<Wer>("/api/mitglieder/wer"),
  });
  const anmeldelage = useQuery({ queryKey: ["anmeldelage"], queryFn: lage });
  // Im Modus `olares` schützt Olares; dort ist ein fehlendes Passwort kein
  // Loch. Im Modus `eigen` kommt seit 26.10.1 ohne Passwort niemand mehr
  // herein — der Satz bleibt als Absicherung, falls doch.
  if (!wer.data || wer.data.passwort_gesetzt || anmeldelage.data?.modus !== "eigen") return null;

  return (
    <div className="hinweis" data-art="achtung" role="alert">
      <AlertTriangle size={16} aria-hidden="true" />
      <span>
        <strong>Rocket ist noch nicht geschützt.</strong> Solange hier niemand ein Passwort
        hat, prüft Rocket keine eigene Anmeldung — und die Adresse ist von außen erreichbar.
        Setzen Sie jetzt ein Passwort über das Schlüsselsymbol in Ihrer eigenen Zeile unter
        „Wer hier arbeitet“. Damit schließt sich diese Ausnahme endgültig.
      </span>
    </div>
  );
}

/**
 * Wenn „hinterlegt" nicht mehr stimmt.
 *
 * Zugangsdaten liegen verschlüsselt in der Datenbank, der Schlüssel dazu
 * als Datei unter `/app/data`. Fehlt die Datei und die Datenbank bleibt —
 * gelöschter Datenordner, eine zurückgespielte Datenbank aus einer
 * anderen Installation —, dann steht in der Spalte weiter etwas, aber es
 * lässt sich nicht mehr öffnen. Bis 0.9.1 meldete die Maske dafür
 * „hinterlegt", der Dienst bekam ein leeres Geheimnis, und Tavily
 * antwortete mit 401. Marc suchte den Fehler zwei Tage beim Schlüssel.
 */
function Tresorhinweis({ e }: { e: OrgSettings }) {
  const verloren = e.zugangsdaten_verloren;
  if (!verloren || verloren.length === 0) return null;

  return (
    <div className="hinweis" data-art="fehler" role="alert">
      <AlertTriangle size={16} aria-hidden="true" />
      <span>
        <strong>
          {verloren.length === 1
            ? "Ein hinterlegtes Geheimnis lässt sich nicht mehr öffnen"
            : `${verloren.length} hinterlegte Geheimnisse lassen sich nicht mehr öffnen`}
          :
        </strong>{" "}
        {verloren.join(", ")}. Der Tresorschlüssel unter <code>/app/data</code> ist weg,
        die verschlüsselten Werte sind geblieben. Tragen Sie sie neu ein — sonst gehen die
        Dienste mit einem leeren Schlüssel hinaus und antworten mit 401.
      </span>
    </div>
  );
}

/**
 * Der Blick in die Datenbank hat eine eigene Seite: Eine Tabelle mit
 * zwanzig Spalten passt nicht in die schmale Spalte der Einstellungen.
 */
function Datenbankverweis() {
  return (
    <section className="block">
      <div className="block-kopf">
        <h2>Datenbank ansehen</h2>
      </div>
      <div className="block-inhalt">
        <Erklaerung
          kurz="Die Tabellen Ihrer Organisation ansehen und lesend mit SQL abfragen — für Eigentümer und Verwalter."
          lang={<>Es gilt dieselbe Zeilensicherheit wie überall in Rocket, geändert wird nichts, und jede Abfrage steht im Protokoll. Tabellen mit Zugangsdaten und Sitzungen sind gesperrt.</>}
        />
        <div className="btn-reihe">
          <Link className="btn btn-sekundaer btn-klein" href="/datenbank">
            Datenbank öffnen
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Der Import wohnt nicht hier.
 *
 * Er steht auf den Listen, wo man ihn braucht — wer auf eine leere
 * Kontaktliste schaut, sucht ihn nicht in den Einstellungen. Hier steht
 * nur der Wegweiser, damit er unter „Daten" trotzdem auffindbar bleibt.
 */
function Einfuhrverweis() {
  return (
    <section className="block">
      <div className="block-kopf">
        <h2>Import und Export</h2>
      </div>
      <div className="block-inhalt">
        <p style={{ fontSize: "0.875rem", marginBottom: "var(--am-raum-3)" }}>
          Kontakte und Firmen kommen als CSV herein und hinaus. Beides steht auf der Liste
          selbst: <strong>Kontakt anlegen ▾ → Aus CSV importieren</strong>, und der Knopf{" "}
          <strong>Exportieren</strong> neben „Spalten".
        </p>
        <div className="btn-reihe">
          <Link className="btn btn-sekundaer btn-klein" href="/import?entity=contacts">
            Kontakte importieren
          </Link>
          <Link className="btn btn-sekundaer btn-klein" href="/import?entity=companies">
            Firmen importieren
          </Link>
        </div>
      </div>
    </section>
  );
}
