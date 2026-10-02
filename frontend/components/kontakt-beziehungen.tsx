"use client";

// Modul RK-SICHT — docs/MODULE.md

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api, suchparameter } from "@/lib/api";
import { personName } from "@/lib/format";
import { useSicht } from "@/lib/sicht";
import type { Beziehung, Contact } from "@/lib/typen";
import { Fehler } from "@/components/zustaende";

/** Vorschläge für die Art — frei änderbar, im Vertrieb wie im Verein. */
const ARTEN = ["erziehungsberechtigt", "Assistenz", "berichtet an", "Vertretung"];

function artText(art: string) {
  return art.charAt(0).toUpperCase() + art.slice(1);
}

/**
 * Bezugspersonen eines Kontakts (seit 26.10.17): im Verein die Eltern am
 * Kind, im Vertrieb die Assistenz am Geschäftsführer.
 *
 * Wer einen Kontakt sieht, sieht auch dessen Bezugspersonen — darum darf
 * ein Trainer die Eltern seiner Spieler anlegen, obwohl sie in keiner
 * Mannschaft stehen. Neu anlegen und verknüpfen geschieht in einem Schritt.
 */
export function Bezugspersonen({ kontaktId }: { kontaktId: string }) {
  const client = useQueryClient();
  const { liest } = useSicht();
  const [modus, setModus] = useState<"zu" | "vorhanden" | "neu">("zu");
  const [art, setArt] = useState(ARTEN[0]);
  const [suche, setSuche] = useState("");
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [telefon, setTelefon] = useState("");
  const [mail, setMail] = useState("");

  const liste = useQuery({
    queryKey: ["beziehungen", kontaktId],
    queryFn: () => api.get<Beziehung[]>(`/api/contacts/${kontaktId}/beziehungen`),
  });
  const treffer = useQuery({
    queryKey: ["beziehung-suche", suche],
    queryFn: () => api.get<Contact[]>(`/api/contacts${suchparameter({ q: suche, limit: 8 })}`),
    enabled: modus === "vorhanden" && suche.trim().length >= 2,
  });

  const fertig = () => {
    setModus("zu");
    setSuche("");
    setVorname("");
    setNachname("");
    setTelefon("");
    setMail("");
    client.invalidateQueries({ queryKey: ["beziehungen", kontaktId] });
  };
  const verknuepfen = useMutation({
    mutationFn: (bezug_id: string) => api.post<Beziehung>(`/api/contacts/${kontaktId}/beziehungen`, { bezug_id, art }),
    onSuccess: fertig,
  });
  const anlegen = useMutation({
    mutationFn: () =>
      api.post<Beziehung>(`/api/contacts/${kontaktId}/beziehungen`, {
        art,
        neu: { first_name: vorname.trim() || null, last_name: nachname.trim(), phone: telefon.trim() || null, email: mail.trim() || null },
      }),
    onSuccess: fertig,
  });
  const loesen = useMutation({
    mutationFn: (id: string) => api.del(`/api/contacts/${kontaktId}/beziehungen/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["beziehungen", kontaktId] }),
  });

  const vergeben = new Set(liste.data?.map((b) => b.contact_id) ?? []);
  const fehler = [verknuepfen, anlegen, loesen].find((m) => m.isError);

  return (
    <section className="block">
      <div className="block-kopf">
        <h2>Bezugspersonen</h2>
        <span className="board-spalte-anzahl">{liste.data?.length ?? 0}</span>
      </div>
      <div className="block-inhalt">
        {liste.data?.length === 0 && modus === "zu" && (
          <p className="text-leise">Niemand verknüpft — etwa Erziehungsberechtigte oder eine Assistenz.</p>
        )}
        <dl>
          {liste.data?.map((b) => (
            <div className="eigenschaft" key={b.id}>
              <dt>{b.richtung === "bezug" ? artText(b.art) : `${artText(b.art)} für`}</dt>
              <dd className="sicht-bezug">
                <Link href={`/kontakte/${b.contact_id}`} className="fg-verweis">{b.name || "ohne Namen"}</Link>
                {!liest && (
                  <button type="button" className="btn btn-still btn-klein" onClick={() => loesen.mutate(b.id)} disabled={loesen.isPending}>
                    lösen
                  </button>
                )}
              </dd>
            </div>
          ))}
        </dl>

        {fehler && <Fehler text={(fehler.error as Error).message} />}

        {!liest && modus === "zu" && (
          <div className="btn-reihe">
            <button type="button" className="btn btn-still btn-klein" onClick={() => setModus("neu")}>Neu anlegen</button>
            <button type="button" className="btn btn-still btn-klein" onClick={() => setModus("vorhanden")}>Vorhandene verknüpfen</button>
          </div>
        )}

        {modus !== "zu" && (
          <div className="sicht-bezug-form">
            <div className="feld">
              <label htmlFor="bezug-art">Art</label>
              <input id="bezug-art" list="bezug-arten" value={art} onChange={(e) => setArt(e.target.value)} maxLength={60} />
              <datalist id="bezug-arten">
                {ARTEN.map((a) => <option key={a} value={a} />)}
              </datalist>
            </div>

            {modus === "vorhanden" ? (
              <>
                <div className="feld">
                  <label htmlFor="bezug-suche">Kontakt suchen</label>
                  <input id="bezug-suche" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Name oder E-Mail" autoFocus />
                </div>
                <ul className="sicht-liste">
                  {treffer.data?.filter((k) => k.id !== kontaktId && !vergeben.has(k.id)).map((k) => (
                    <li key={k.id} className="sicht-zeile">
                      <span>
                        {personName(k.first_name, k.last_name)}
                        {k.company_name && <span className="text-leise-klein"> · {k.company_name}</span>}
                      </span>
                      <button type="button" className="btn btn-sekundaer btn-klein" onClick={() => verknuepfen.mutate(k.id)} disabled={verknuepfen.isPending || !art.trim()}>
                        Verknüpfen
                      </button>
                    </li>
                  ))}
                </ul>
                {treffer.data?.length === 0 && <p className="text-leise-klein">Niemand gefunden.</p>}
              </>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); if (nachname.trim() && art.trim()) anlegen.mutate(); }}>
                <div className="feldreihe">
                  <div className="feld">
                    <label htmlFor="bezug-vorname">Vorname</label>
                    <input id="bezug-vorname" value={vorname} onChange={(e) => setVorname(e.target.value)} autoFocus />
                  </div>
                  <div className="feld">
                    <label htmlFor="bezug-nachname">Nachname</label>
                    <input id="bezug-nachname" value={nachname} onChange={(e) => setNachname(e.target.value)} required />
                  </div>
                </div>
                <div className="feldreihe">
                  <div className="feld">
                    <label htmlFor="bezug-telefon">Telefon <span className="optional">optional</span></label>
                    <input id="bezug-telefon" type="tel" value={telefon} onChange={(e) => setTelefon(e.target.value)} />
                  </div>
                  <div className="feld">
                    <label htmlFor="bezug-mail">E-Mail <span className="optional">optional</span></label>
                    <input id="bezug-mail" type="email" value={mail} onChange={(e) => setMail(e.target.value)} />
                  </div>
                </div>
                <button type="submit" className="btn btn-primaer btn-klein" disabled={!nachname.trim() || !art.trim() || anlegen.isPending}>
                  {anlegen.isPending ? "Legt an …" : "Anlegen und verknüpfen"}
                </button>
              </form>
            )}
            <button type="button" className="btn btn-still btn-klein" onClick={() => setModus("zu")}>Abbrechen</button>
          </div>
        )}
      </div>
    </section>
  );
}
