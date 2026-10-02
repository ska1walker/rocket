"use client";

// Modul RK-LEAD — docs/MODULE.md

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import type { Company, Firmenverknuepfung } from "@/lib/typen";
import { Fehler } from "@/components/zustaende";
import { useSicht } from "@/lib/sicht";
import { useBegriffe } from "@/lib/modus";

/** Die Firmen eines Kontakts — eine Hauptfirma, beliebig viele weitere. */
export function KontaktFirmen({ kontaktId }: { kontaktId: string }) {
  const client = useQueryClient();
  const [wahl, setWahl] = useState("");
  const [rolle, setRolle] = useState("");
  // Firmen zuordnen und lösen ändert, wer den Kontakt sieht — das bleibt
  // denen, die alles sehen (0037, contact_companies_sicht_*).
  const { alles, liest } = useSicht();
  // Im Verein: Mannschaften, mit einer Rolle im Team (seit 26.10.19).
  const b = useBegriffe();
  const haupt_ = `Haupt${b.firma.toLowerCase()}`;
  const darf = alles && !liest;

  const firmen = useQuery({
    queryKey: ["kontakt-firmen", kontaktId],
    queryFn: () => api.get<Firmenverknuepfung[]>(`/api/contacts/${kontaktId}/firmen`),
  });
  const alle = useQuery({
    queryKey: ["firmen-auswahl"],
    queryFn: () => api.get<Company[]>("/api/companies?limit=200"),
    enabled: darf,
  });

  const neu = () => { client.invalidateQueries({ queryKey: ["kontakt-firmen", kontaktId] }); client.invalidateQueries({ queryKey: ["kontakt", kontaktId] }); };
  const verknuepfen = useMutation({
    mutationFn: () => api.post(`/api/contacts/${kontaktId}/firmen`, { company_id: wahl, role: rolle || null }),
    onSuccess: () => { setWahl(""); setRolle(""); neu(); },
  });
  const loesen = useMutation({ mutationFn: (id: string) => api.del(`/api/contacts/${kontaktId}/firmen/${id}`), onSuccess: neu });
  const haupt = useMutation({ mutationFn: (id: string) => api.post(`/api/contacts/${kontaktId}/firmen/${id}/haupt`), onSuccess: neu });

  const vergeben = new Set(firmen.data?.map((f) => f.company_id) ?? []);
  const fehler = [verknuepfen, loesen, haupt].find((m) => m.isError);

  return (
    <section className="block">
      <div className="block-kopf">
        <h2>{b.firmen}</h2>
        <span className="board-spalte-anzahl">{firmen.data?.length ?? 0}</span>
      </div>
      <div className="block-inhalt">
        {firmen.data?.length === 0 && <p className="text-leise">Keiner {b.firma} zugeordnet.</p>}
        <dl>
          {firmen.data?.map((f) => (
            <div className="eigenschaft" key={f.company_id}>
              <dt>{f.ist_haupt ? haupt_ : f.role || `weitere ${b.firma}`}</dt>
              <dd style={{ display: "flex", gap: "var(--am-raum-2)", alignItems: "baseline", flexWrap: "wrap" }}>
                <Link href={`/firmen/${f.company_id}`} style={{ textDecoration: "underline", textUnderlineOffset: "2px" }}>{f.company_name}</Link>
                {darf && !f.ist_haupt && (
                  <button type="button" className="btn btn-still btn-klein" onClick={() => haupt.mutate(f.company_id)}>zur {haupt_}</button>
                )}
                {darf && <button type="button" className="btn btn-still btn-klein" onClick={() => loesen.mutate(f.company_id)}>lösen</button>}
              </dd>
            </div>
          ))}
        </dl>
        {fehler && <Fehler text={(fehler.error as Error).message} />}
        {darf && <form style={{ display: "flex", gap: "var(--am-raum-2)", marginTop: "var(--am-raum-3)", flexWrap: "wrap" }} onSubmit={(e) => { e.preventDefault(); if (wahl) verknuepfen.mutate(); }}>
          <select className="input" style={{ flex: "1 1 160px" }} value={wahl} onChange={(e) => setWahl(e.target.value)} aria-label={`${b.firma} verknüpfen`}>
            <option value="">— {b.firma} wählen —</option>
            {alle.data?.filter((c) => !vergeben.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className="input" style={{ flex: "1 1 120px" }} value={rolle} onChange={(e) => setRolle(e.target.value)} placeholder={b.modus === "verein" ? "Rolle im Team, etwa Torwart" : "Rolle dort"} aria-label={b.rolleAnFirma} />
          <button type="submit" className="btn btn-sekundaer btn-klein" disabled={!wahl || verknuepfen.isPending}>Verknüpfen</button>
        </form>}
      </div>
    </section>
  );
}
