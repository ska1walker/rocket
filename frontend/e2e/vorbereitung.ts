// Vor dem Rundgang: Es gibt von jeder Art mindestens einen Datensatz, damit
// jede Seite etwas zeigt. Die Beispieldaten (scripts/seed-dev.py) bringen
// Firmen, Kontakte und Leads; Ticket, Liste, Kampagne und Angebot legt dies
// hier an, falls sie fehlen — über die API, wie ein Mensch es täte.

const BASIS = process.env.ROCKET_URL ?? "http://localhost:3011";

async function anfrage<T>(methode: string, pfad: string, koerper?: unknown): Promise<T> {
  const r = await fetch(BASIS + pfad, {
    method: methode,
    headers: { "Content-Type": "application/json" },
    body: koerper === undefined ? undefined : JSON.stringify(koerper),
  });
  if (!r.ok) throw new Error(`${methode} ${pfad}: ${r.status} ${await r.text()}`);
  return (r.status === 204 ? null : await r.json()) as T;
}

type MitId = { id: string };

export default async function vorbereitung() {
  const kontakte = await anfrage<MitId[]>("GET", "/api/contacts");
  const deals = await anfrage<MitId[]>("GET", "/api/deals");
  if (kontakte.length === 0 || deals.length === 0) {
    throw new Error("Keine Beispieldaten — vorher scripts/seed-dev.py laufen lassen.");
  }

  const tickets = await anfrage<MitId[] | { tickets: MitId[] }>("GET", "/api/tickets");
  if ((Array.isArray(tickets) ? tickets : tickets.tickets).length === 0) {
    await anfrage("POST", "/api/tickets", { betreff: "Box startet nicht", beschreibung: "Seit dem Update", prioritaet: "hoch" });
  }

  let listen = await anfrage<MitId[]>("GET", "/api/listen");
  if (listen.length === 0) {
    const l = await anfrage<MitId>("POST", "/api/listen", { name: "Messe Köln", art: "statisch" });
    await anfrage("POST", `/api/listen/${l.id}/mitglieder`, { contact_ids: kontakte.slice(0, 3).map((k) => k.id) });
    listen = [l];
  }

  if ((await anfrage<MitId[]>("GET", "/api/kampagnen")).length === 0) {
    await anfrage("POST", "/api/kampagnen", { name: "Herbstmailing", liste_id: listen[0].id });
  }

  if ((await anfrage<MitId[]>("GET", "/api/quotes")).length === 0) {
    await anfrage("POST", "/api/quotes", {
      deal_id: deals[0].id,
      title: "Angebot Assistent",
      items: [{ title: "Assistent", quantity: 1, unit_price_cents: 490000 }],
    });
  }
}
