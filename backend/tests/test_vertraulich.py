"""Vertrauliche Feldgruppen (seit 26.10.18).

Im Verein: Die Gruppe „Beitrag und Bank“ ist vertraulich. Der Kassierer
sieht IBAN und Beitrag, ein Trainer nicht — auch nicht am eigenen Spieler,
nicht über einen Filter, nicht in der Ausfuhr, nicht im Protokoll.
"""

import json

from app import sicherung
from app.db import acquire_as
from tests.conftest import als_person, klient_fuer

IBAN = "DE89370400440532013000"


async def _ok(antwort, *codes):
    assert antwort.status_code in (codes or (200, 201)), f"{antwort.request.url}: {antwort.text}"
    return antwort.json() if antwort.content else None


async def _person(k, name, sicht=None):
    pid = (await _ok(await k.post("/api/mitglieder", json={"display_name": name})))["id"]
    if sicht is not None:
        await _ok(await k.put(f"/api/mitglieder/{pid}/sicht", json=sicht))
    return pid


async def _gruppe(k, entity, label, felder, vertraulich=True):
    """Eine Gruppe mit Feldern; gibt Gruppen-ID und Schlüssel je Feld zurück."""
    g = await _ok(await k.post("/api/eigenschaften/gruppen", json={"entity": entity, "label": label}))
    if vertraulich:
        g = await _ok(await k.patch(f"/api/eigenschaften/gruppen/{g['id']}", json={"vertraulich": True}))
        assert g["vertraulich"] is True
    keys = {}
    for feld in felder:
        d = await _ok(await k.post("/api/eigenschaften", json={"entity": entity, "label": feld, "group_id": g["id"]}))
        assert d["vertraulich"] is vertraulich
        keys[feld] = d["key"]
    return g["id"], keys


async def _filter(k, key, wert):
    f = json.dumps([{"feld": f"custom.{key}", "operator": "ist", "wert": wert}])
    return await _ok(await k.get("/api/contacts", params={"filter": f}))


async def test_kassierer_sieht_trainer_und_mitglied_nicht(datenbank):
    async with klient_fuer("vt-kasse") as k:
        mannschaft = await _ok(await k.post("/api/companies", json={"name": "Erste VT"}))
        _, keys = await _gruppe(k, "contacts", "Beitrag und Bank", ["IBAN", "Beitrag"])
        iban, beitrag = keys["IBAN"], keys["Beitrag"]
        spieler = await _ok(await k.post("/api/contacts", json={
            "first_name": "Sp", "last_name": "VT", "company_id": mannschaft["id"],
            "custom": {iban: IBAN, beitrag: "120"},
        }))
        # Die Leitung (Eigentümerin) sieht alles — in der Antwort, der Liste, dem Filter.
        assert spieler["custom"][iban] == IBAN
        assert (await _ok(await k.get(f"/api/contacts/{spieler['id']}")))["custom"][iban] == IBAN
        assert [c["id"] for c in await _filter(k, iban, IBAN)] == [spieler["id"]]

        # In `custom` steht es nicht — es liegt in der eigenen Ablage.
        wer = await _ok(await k.get("/api/mitglieder/wer"))
        assert wer["vertraulich"] is True
        async with acquire_as(wer["user_id"]) as conn:
            roh = await conn.fetchval("select custom::text from public.contacts where id = $1", spieler["id"])
            assert IBAN not in roh
            # Auch das Protokoll nennt nur, dass, nicht was.
            treffer = await conn.fetchval(
                "select count(*) from public.audit_log where diff::text like '%' || $1 || '%'", IBAN
            )
            assert treffer == 0

        kasse = await _person(k, "Kassierer VT", {"sicht": "alles", "vertraulich_sehen": True})
        mitglied = await _person(k, "Mitglied VT")
        trainer = await _person(k, "Trainer VT", {
            "sicht": "eingeschraenkt", "zugriffe": [{"company_id": mannschaft["id"], "stufe": "bearbeiten"}],
        })
        sicht = await _ok(await k.get(f"/api/mitglieder/{kasse}/sicht"))
        assert sicht["vertraulich_sehen"] is True
        assert any(m["vertraulich_sehen"] for m in await _ok(await k.get("/api/mitglieder")) if m["id"] == kasse)

        async with als_person(k, kasse) as kk:
            assert (await _ok(await kk.get("/api/mitglieder/wer")))["vertraulich"] is True
            assert (await _ok(await kk.get(f"/api/contacts/{spieler['id']}")))["custom"][iban] == IBAN
            await _ok(await kk.patch(f"/api/contacts/{spieler['id']}", json={"custom": {beitrag: "140"}}))
            csv = (await kk.get("/api/ausfuhr", params={"entity": "contacts", "spalten": "alle"})).text
            assert IBAN in csv and "140" in csv

        for wer_id in (mitglied, trainer):
            async with als_person(k, wer_id) as t:
                assert (await _ok(await t.get("/api/mitglieder/wer")))["vertraulich"] is False
                einzeln = await _ok(await t.get(f"/api/contacts/{spieler['id']}"))
                assert iban not in einzeln["custom"] and beitrag not in einzeln["custom"]
                liste = await _ok(await t.get("/api/contacts", params={"limit": 200}))
                assert IBAN not in json.dumps(liste)
                # Über einen Filter erfährt niemand etwas.
                assert await _filter(t, iban, IBAN) == []
                # Spalten und Filter kennen das Feld nicht, die Ausfuhr auch nicht.
                felder = await _ok(await t.get("/api/ansichten/felder", params={"entity": "contacts"}))
                assert f"custom.{iban}" not in {f["schluessel"] for f in felder["felder"]}
                r = await t.get("/api/ausfuhr", params={"entity": "contacts", "spalten": "alle"})
                assert r.status_code == 200 and IBAN not in r.text
                r = await t.get("/api/ausfuhr", params={"entity": "contacts", "spalten": f"custom.{iban}"})
                assert r.status_code == 400
                # Setzen oder leeren darf er es nicht.
                r = await t.patch(f"/api/contacts/{spieler['id']}", json={"custom": {iban: None}})
                assert r.status_code == 403 and "IBAN" in r.text
                # Die Datenbank zeigt ihm keine Zeile.
            async with acquire_as(wer_id) as conn:
                assert await conn.fetchval("select count(*) from public.vertrauliche_werte") == 0

        # Der Wert steht unverändert.
        assert (await _ok(await k.get(f"/api/contacts/{spieler['id']}")))["custom"][iban] == IBAN


async def test_vertrauliches_pflichtfeld_haelt_den_trainer_nicht_auf(datenbank):
    async with klient_fuer("vt-pflicht") as k:
        mannschaft = await _ok(await k.post("/api/companies", json={"name": "Zweite VT"}))
        _, keys = await _gruppe(k, "contacts", "Bank", ["Mitgliedsnummer"])
        felder = await _ok(await k.get("/api/eigenschaften?entity=contacts"))
        fid = next(f["id"] for f in felder if f["key"] == keys["Mitgliedsnummer"])
        await _ok(await k.patch(f"/api/eigenschaften/{fid}", json={"required": True}))
        # Für die Leitung ist es Pflicht …
        r = await k.post("/api/contacts", json={"last_name": "Ohne", "company_id": mannschaft["id"]})
        assert r.status_code == 422
        trainer = await _person(k, "Trainer Pflicht", {
            "sicht": "eingeschraenkt", "zugriffe": [{"company_id": mannschaft["id"], "stufe": "bearbeiten"}],
        })
        # … der Trainer kann es nicht füllen und legt trotzdem an.
        async with als_person(k, trainer) as t:
            await _ok(await t.post("/api/contacts", json={"last_name": "Neu", "company_id": mannschaft["id"]}))


async def test_trainer_mit_schalter_sieht_nur_seine_spieler(datenbank):
    async with klient_fuer("vt-schalter") as k:
        a = await _ok(await k.post("/api/companies", json={"name": "A VT"}))
        b = await _ok(await k.post("/api/companies", json={"name": "B VT"}))
        _, keys = await _gruppe(k, "contacts", "Beitrag", ["Beitragssatz"])
        satz = keys["Beitragssatz"]
        eigen = await _ok(await k.post("/api/contacts", json={"last_name": "Eigen", "company_id": a["id"], "custom": {satz: "eigen-satz"}}))
        await _ok(await k.post("/api/contacts", json={"last_name": "Fremd", "company_id": b["id"], "custom": {satz: "fremd-satz"}}))
        jugendleiter = await _person(k, "Jugendleiter VT", {
            "sicht": "eingeschraenkt", "vertraulich_sehen": True,
            "zugriffe": [{"company_id": a["id"], "stufe": "bearbeiten"}],
        })
        async with als_person(k, jugendleiter) as t:
            assert (await _ok(await t.get(f"/api/contacts/{eigen['id']}")))["custom"][satz] == "eigen-satz"
            await _ok(await t.patch(f"/api/contacts/{eigen['id']}", json={"custom": {satz: "neu"}}))
        async with acquire_as(jugendleiter) as conn:
            werte = [json.loads(w["werte"]) for w in await conn.fetch("select werte::text as werte from public.vertrauliche_werte")]
        assert werte == [{satz: "neu"}]


async def test_werte_ziehen_mit_um(datenbank):
    async with klient_fuer("vt-umzug") as k:
        gid, keys = await _gruppe(k, "contacts", "Später geheim", ["Passnummer"], vertraulich=False)
        pn = keys["Passnummer"]
        kontakt = await _ok(await k.post("/api/contacts", json={"last_name": "Umzug", "custom": {pn: "P-123"}}))
        wer = await _ok(await k.get("/api/mitglieder/wer"))
        mitglied = await _person(k, "Mitglied Umzug")

        async def ablage():
            async with acquire_as(wer["user_id"]) as conn:
                offen = await conn.fetchval("select custom::text from public.contacts where id = $1", kontakt["id"])
                geheim = await conn.fetchval(
                    "select werte::text from public.vertrauliche_werte where record_id = $1", kontakt["id"]
                )
            return ("P-123" in offen), ("P-123" in (geheim or ""))

        assert await ablage() == (True, False)
        await _ok(await k.patch(f"/api/eigenschaften/gruppen/{gid}", json={"vertraulich": True}))
        assert await ablage() == (False, True)
        assert (await _ok(await k.get(f"/api/contacts/{kontakt['id']}")))["custom"][pn] == "P-123"
        async with als_person(k, mitglied) as t:
            assert pn not in (await _ok(await t.get(f"/api/contacts/{kontakt['id']}")))["custom"]

        # Feld in eine offene Gruppe gezogen: Der Wert kommt zurück nach `custom`.
        offen = await _ok(await k.post("/api/eigenschaften/gruppen", json={"entity": "contacts", "label": "Offen Umzug"}))
        felder = await _ok(await k.get("/api/eigenschaften?entity=contacts"))
        fid = next(f["id"] for f in felder if f["key"] == pn)
        d = await _ok(await k.patch(f"/api/eigenschaften/{fid}", json={"group_id": offen["id"]}))
        assert d["vertraulich"] is False
        assert await ablage() == (True, False)

        # Und zurück in die geheime, dann den Schalter wieder aus.
        await _ok(await k.patch(f"/api/eigenschaften/{fid}", json={"group_id": gid}))
        assert await ablage() == (False, True)
        await _ok(await k.patch(f"/api/eigenschaften/gruppen/{gid}", json={"vertraulich": False}))
        assert await ablage() == (True, False)
        async with als_person(k, mitglied) as t:
            assert (await _ok(await t.get(f"/api/contacts/{kontakt['id']}")))["custom"][pn] == "P-123"

        # Die Anordnung zählt vertrauliche Werte mit.
        await _ok(await k.patch(f"/api/eigenschaften/gruppen/{gid}", json={"vertraulich": True}))
        anordnung = await _ok(await k.get("/api/eigenschaften/anordnung", params={"entity": "contacts", "mit_anzahl": True}))
        feld = next(f for g in anordnung["gruppen"] for f in g["felder"] if f["key"] == pn)
        assert feld["vertraulich"] is True and feld["anzahl"] == 1


async def test_feste_felder_bleiben_offen(datenbank):
    async with klient_fuer("vt-fest") as k:
        gid, _ = await _gruppe(k, "contacts", "Geheim fest", [])
        anordnung = await _ok(await k.get("/api/eigenschaften/anordnung", params={"entity": "contacts"}))
        fest = next(f for g in anordnung["gruppen"] for f in g["felder"] if f["is_system"])
        r = await k.patch(f"/api/eigenschaften/{fest['id']}", json={"group_id": gid})
        assert r.status_code == 409
        # Eine Gruppe mit festen Feldern lässt sich nicht vertraulich schalten.
        vorgabe = next(g for g in anordnung["gruppen"] if any(f["is_system"] for f in g["felder"]))
        r = await k.patch(f"/api/eigenschaften/gruppen/{vorgabe['id']}", json={"vertraulich": True})
        assert r.status_code == 409


async def test_abzug_traegt_vertrauliches(datenbank):
    async with klient_fuer("vt-abzug") as k:
        _, keys = await _gruppe(k, "contacts", "Bank Abzug", ["IBAN Abzug"])
        await _ok(await k.post("/api/contacts", json={"last_name": "Abzug", "custom": {keys["IBAN Abzug"]: IBAN}}))
        await _person(k, "Kasse Abzug", {"sicht": "alles", "vertraulich_sehen": True})
        wer = await _ok(await k.get("/api/mitglieder/wer"))
    async with acquire_as(wer["user_id"]) as conn:
        daten = await sicherung.abzug_erstellen(conn, wer["org_id"])
    assert len(daten["tabellen"]["vertrauliche_werte"]) == 1
    assert any(g["vertraulich"] for g in daten["tabellen"]["property_groups"])
    assert any(n["vertraulich_sehen"] for n in daten["nutzer"])
