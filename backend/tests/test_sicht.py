"""Sicht nach Zuordnung (seit 26.10.15).

Durchgespielt am Verein, weil er die Regeln am deutlichsten braucht: Die
Spartenleitung sieht alles, ein Trainer seine Mannschaft(en), ein
Jugendleiter den Bereich „Jugend“ samt Eltern. Firmen heißen hier
Mannschaften, Kontakte Spieler — für die Datenbank ist es derselbe Bestand
wie im Vertrieb.
"""

from types import SimpleNamespace

from app import sicherung
from app.db import acquire_as
from tests.conftest import als_person, klient_fuer


async def _person(k, name):
    r = await k.post("/api/mitglieder", json={"display_name": name})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _sicht(k, person_id, sicht, zugriffe=()):
    r = await k.put(f"/api/mitglieder/{person_id}/sicht", json={"sicht": sicht, "zugriffe": list(zugriffe)})
    assert r.status_code == 200, r.text
    return r.json()


async def _verein(k, kuerzel):
    """Zwei Bereiche, vier Mannschaften, Spieler, ein Kind mit Elternteil,
    ein passives Mitglied ohne Mannschaft. Jeder Name trägt ein Kürzel,
    damit Tests einander nicht ins Gehege kommen."""
    herren = (await k.post("/api/bereiche", json={"name": f"Herren {kuerzel}"})).json()
    jugend = (await k.post("/api/bereiche", json={"name": f"Jugend {kuerzel}"})).json()
    m = {}
    for name, bereich in (("H1", herren), ("H2", herren), ("H3", herren), ("J1", jugend)):
        firma = (await k.post("/api/companies", json={"name": f"{name} {kuerzel}"})).json()
        r = await k.put(f"/api/companies/{firma['id']}/bereich", json={"bereich_id": bereich["id"]})
        assert r.status_code == 204, r.text
        m[name] = firma["id"]

    async def spieler(nachname, firma=None):
        r = await k.post("/api/contacts", json={"first_name": "Sp", "last_name": f"{nachname}-{kuerzel}", "company_id": firma})
        assert r.status_code == 201, r.text
        kid = r.json()["id"]
        await k.post("/api/activities", json={"kind": "note", "body": f"Notiz {nachname}-{kuerzel}", "contact_id": kid})
        return kid

    s = SimpleNamespace(
        eins=await spieler("Eins", m["H1"]),
        zwei=await spieler("Zwei", m["H2"]),
        drei=await spieler("Drei", m["H3"]),
        kind=await spieler("Kind", m["J1"]),
        elter=await spieler("Elter"),
        passiv=await spieler("Passiv"),
    )
    # Zwei hilft in der Ersten aus: weitere Mannschaft.
    r = await k.post(f"/api/contacts/{s.zwei}/firmen", json={"company_id": m["H1"], "role": "Aushilfe"})
    assert r.status_code in (200, 201), r.text
    r = await k.post(f"/api/contacts/{s.kind}/beziehungen", json={"bezug_id": s.elter})
    assert r.status_code == 201, r.text
    return SimpleNamespace(herren=herren["id"], jugend=jugend["id"], m=m, s=s)


async def _nachnamen(k):
    r = await k.get("/api/contacts?limit=200")
    assert r.status_code == 200, r.text
    return {c["last_name"].split("-")[0] for c in r.json()}


async def test_wer_alles_sieht_merkt_nichts(datenbank):
    async with klient_fuer("si-leitung") as k:
        await _verein(k, "a")
        assert {"Eins", "Zwei", "Drei", "Kind", "Elter", "Passiv"} <= await _nachnamen(k)


async def test_trainer_sieht_seine_mannschaft_und_aushilfen(datenbank):
    async with klient_fuer("si-trainer") as k:
        v = await _verein(k, "b")
        trainer = await _person(k, "Trainer Erste B")
        await _sicht(k, trainer, "eingeschraenkt", [{"company_id": v.m["H1"], "stufe": "bearbeiten"}])
        async with als_person(k, trainer) as t:
            assert await _nachnamen(t) == {"Eins", "Zwei"}
            # Fremde Spieler gibt es für ihn nicht — 404 wie ein falscher Link.
            assert (await t.get(f"/api/contacts/{v.s.drei}")).status_code == 404
            assert (await t.get(f"/api/contacts/{v.s.passiv}")).status_code == 404
            # Die Namen der anderen Mannschaften sieht er.
            namen = {c["name"] for c in (await t.get("/api/companies?limit=200")).json()}
            assert {"H1 b", "H2 b", "H3 b", "J1 b"} <= namen
            # Der Verlauf ohne Bezug zeigt nur, was an seinen Spielern hängt.
            notizen = {a["body"] for a in (await t.get("/api/activities?limit=200")).json()}
            assert {"Notiz Eins-b", "Notiz Zwei-b"} <= notizen
            assert not {"Notiz Drei-b", "Notiz Kind-b", "Notiz Elter-b", "Notiz Passiv-b"} & notizen
            # Die Suche auch.
            assert (await t.get("/api/suche?q=Drei-b")).json()["treffer"] == []
            assert (await t.get("/api/suche?q=Eins-b")).json()["treffer"]


async def test_bereich_schliesst_spaetere_mannschaften_und_eltern_ein(datenbank):
    async with klient_fuer("si-jugend") as k:
        v = await _verein(k, "c")
        leiter = await _person(k, "Jugendleiter C")
        await _sicht(k, leiter, "eingeschraenkt", [{"bereich_id": v.jugend, "stufe": "lesen"}])
        # Eine Mannschaft, die es beim Vergeben des Zugriffs noch nicht gab.
        j2 = (await k.post("/api/companies", json={"name": "J2 c"})).json()["id"]
        await k.put(f"/api/companies/{j2}/bereich", json={"bereich_id": v.jugend})
        await k.post("/api/contacts", json={"first_name": "Sp", "last_name": "Neu-c", "company_id": j2})
        async with als_person(k, leiter) as j:
            assert await _nachnamen(j) == {"Kind", "Elter", "Neu"}
            beziehungen = (await j.get(f"/api/contacts/{v.s.kind}/beziehungen")).json()
            assert [(b["richtung"], b["name"]) for b in beziehungen] == [("bezug", "Sp Elter-c")]
        # Aus dem Bereich genommen: weg.
        await k.put(f"/api/companies/{j2}/bereich", json={"bereich_id": None})
        async with als_person(k, leiter) as j:
            assert "Neu" not in await _nachnamen(j)


async def test_lesen_ist_nicht_bearbeiten(datenbank):
    async with klient_fuer("si-stufe") as k:
        v = await _verein(k, "d")
        co = await _person(k, "Co-Trainer D")
        await _sicht(k, co, "eingeschraenkt", [{"company_id": v.m["H1"], "stufe": "lesen"}])
        async with als_person(k, co) as c:
            assert (await c.get(f"/api/contacts/{v.s.eins}")).status_code == 200
            r = await c.patch(f"/api/contacts/{v.s.eins}", json={"phone": "0170 1"})
            assert r.status_code in (403, 404), r.text
            r = await c.post("/api/contacts", json={"first_name": "X", "last_name": "Y", "company_id": v.m["H1"]})
            assert r.status_code == 403, r.text


async def test_trainer_legt_an_aber_loescht_und_verschiebt_nicht(datenbank):
    async with klient_fuer("si-rechte") as k:
        v = await _verein(k, "e")
        trainer = await _person(k, "Trainer E")
        await _sicht(k, trainer, "eingeschraenkt", [{"company_id": v.m["H1"], "stufe": "bearbeiten"}])
        async with als_person(k, trainer) as t:
            r = await t.patch(f"/api/contacts/{v.s.eins}", json={"phone": "0170 2"})
            assert r.status_code == 200, r.text
            r = await t.post("/api/contacts", json={"first_name": "Neu", "last_name": "Zugang-e", "company_id": v.m["H1"]})
            assert r.status_code == 201, r.text
            # In eine fremde Mannschaft nicht.
            r = await t.post("/api/contacts", json={"first_name": "Neu", "last_name": "Fremd-e", "company_id": v.m["H3"]})
            assert r.status_code == 403, r.text
            # Löschen und Mannschaftswechsel macht die Leitung.
            assert (await t.delete(f"/api/contacts/{v.s.eins}")).status_code == 403
            r = await t.post(f"/api/contacts/{v.s.eins}/firmen", json={"company_id": v.m["H2"]})
            assert r.status_code == 403, r.text
            r = await t.patch(f"/api/contacts/{v.s.eins}", json={"company_id": v.m["H3"]})
            assert r.status_code == 403, r.text
            # Die Mannschaft selbst darf er pflegen, andere nicht.
            assert (await t.patch(f"/api/companies/{v.m['H1']}", json={"city": "Ort"})).status_code == 200
            assert (await t.patch(f"/api/companies/{v.m['H3']}", json={"city": "Ort"})).status_code in (403, 404)
            # Notizen an fremden Spielern nicht.
            r = await t.post("/api/activities", json={"kind": "note", "body": "x", "contact_id": v.s.drei})
            assert r.status_code == 403, r.text
        assert (await k.get(f"/api/contacts/{v.s.eins}")).status_code == 200


async def test_eingeschraenkt_verwaltet_nicht(datenbank):
    async with klient_fuer("si-verwalten") as k:
        v = await _verein(k, "f")
        trainer = await _person(k, "Trainer F")
        await _sicht(k, trainer, "eingeschraenkt", [{"company_id": v.m["H1"]}])
        async with als_person(k, trainer) as t:
            assert (await t.get("/api/sicherung/staende")).status_code == 403
            assert (await t.post("/api/bereiche", json={"name": "Eigen"})).status_code == 403
            assert (await t.put(f"/api/mitglieder/{trainer}/sicht", json={"sicht": "alles"})).status_code == 403
            # Die eigene Sicht lesen darf er.
            eigene = (await t.get(f"/api/mitglieder/{trainer}/sicht")).json()
            assert eigene["sicht"] == "eingeschraenkt"
            assert eigene["zugriffe"][0]["name"] == "H1 f"
        # Verwalter lassen sich nicht einschränken; wer Verwalter wird, sieht alles.
        r = await k.patch(f"/api/mitglieder/{trainer}/rolle", json={"role": "admin"})
        assert r.status_code == 200 and r.json()["sicht"] == "alles", r.text
        r = await k.put(f"/api/mitglieder/{trainer}/sicht", json={"sicht": "eingeschraenkt", "zugriffe": []})
        assert r.status_code == 400, r.text


async def test_viewer_liest_nur(datenbank):
    async with klient_fuer("si-viewer") as k:
        v = await _verein(k, "g")
        vorstand = await _person(k, "Vorstand G")
        r = await k.patch(f"/api/mitglieder/{vorstand}/rolle", json={"role": "viewer"})
        assert r.status_code == 200, r.text
        async with als_person(k, vorstand) as w:
            assert {"Eins", "Passiv"} <= await _nachnamen(w)
            r = await w.post("/api/contacts", json={"first_name": "X", "last_name": "Y"})
            assert r.status_code == 403, r.text
            assert (await w.patch(f"/api/contacts/{v.s.eins}", json={"phone": "1"})).status_code == 403
            # Eigene Einstellungen bleiben möglich.
            r = await w.patch("/api/mitglieder/wer/einstellungen", json={"favoriten": []})
            assert r.status_code == 200, r.text


async def test_abzug_traegt_sicht_und_zugriffe(datenbank):
    async with klient_fuer("si-abzug") as k:
        v = await _verein(k, "h")
        trainer = await _person(k, "Trainer H")
        await _sicht(k, trainer, "eingeschraenkt", [{"bereich_id": v.herren, "stufe": "lesen"}])
        wer = (await k.get("/api/mitglieder/wer")).json()
    async with acquire_as(wer["user_id"]) as conn:
        daten = await sicherung.abzug_erstellen(conn, wer["org_id"])
    assert any(n["sicht"] == "eingeschraenkt" for n in daten["nutzer"])
    assert len(daten["tabellen"]["zugriffe"]) == 1
    assert len(daten["tabellen"]["bereiche"]) == 2
    assert len(daten["tabellen"]["kontakt_beziehungen"]) == 1
    assert "kontakt_mannschaften" not in daten["tabellen"]


async def test_keine_lesende_route_bricht_fuer_eingeschraenkte(datenbank):
    """Jede GET-Route ohne Pfadparameter, als Trainer aufgerufen: Sie darf
    weniger zeigen oder 403 sagen, aber nie mit einem 500 abbrechen — eine
    Regel, die eine Abfrage zerlegt, fiele sonst erst im Betrieb auf."""
    from app.main import app

    async with klient_fuer("si-rauch") as k:
        v = await _verein(k, "r")
        trainer = await _person(k, "Trainer R")
        await _sicht(k, trainer, "eingeschraenkt", [{"company_id": v.m["H1"]}])
        pfade = sorted(
            p for p, ops in app.openapi()["paths"].items()
            if "get" in ops and "{" not in p and p.startswith("/api/")
        )
        assert len(pfade) > 40
        async with als_person(k, trainer) as t:
            kaputt = []
            for pfad in pfade:
                r = await t.get(pfad)
                if r.status_code >= 500:
                    kaputt.append((pfad, r.status_code, r.text[:200]))
    assert kaputt == []


async def test_wer_sieht_diese_firma(datenbank):
    async with klient_fuer("si-firma") as k:
        v = await _verein(k, "w")
        trainer = await _person(k, "Trainer W")
        leiter = await _person(k, "Jugendleiter W")
        await _sicht(k, trainer, "eingeschraenkt", [{"company_id": v.m["H1"], "stufe": "bearbeiten"}])
        await _sicht(k, leiter, "eingeschraenkt", [{"bereich_id": v.herren, "stufe": "lesen"}])
        h1 = (await k.get(f"/api/companies/{v.m['H1']}/sicht")).json()
        h2 = (await k.get(f"/api/companies/{v.m['H2']}/sicht")).json()
        wer = (await k.get("/api/mitglieder/wer")).json()
        assert wer["sicht"] == "alles"
        async with als_person(k, trainer) as t:
            assert (await t.get("/api/mitglieder/wer")).json()["sicht"] == "eingeschraenkt"
            assert (await t.get(f"/api/companies/{v.m['H1']}/sicht")).status_code == 403
    assert h1["bereich_id"] == v.herren
    assert {(p["name"], p["ueber"], p["stufe"]) for p in h1["personen"] if p["ueber"] != "alles"} == {
        ("Trainer W", "firma", "bearbeiten"), ("Jugendleiter W", "bereich", "lesen"),
    }
    assert any(p["ueber"] == "alles" for p in h1["personen"])
    assert [p["name"] for p in h2["personen"] if p["ueber"] != "alles"] == ["Jugendleiter W"]


async def test_trainer_legt_eltern_neu_am_kind_an(datenbank):
    async with klient_fuer("si-eltern") as k:
        v = await _verein(k, "x")
        trainer = await _person(k, "Trainer X")
        await _sicht(k, trainer, "eingeschraenkt", [{"company_id": v.m["J1"], "stufe": "bearbeiten"}])
        async with als_person(k, trainer) as t:
            r = await t.post(f"/api/contacts/{v.s.kind}/beziehungen",
                             json={"neu": {"first_name": "Mama", "last_name": "Neu-x", "phone": "0170"}})
            assert r.status_code == 201, r.text
            mama = r.json()
            assert mama["name"] == "Mama Neu-x"
            # Sie ist jetzt für ihn sichtbar — als Bezugsperson des Kindes.
            assert (await t.get(f"/api/contacts/{mama['contact_id']}")).status_code == 200
            # An ein fremdes Kind hängt er niemanden.
            r = await t.post(f"/api/contacts/{v.s.eins}/beziehungen", json={"neu": {"last_name": "Fremd-x"}})
            assert r.status_code == 404, r.text
            # Eine Person, die er nicht sieht, kann er auch nicht verknüpfen.
            r = await t.post(f"/api/contacts/{v.s.kind}/beziehungen", json={"bezug_id": v.s.passiv})
            assert r.status_code == 404, r.text
        # Die Leitung sieht die neue Mutter am Kind.
        namen = [b["name"] for b in (await k.get(f"/api/contacts/{v.s.kind}/beziehungen")).json()]
    assert "Mama Neu-x" in namen
