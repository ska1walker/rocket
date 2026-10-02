"use client";

// Modul RK-SICHT — docs/MODULE.md

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Pencil, Plus } from "@/lib/symbole";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { sichtSatz, useSicht } from "@/lib/sicht";
import { useWer } from "@/lib/wer";
import type { Bereich, Company, FirmaSicht, Mitglied, Sicht, Zugriff, Zugriffsstufe } from "@/lib/typen";
import { Dialog, Rueckfrage } from "@/components/dialog";
import { Erklaerung } from "@/components/erklaerung";
import { Fehler, Laedt } from "@/components/zustaende";

/**
 * Sicht nach Zuordnung — die Oberfläche (seit 26.10.17).
 *
 * Gerechnet wird in der Datenbank (0037, 0038); hier wird nur gepflegt,
 * woraus sie rechnet: Sicht je Person, Zugriffe auf Firmen und Bereiche,
 * Bereiche selbst. Im Vertrieb ist ein Bereich ein Gebiet, im Verein eine
 * Altersklasse — dieselbe Mechanik, darum CRM-Wörter.
 */

const STUFE_TEXT: Record<Zugriffsstufe, string> = { lesen: "lesen", bearbeiten: "bearbeiten" };

function useBereiche() {
  return useQuery({ queryKey: ["bereiche"], queryFn: () => api.get<Bereich[]>("/api/bereiche") });
}

function useFirmenAuswahl() {
  return useQuery({ queryKey: ["firmen-auswahl"], queryFn: () => api.get<Company[]>("/api/companies?limit=200") });
}

/** Schlüssel einer Wahl im Dialog: „f:<id>“ für eine Firma, „b:<id>“ für einen Bereich. */
type Wahl = Map<string, Zugriffsstufe>;

function wahlAus(zugriffe: Zugriff[]): Wahl {
  return new Map(zugriffe.map((z) => [z.company_id ? `f:${z.company_id}` : `b:${z.bereich_id}`, z.stufe]));
}

/** Sicht und Zugriffe einer Person setzen — alles auf einmal, wie die API. */
export function SichtDialog({ mitglied, beiSchliessen }: { mitglied: Mitglied; beiSchliessen: () => void }) {
  const client = useQueryClient();
  const name = mitglied.display_name ?? mitglied.olares_username;
  const verwaltet = mitglied.role === "owner" || mitglied.role === "admin";
  const bereiche = useBereiche();
  const firmen = useFirmenAuswahl();
  const stand = useQuery({
    queryKey: ["sicht", mitglied.id],
    queryFn: () => api.get<Sicht>(`/api/mitglieder/${mitglied.id}/sicht`),
  });

  // Der Entwurf beginnt, sobald der Stand da ist — vorher steht „Lädt“.
  const [entwurf, setEntwurf] = useState<{ sicht: Sicht["sicht"]; wahl: Wahl; geheim: boolean } | null>(null);
  const [filter, setFilter] = useState("");
  const aktuell =
    entwurf ??
    (stand.data
      ? { sicht: stand.data.sicht, wahl: wahlAus(stand.data.zugriffe), geheim: !!stand.data.vertraulich_sehen }
      : null);

  const speichern = useMutation({
    mutationFn: () => {
      const z = aktuell!;
      const zugriffe =
        z.sicht === "alles"
          ? []
          : [...z.wahl].map(([schluessel, stufe]) => {
              const [art, id] = schluessel.split(":");
              return art === "f" ? { company_id: id, stufe } : { bereich_id: id, stufe };
            });
      return api.put<Sicht>(`/api/mitglieder/${mitglied.id}/sicht`, {
        sicht: z.sicht,
        zugriffe,
        vertraulich_sehen: z.geheim,
      });
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["mitglieder"] });
      client.invalidateQueries({ queryKey: ["sicht", mitglied.id] });
      client.invalidateQueries({ queryKey: ["firma-sicht"] });
      beiSchliessen();
    },
  });

  function setze(schluessel: string, stufe: Zugriffsstufe | null) {
    const neu = new Map(aktuell!.wahl);
    if (stufe) neu.set(schluessel, stufe);
    else neu.delete(schluessel);
    setEntwurf({ ...aktuell!, wahl: neu });
  }

  const namen = useMemo(() => {
    const m = new Map<string, { name: string; bereich: boolean }>();
    for (const b of bereiche.data ?? []) m.set(`b:${b.id}`, { name: b.name, bereich: true });
    for (const f of firmen.data ?? []) m.set(`f:${f.id}`, { name: f.name, bereich: false });
    return m;
  }, [bereiche.data, firmen.data]);

  const satz = aktuell
    ? sichtSatz(
        name,
        aktuell.sicht,
        [...aktuell.wahl]
          .filter(([k]) => namen.has(k))
          .map(([k, stufe]) => ({ ...namen.get(k)!, stufe })),
        aktuell.geheim,
      )
    : "";

  const gefiltert = (firmen.data ?? []).filter((f) => f.name.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <Dialog titel={`Sicht von ${name}`} breite="breit" beiSchliessen={beiSchliessen} beiSenden={() => aktuell && !verwaltet && speichern.mutate()}>
      <div className="dialog-koerper">
        {verwaltet ? (
          <p className="text-leise">
            {name} verwaltet Rocket und sieht deshalb immer alles. Wer eingeschränkt sehen soll, braucht die Rolle Mitglied oder Nur lesen.
          </p>
        ) : !aktuell ? (
          <Laedt />
        ) : (
          <>
            {/* Ein Auswahlfeld statt zweier Optionsknöpfe: AM-FELD hat ein
                gestaltetes Auswahlfeld, das Designsystem keinen Radioknopf. */}
            <div className="feld">
              <label htmlFor="sicht-art">Was {name} sieht</label>
              <select
                id="sicht-art"
                value={aktuell.sicht}
                onChange={(e) => setEntwurf({ ...aktuell, sicht: e.target.value as Sicht["sicht"] })}
              >
                <option value="alles">Alles — alle Firmen und Kontakte</option>
                <option value="eingeschraenkt">Nur die Kontakte ausgewählter Firmen und Bereiche</option>
              </select>
            </div>

            {/* Seit 26.10.18: vertrauliche Feldgruppen (im Verein Bank und
                Beitrag) — unabhängig davon, wie viel die Person sonst sieht. */}
            <ul className="sicht-liste">
              <li className="sicht-zeile">
                <label>
                  <input
                    type="checkbox"
                    checked={aktuell.geheim}
                    onChange={(e) => setEntwurf({ ...aktuell, geheim: e.target.checked })}
                  />
                  <span>
                    Sieht vertrauliche Felder
                    <span className="text-leise-klein"> · etwa Bank und Beitrag, nur an Kontakten, die {name} ohnehin sieht</span>
                  </span>
                </label>
              </li>
            </ul>

            {aktuell.sicht === "eingeschraenkt" && (
              <>
                <h3 className="sicht-zwischentitel">Bereiche</h3>
                {bereiche.data?.length === 0 && (
                  <p className="text-leise-klein">Noch keine Bereiche. Sie entstehen unter Firma und Team › Bereiche.</p>
                )}
                <ul className="sicht-liste sicht-liste-rollt">
                  {bereiche.data?.map((b) => (
                    <Zeile
                      key={b.id}
                      schluessel={`b:${b.id}`}
                      text={b.name}
                      zusatz={`${b.firmen} ${b.firmen === 1 ? "Firma" : "Firmen"}, auch künftige`}
                      wahl={aktuell.wahl}
                      setze={setze}
                    />
                  ))}
                </ul>

                <h3 className="sicht-zwischentitel">Einzelne Firmen</h3>
                <div className="feld">
                  <label htmlFor="sicht-filter">Firmen filtern</label>
                  <input id="sicht-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Name" />
                </div>
                <ul className="sicht-liste sicht-liste-rollt">
                  {gefiltert.map((f) => (
                    <Zeile key={f.id} schluessel={`f:${f.id}`} text={f.name} wahl={aktuell.wahl} setze={setze} />
                  ))}
                </ul>
              </>
            )}

            <p className="sicht-satz" role="status">{satz}</p>
            {speichern.isError && <Fehler text={(speichern.error as Error).message} />}
          </>
        )}
      </div>
      <div className="dialog-fuss">
        {!verwaltet && (
          <button type="submit" className="btn btn-primaer" disabled={!aktuell || speichern.isPending}>
            {speichern.isPending ? "Speichert …" : "Speichern"}
          </button>
        )}
        <button type="button" className="btn btn-still" onClick={beiSchliessen}>
          {verwaltet ? "Schließen" : "Abbrechen"}
        </button>
      </div>
    </Dialog>
  );
}

function Zeile({
  schluessel,
  text,
  zusatz,
  wahl,
  setze,
}: {
  schluessel: string;
  text: string;
  zusatz?: string;
  wahl: Wahl;
  setze: (schluessel: string, stufe: Zugriffsstufe | null) => void;
}) {
  const stufe = wahl.get(schluessel);
  return (
    <li className="sicht-zeile">
      <label>
        <input type="checkbox" checked={!!stufe} onChange={(e) => setze(schluessel, e.target.checked ? "bearbeiten" : null)} />
        <span>
          {text}
          {zusatz && <span className="text-leise-klein"> · {zusatz}</span>}
        </span>
      </label>
      {stufe && (
        <select aria-label={`Stufe für ${text}`} value={stufe} onChange={(e) => setze(schluessel, e.target.value as Zugriffsstufe)}>
          <option value="bearbeiten">bearbeiten</option>
          <option value="lesen">nur lesen</option>
        </select>
      )}
    </li>
  );
}

/** Bereiche: Gruppen von Firmen. Nur für die, die verwalten. */
export function Bereicheblock() {
  const { verwaltet } = useSicht();
  const client = useQueryClient();
  const bereiche = useBereiche();
  const [name, setName] = useState("");
  const [bearbeitet, setBearbeitet] = useState<string | null>(null);
  const [entwurf, setEntwurf] = useState("");
  const [loeschen, setLoeschen] = useState<Bereich | null>(null);
  const neu = () => {
    client.invalidateQueries({ queryKey: ["bereiche"] });
    client.invalidateQueries({ queryKey: ["firma-sicht"] });
  };

  const anlegen = useMutation({
    mutationFn: () => api.post<Bereich>("/api/bereiche", { name: name.trim() }),
    onSuccess: () => { setName(""); neu(); },
  });
  const umbenennen = useMutation({
    mutationFn: (id: string) => api.patch<Bereich>(`/api/bereiche/${id}`, { name: entwurf.trim() }),
    onSuccess: () => { setBearbeitet(null); neu(); },
  });
  const weg = useMutation({
    mutationFn: (id: string) => api.del(`/api/bereiche/${id}`),
    onSuccess: () => { setLoeschen(null); neu(); },
  });

  if (!verwaltet) return null;

  return (
    <section className="block">
      <div className="block-kopf">
        <h2>Bereiche</h2>
      </div>
      <div className="block-inhalt">
        <Erklaerung
          kurz="Gruppen von Firmen — etwa ein Gebiet oder eine Altersklasse. Wer Zugriff auf einen Bereich hat, sieht die Kontakte jeder Firma darin."
          lang={<>Ein Bereich schließt auch Firmen ein, die später hineinkommen. In welchem Bereich eine Firma steht, wählen Sie auf ihrer Seite unter „Sichtbarkeit“. Wer welche Bereiche sieht, steht bei den Personen oben unter „Sicht“.</>}
        />
        {bereiche.isPending && <Laedt />}
        {bereiche.data?.length === 0 && <p className="text-leise">Noch kein Bereich.</p>}
        {!!bereiche.data?.length && (
          <ul className="sicht-liste">
            {bereiche.data.map((b) => (
              <li key={b.id} className="sicht-zeile">
                {bearbeitet === b.id ? (
                  <form className="sicht-umbenennen" onSubmit={(e) => { e.preventDefault(); if (entwurf.trim()) umbenennen.mutate(b.id); }}>
                    <input aria-label="Name des Bereichs" value={entwurf} onChange={(e) => setEntwurf(e.target.value)} autoFocus maxLength={80} />
                    <button type="submit" className="btn btn-primaer btn-klein" disabled={!entwurf.trim() || umbenennen.isPending}>Speichern</button>
                    <button type="button" className="btn btn-still btn-klein" onClick={() => setBearbeitet(null)}>Abbrechen</button>
                  </form>
                ) : (
                  <>
                    <span>
                      {b.name}
                      <span className="text-leise-klein"> · {b.firmen} {b.firmen === 1 ? "Firma" : "Firmen"}</span>
                    </span>
                    <span className="sicht-aktionen">
                      <button type="button" className="btn btn-still btn-klein" aria-label={`${b.name} umbenennen`} title={`${b.name} umbenennen`} onClick={() => { setBearbeitet(b.id); setEntwurf(b.name); }}>
                        <Pencil size={16} aria-hidden="true" />
                      </button>
                      <button type="button" className="btn btn-still btn-klein" onClick={() => setLoeschen(b)}>Löschen</button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {[anlegen, umbenennen].find((m) => m.isError) && (
          <Fehler text={([anlegen, umbenennen].find((m) => m.isError)!.error as Error).message} />
        )}
        <form className="sicht-anlegen" onSubmit={(e) => { e.preventDefault(); if (name.trim()) anlegen.mutate(); }}>
          <div className="feld">
            <label htmlFor="bereich-neu">Bereich anlegen</label>
            <input id="bereich-neu" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Nord oder Jugend" maxLength={80} />
          </div>
          <button type="submit" className="btn btn-sekundaer" disabled={!name.trim() || anlegen.isPending}>
            <Plus size={16} aria-hidden="true" />
            Anlegen
          </button>
        </form>
      </div>

      {loeschen && (
        <Rueckfrage
          titel={<>„{loeschen.name}“ löschen</>}
          label="Bereich löschen"
          text="Die Firmen bleiben und stehen danach in keinem Bereich. Wer nur über diesen Bereich Zugriff hatte, sieht ihre Kontakte nicht mehr."
          beiSchliessen={() => setLoeschen(null)}
          vorsicht
          knopf={
            <button type="button" className="btn btn-gefahr" disabled={weg.isPending} onClick={() => weg.mutate(loeschen.id)}>
              {weg.isPending ? "Löscht …" : "Bereich löschen"}
            </button>
          }
        >
          {weg.isError && <Fehler text={(weg.error as Error).message} />}
        </Rueckfrage>
      )}
    </section>
  );
}

/** An der Firma: in welchem Bereich sie steht, und wer ihre Kontakte sieht. */
export function FirmaSichtblock({ firmaId }: { firmaId: string }) {
  const { verwaltet } = useSicht();
  const client = useQueryClient();
  const bereiche = useBereiche();
  const sicht = useQuery({
    queryKey: ["firma-sicht", firmaId],
    queryFn: () => api.get<FirmaSicht>(`/api/companies/${firmaId}/sicht`),
    enabled: verwaltet,
  });
  const bereichSetzen = useMutation({
    mutationFn: (bereich_id: string | null) => api.put(`/api/companies/${firmaId}/bereich`, { bereich_id }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["firma-sicht", firmaId] });
      client.invalidateQueries({ queryKey: ["firma", firmaId] });
      client.invalidateQueries({ queryKey: ["bereiche"] });
    },
  });

  if (!verwaltet) return null;

  const eingeschraenkte = sicht.data?.personen.filter((p) => p.ueber !== "alles") ?? [];
  const alle = sicht.data?.personen.filter((p) => p.ueber === "alles") ?? [];

  return (
    <section className="block">
      <div className="block-kopf">
        <h2>Sichtbarkeit</h2>
        <Eye size={16} aria-hidden="true" />
      </div>
      <div className="block-inhalt">
        <div className="feld">
          <label htmlFor="firma-bereich">Bereich</label>
          <select
            id="firma-bereich"
            value={sicht.data?.bereich_id ?? ""}
            disabled={!sicht.data || bereichSetzen.isPending}
            onChange={(e) => bereichSetzen.mutate(e.target.value || null)}
          >
            <option value="">— in keinem Bereich —</option>
            {bereiche.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {bereiche.data?.length === 0 && (
            <p className="feld-hinweis">
              Bereiche legen Sie unter <Link href="/einstellungen?bereich=firma">Einstellungen › Firma und Team</Link> an.
            </p>
          )}
        </div>
        {bereichSetzen.isError && <Fehler text={(bereichSetzen.error as Error).message} />}

        <p className="sicht-zwischentitel">Wer die Kontakte sieht</p>
        {sicht.isPending && <Laedt />}
        <ul className="sicht-liste">
          {eingeschraenkte.map((p) => (
            <li key={`${p.user_id}-${p.ueber}`} className="sicht-zeile">
              <span>{p.name}</span>
              <span className="text-leise-klein">
                {STUFE_TEXT[p.stufe]} · {p.ueber === "bereich" ? "über den Bereich" : "direkt"}
              </span>
            </li>
          ))}
        </ul>
        {sicht.data && (
          <p className="text-leise-klein">
            {alle.length === 1 ? "Dazu 1 Person mit voller Sicht" : `Dazu ${alle.length} Personen mit voller Sicht`}
            {alle.length > 0 && `: ${alle.map((p) => p.name).join(", ")}`}.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Für Eingeschränkte über Listen: was sie sehen, in einem Satz. Steht in
 * `.seitenhinweise`, nie lose in der Seite.
 */
export function SichtHinweis() {
  const { eingeschraenkt } = useSicht();
  const { wer } = useWer();
  const eigene = useQuery({
    queryKey: ["sicht", wer.data?.user_id],
    queryFn: () => api.get<Sicht>(`/api/mitglieder/${wer.data!.user_id}/sicht`),
    enabled: eingeschraenkt && !!wer.data,
  });
  if (!eingeschraenkt || !eigene.data) return null;
  const namen = eigene.data.zugriffe.map((z) => (z.bereich_id ? `Bereich ${z.name}` : z.name ?? ""));
  return (
    <div className="hinweis" role="note">
      <Eye size={16} aria-hidden="true" />
      <span>
        {namen.length === 0
          ? "Sie sehen keine Kontakte — Ihnen ist noch keine Firma freigegeben. Fragen Sie die Leitung."
          : `Sie sehen die Kontakte von ${namen.length === 1 ? namen[0] : `${namen.slice(0, -1).join(", ")} und ${namen[namen.length - 1]}`}.`}
      </span>
    </div>
  );
}
