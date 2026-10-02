"""Der Leck-Test für die Sicht nach Zuordnung (seit 26.10.16).

Mannschaft B ist für den Trainer von A fremd. Jede Tabelle, die an B
hängt, trägt eine Markierung („LECKB“). Dann ruft der Trainer **jede**
GET-Route der App auf, mit den Kennungen von B im Pfad und in der Abfrage,
und keine Antwort darf die Markierung enthalten.

Zweimal: einmal so, wie es läuft, und einmal ohne die Erlaubnisliste der
Pfade (auth.EINGESCHRAENKT_ERLAUBT). Der zweite Lauf beweist, dass die
Datenbank allein schon dicht ist — die Liste ist die zweite Tür, nicht die
einzige.

Eine neue Route ist von selbst dabei: Der Test liest sie aus dem Schema.
"""

import re

import pytest

from app import auth, versand
from app import datenbank as datenbankblick
from app.db import acquire_as
from app.main import app
from tests.conftest import als_person, klient_fuer

PDF = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"
MARKE = "leckb"


async def _ok(antwort, *codes):
    assert antwort.status_code in (codes or (200, 201)), f"{antwort.request.url}: {antwort.text}"
    return antwort.json() if antwort.content else None


async def _aufbau(k, kuerzel: str) -> dict:
    """Leitung legt beide Mannschaften an; alles an B ist markiert."""
    a = await _ok(await k.post("/api/companies", json={"name": f"Erste {kuerzel}"}))
    b = await _ok(await k.post("/api/companies", json={"name": f"Fremde {kuerzel}"}))
    await _ok(await k.post("/api/eigenschaften", json={"entity": "contacts", "label": f"Passnummer {kuerzel}"}))
    felder = await _ok(await k.get("/api/eigenschaften?entity=contacts"))
    pass_key = next(f["key"] for f in felder if f["label"] == f"Passnummer {kuerzel}")

    eigen = await _ok(await k.post("/api/contacts", json={"first_name": "Eigen", "last_name": f"Spieler {kuerzel}", "company_id": a["id"]}))
    fremd = await _ok(await k.post("/api/contacts", json={
        "first_name": "LECKB-Vorname", "last_name": f"LECKB-Nachname {kuerzel}",
        "email": f"leckb-{kuerzel}@example.org", "phone": "LECKB-Telefon",
        "company_id": b["id"], "notes": "LECKB-Notiz", "custom": {pass_key: "LECKB-Pass"},
    }))
    kind = await _ok(await k.post("/api/contacts", json={"first_name": "LECKB-Kind", "last_name": kuerzel, "company_id": b["id"]}))
    elter = await _ok(await k.post("/api/contacts", json={"first_name": "LECKB-Elter", "last_name": kuerzel}))
    await _ok(await k.post(f"/api/contacts/{kind['id']}/beziehungen", json={"bezug_id": elter["id"]}))
    passiv = await _ok(await k.post("/api/contacts", json={"first_name": "LECKB-Passiv", "last_name": kuerzel}))

    # Vertrauliche Felder (seit 26.10.18): Auch am **eigenen** Spieler und an
    # der eigenen Mannschaft sieht der Trainer sie nicht — ohne den Schalter.
    for entity, ziel in (("contacts", eigen["id"]), ("companies", a["id"])):
        gruppe = await _ok(await k.post("/api/eigenschaften/gruppen", json={"entity": entity, "label": f"Bank {kuerzel}"}))
        await _ok(await k.patch(f"/api/eigenschaften/gruppen/{gruppe['id']}", json={"vertraulich": True}))
        feld = await _ok(await k.post("/api/eigenschaften", json={"entity": entity, "label": f"IBAN {kuerzel}", "group_id": gruppe["id"]}))
        await _ok(await k.patch(f"/api/{entity}/{ziel}", json={"custom": {feld["key"]: "LECKB-IBAN"}}))

    aktivitaet = await _ok(await k.post("/api/activities", json={"kind": "note", "body": "LECKB-Aktivität", "contact_id": fremd["id"]}))
    await _ok(await k.post("/api/activities", json={"kind": "note", "body": "LECKB-an-der-Firma", "company_id": b["id"]}))
    aufgabe = await _ok(await k.post("/api/tasks", json={"title": "LECKB-Aufgabe", "contact_id": fremd["id"]}))
    dokument = await _ok(await k.post("/api/dokumente", data={"contact_id": fremd["id"]},
                                      files={"datei": ("LECKB-Dokument.pdf", PDF, "application/pdf")}))
    ticket = await _ok(await k.post("/api/tickets", json={"betreff": "LECKB-Ticket", "contact_id": fremd["id"]}))
    lead = await _ok(await k.post("/api/deals", json={"name": "LECKB-Lead", "company_id": b["id"]}))
    angebot = await _ok(await k.post("/api/quotes", json={"deal_id": lead["id"]}))
    liste = await _ok(await k.post("/api/listen", json={"name": "LECKB-Liste"}))
    await _ok(await k.post(f"/api/listen/{liste['id']}/mitglieder", json={"contact_ids": [fremd["id"], eigen["id"]]}))
    kampagne = await _ok(await k.post("/api/kampagnen", json={"name": "LECKB-Kampagne", "betreff": "LECKB-Betreff", "liste_id": liste["id"]}))

    wer = await _ok(await k.get("/api/mitglieder/wer"))
    async with acquire_as(wer["user_id"]) as conn:
        await versand.einreihen(
            conn, wer["org_id"], art="marketing", an=f"leckb-{kuerzel}@example.org",
            betreff="LECKB-Mail", text="LECKB-Mailtext", contact_id=fremd["id"], created_by=wer["user_id"],
        )
        await conn.execute("update public.companies set ai_summary = 'LECKB-Zusammenfassung' where id = $1", b["id"])

    return {
        "a": a["id"], "b": b["id"], "eigen": eigen["id"], "fremd": fremd["id"], "kind": kind["id"],
        "elter": elter["id"], "passiv": passiv["id"], "aktivitaet": aktivitaet["id"], "aufgabe": aufgabe["id"],
        "dokument": dokument["id"], "ticket": ticket["id"], "lead": lead["id"], "angebot": angebot["id"],
        "liste": liste["id"], "kampagne": kampagne["id"], "leitung": wer["user_id"],
    }


# Welche Kennung in welchen Pfadparameter gehört. Was hier fehlt, bekommt
# den fremden Kontakt — eine Kennung von B ist es in jedem Fall.
PARAMETER = {
    "company_id": "b", "contact_id": "fremd", "deal_id": "lead", "ticket_id": "ticket",
    "task_id": "aufgabe", "activity_id": "aktivitaet", "dokument_id": "dokument",
    "liste_id": "liste", "kampagne_id": "kampagne", "quote_id": "angebot", "mitglied_id": "leitung",
}


def _routen() -> list[str]:
    return sorted(
        p for p, ops in app.openapi()["paths"].items()
        if "get" in ops and p.startswith("/api/")
    )


def _pfad(muster: str, ids: dict) -> str:
    return re.sub(r"\{(\w+)\}", lambda m: str(ids[PARAMETER.get(m.group(1), "fremd")]), muster)


def _ohne_echo(text: str) -> str:
    """Die Suchanfrage selbst kommt zurück („q“: „LECKB“) — das ist kein Leck."""
    return text.lower().replace('"leckb"', "").replace("was gibt es zu leckb?", "")


async def _alles_abrufen(t, ids: dict) -> tuple[list[str], int]:
    abfrage = {
        "company_id": ids["b"], "contact_id": ids["fremd"], "deal_id": ids["lead"],
        "ticket_id": ids["ticket"], "q": "LECKB", "limit": 200,
    }
    lecks: list[str] = []
    geprueft = 0
    for muster in _routen():
        pfad = _pfad(muster, ids)
        for params in ({}, abfrage):
            r = await t.get(pfad, params=params)
            geprueft += 1
            assert r.status_code < 500, f"{pfad}: {r.status_code} {r.text[:200]}"
            text = _ohne_echo(r.text)
            if MARKE in text:
                fund = text.index(MARKE)
                lecks.append(f"{pfad} {params and '(mit Abfrage)'}: …{text[max(0, fund - 60):fund + 40]}…")
    # Fragen ist ein POST, liest aber nur — und durchsucht den Bestand.
    r = await t.post("/api/fragen", json={"frage": "Was gibt es zu LECKB?"})
    if MARKE in _ohne_echo(r.text):
        lecks.append(f"/api/fragen: {r.text[:200]}")
    return lecks, geprueft


@pytest.mark.parametrize("ohne_liste", [False, True], ids=["mit-erlaubnisliste", "nur-datenbank"])
async def test_nichts_von_der_fremden_mannschaft_kommt_heraus(datenbank, monkeypatch, ohne_liste):
    kuerzel = "l2" if ohne_liste else "l1"
    async with klient_fuer(f"leck-{kuerzel}") as k:
        ids = await _aufbau(k, kuerzel)
        trainer = (await _ok(await k.post("/api/mitglieder", json={"display_name": f"Trainer {kuerzel}"})))["id"]
        await _ok(await k.put(f"/api/mitglieder/{trainer}/sicht", json={
            "sicht": "eingeschraenkt", "zugriffe": [{"company_id": ids["a"], "stufe": "bearbeiten"}],
        }))
        if ohne_liste:
            monkeypatch.setattr(auth, "eingeschraenkt_erlaubt", lambda methode, pfad: True)

        async with als_person(k, trainer) as t:
            # Gegenprobe: Der eigene Spieler ist zu sehen — sonst bewiese
            # der Test nur, dass der Trainer gar nichts sieht.
            assert (await t.get(f"/api/contacts/{ids['eigen']}")).status_code == 200
            lecks, geprueft = await _alles_abrufen(t, ids)

    assert geprueft > 150
    assert lecks == [], "\n".join(lecks)

    # Und in der Datenbank selbst: Keine Tabelle zeigt dem Trainer eine Zeile
    # mit der Markierung. `companies` sieht er mit Absicht (Namen und Felder
    # der Mannschaft), die Zusammenfassung blendet die API aus.
    async with acquire_as(trainer) as conn:
        for tabelle in sorted(datenbankblick.FREI - {"companies", "orgs"}):
            treffer = await conn.fetchval(f"select count(*) from public.{tabelle} t where t::text ilike '%leckb%'")
            assert treffer == 0, f"{tabelle}: {treffer} Zeilen mit der Markierung"
        # `companies` ist oben ausgenommen, vertrauliche Werte stehen dort
        # aber gar nicht; und ihre eigene Tabelle zeigt ihm nichts.
        assert await conn.fetchval("select count(*) from public.companies t where t::text ilike '%leckb-iban%'") == 0
        assert await conn.fetchval("select count(*) from public.vertrauliche_werte") == 0


async def test_eingeschraenkt_kommt_nur_durch_die_erlaubten_tueren(datenbank):
    async with klient_fuer("leck-tueren") as k:
        ids = await _aufbau(k, "l3")
        trainer = (await _ok(await k.post("/api/mitglieder", json={"display_name": "Trainer l3"})))["id"]
        await _ok(await k.put(f"/api/mitglieder/{trainer}/sicht", json={
            "sicht": "eingeschraenkt", "zugriffe": [{"company_id": ids["a"]}],
        }))
        async with als_person(k, trainer) as t:
            for pfad in ("/api/deals", "/api/tickets", "/api/briefing", "/api/erkenntnisse",
                         "/api/besprechungen", "/api/eingang", "/api/podcasts", "/api/pipelines"):
                r = await t.get(pfad)
                assert r.status_code in (403, 404), f"{pfad}: {r.status_code}"
            assert (await t.post(f"/api/contacts/{ids['eigen']}/anreichern")).status_code == 403
            # Was er braucht, geht.
            for pfad in ("/api/mitglieder/wer", "/api/contacts", "/api/companies", "/api/tasks",
                         "/api/activities", "/api/listen", "/api/kampagnen", "/api/bereiche", "/api/settings"):
                assert (await t.get(pfad)).status_code == 200, pfad
            # Fremde Listen und Kampagnen sieht er nicht, eigene schon.
            assert (await t.get(f"/api/listen/{ids['liste']}")).status_code == 404
            eigene = await _ok(await t.post("/api/listen", json={"name": "Meine Mannschaft"}))
            assert [x["id"] for x in await _ok(await t.get("/api/listen"))] == [eigene["id"]]
            # Die Zusammenfassung der Firma bekommt er nicht.
            assert (await _ok(await t.get(f"/api/companies/{ids['b']}")))["ai_summary"] is None
            # Eine Dublette verrät nicht, dass es den Kontakt gibt.
            r = await t.post("/api/contacts", json={"first_name": "X", "last_name": "Y",
                                                    "email": "leckb-l3@example.org", "company_id": ids["a"]})
            assert r.status_code == 409 and "Kontakt" not in r.json()["detail"], r.text
        # Die Leitung bekommt den genauen Grund.
        r = await k.post("/api/contacts", json={"first_name": "X", "last_name": "Y", "email": "leckb-l3@example.org"})
        assert r.status_code == 409 and "Kontakt" in r.json()["detail"]
