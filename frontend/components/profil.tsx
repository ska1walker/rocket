"use client";

// Modul RK-EINSTELLUNGEN — docs/MODULE.md

import { useEffect, useState } from "react";
import { Erklaerung } from "@/components/erklaerung";
import { Darstellungsschalter, Dichteschalter } from "@/components/darstellung";
import { Fehler, Laedt } from "@/components/zustaende";
import { useBegriffe } from "@/lib/modus";
import { useWer } from "@/lib/wer";

/** Was eine Rolle im Satz heißt — wie in der Teamliste. */
const ROLLE: Record<string, string> = {
  owner: "Eigentümerin",
  admin: "Verwalter",
  member: "Mitglied",
  viewer: "Nur lesen",
};

/**
 * Wer hier arbeitet, auf einen Blick (Einstellungen › Mein Konto › Profil).
 * Rolle und Sicht vergibt die Leitung unter „Firma und Team“; hier steht
 * nur, was gilt.
 */
export function Profilblock() {
  const { wer } = useWer();
  const w = useBegriffe();
  if (wer.isPending) return <Laedt />;
  if (wer.isError) return <Fehler text={(wer.error as Error).message} />;
  const p = wer.data!;
  return (
    <section className="block">
      <div className="block-kopf">
        <h2>Profil</h2>
      </div>
      <div className="block-inhalt">
        <Erklaerung
          kurz="So erscheinen Sie in Rocket."
          lang={`Name, Rolle und Sicht vergibt die Leitung unter Einstellungen › ${w.firmaUndTeam}.`}
        />
        <dl>
          <div className="eigenschaft">
            <dt>Name</dt>
            <dd>{p.display_name ?? "—"}</dd>
          </div>
          <div className="eigenschaft">
            <dt>Anmeldename</dt>
            <dd>{p.login_username}</dd>
          </div>
          <div className="eigenschaft">
            <dt>Rolle</dt>
            <dd>{ROLLE[p.rolle] ?? p.rolle}</dd>
          </div>
          <div className="eigenschaft">
            <dt>Sicht</dt>
            <dd>
              {p.sicht === "eingeschraenkt"
                ? `nur ${w.firmen} mit Zugriff`
                : "alles"}
              {p.vertraulich ? " · auch vertrauliche Felder" : ""}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

/** Hell oder dunkel und die Dichte — dieselben Schalter wie im Profilmenü. */
export function Darstellungsblock() {
  return (
    <section className="block">
      <div className="block-kopf">
        <h2>Darstellung</h2>
      </div>
      <div className="block-inhalt">
        <Erklaerung
          kurz="Gilt für dieses Gerät und diesen Browser."
          lang="Die Wahl liegt im Browser, nicht am Konto: Am Handy darf Rocket dunkel sein, am Arbeitsplatz hell. Die Dichte gibt es nur mit Maus oder Trackpad — am Touchscreen bleibt jedes Ziel groß genug für den Finger."
        />
        <p className="konto-abschnitt">Hell oder dunkel</p>
        <Darstellungsschalter />
        <Dichteteil />
      </div>
    </section>
  );
}

/** Die Dichte — nur am Zeiger; am Touchscreen fällt der ganze Teil weg. */
function Dichteteil() {
  const [zeiger, setZeiger] = useState(false);
  useEffect(() => setZeiger(!window.matchMedia("(pointer: coarse)").matches), []);
  if (!zeiger) return null;
  return (
    <div className="konto-teil">
      <p className="konto-abschnitt">Dichte</p>
      <Dichteschalter />
    </div>
  );
}
