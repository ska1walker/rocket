"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Seitenkopf } from "@/components/seitenkopf";
import { Knopfmenue } from "@/components/knopfmenue";
import { Segmentliste } from "@/components/segmentliste";
import { KontaktAnlegen } from "@/components/kontakt-anlegen";
import { useNeuGewuenscht } from "@/lib/neu";
import { useSicht } from "@/lib/sicht";
import { useBegriffe } from "@/lib/modus";
import { SichtHinweis } from "@/components/sicht-verwalten";

export default function KontakteSeite() {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  // „Neu" aus der Kopfleiste zeigt hierher und will den Dialog offen sehen.
  const neu = useNeuGewuenscht();
  const { eingeschraenkt } = useSicht();
  const b = useBegriffe();
  useEffect(() => {
    if (neu) setOffen(true);
  }, [neu]);

  return (
    <>
      <Seitenkopf titel={b.kontakte}>
        {/* Der zweite Weg gehört neben den ersten: Wer auf eine leere
            Liste schaut, sucht den Import nicht in den Einstellungen. */}
        {/* Eingeschränkt: anlegen ja, Import nein — er läuft über den ganzen Bestand. */}
        {eingeschraenkt ? (
          <button type="button" className="btn btn-primaer" onClick={() => setOffen(true)}>{b.kontaktAnlegen}</button>
        ) : (
          <Knopfmenue
            text={b.kontaktAnlegen}
            eintraege={[
              { text: "Neu anlegen", onWahl: () => setOffen(true) },
              {
                text: "Aus CSV importieren",
                hinweis: "Mehrere auf einmal, aus einer Tabelle",
                onWahl: () => router.push("/import?entity=contacts"),
              },
            ]}
          />
        )}
      </Seitenkopf>

      {offen && (
        <KontaktAnlegen
          beiSchliessen={() => setOffen(false)}
          beiErfolg={(id) => {
            setOffen(false);
            router.push(`/kontakte/${id}`);
          }}
        />
      )}

      <div className="seitenhinweise">
        <SichtHinweis />
      </div>

      <Segmentliste
        entity="contacts"
        basisPfad="/kontakte"
        suchePlatzhalter={`Name, E-Mail oder ${b.firma}`}
        leerTitel={b.keinKontaktGefunden}
        leerText="Entweder ist der Filter zu eng, oder hier ist noch niemand angelegt."
        stapelfelder={[
          { schluessel: "lifecycle_stage", text: "Stufe" },
          { schluessel: "owner_id", text: "Besitzer" },
          { schluessel: "source", text: "Herkunft" },
        ]}
      />
    </>
  );
}
