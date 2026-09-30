"""Gruppen und Systemeigenschaften — Stufe A aus docs/PLAN-EIGENSCHAFTEN.md."""

import asyncio

import pytest

from app import eigenschaften
from tests.conftest import als_person, klient_fuer
from tests.test_sicherung import eigene_ablage  # noqa: F401 — Fixture


async def _anordnung(k, entity="companies", **p):
    r = await k.get("/api/eigenschaften/anordnung", params={"entity": entity, **p})
    assert r.status_code == 200, r.text
    return r.json()


def _reihenfolge(a) -> dict:
    return {"entity": a["entity"], "gruppen": [
        {"id": g["id"], "felder": [f["id"] for f in g["felder"]]} for g in a["gruppen"]
    ]}


def _schluessel(a) -> dict[str, list[str]]:
    return {g["key"]: [f["key"] for f in g["felder"]] for g in a["gruppen"]}


async def test_vorgaben_entstehen_mit_allen_festen_feldern(datenbank):
    async with klient_fuer("gr-vorgabe") as k:
        a = await _anordnung(k)
    gruppen = [g["key"] for g in a["gruppen"]]
    assert gruppen == [key for key, _ in eigenschaften.VORGABEGRUPPEN["companies"]]
    felder = _schluessel(a)
    assert felder["adresse"] == ["street", "postal_code", "city", "country"]
    assert "name" in felder["firmeninformationen"]
    alle = {f for fs in felder.values() for f in fs}
    assert alle == {f.key for f in eigenschaften.SYSTEMFELDER["companies"]}
    stadt = next(f for g in a["gruppen"] for f in g["felder"] if f["key"] == "city")
    assert stadt["is_system"] and stadt["bearbeitbar"]
    kontakte = next(f for g in a["gruppen"] for f in g["felder"] if f["key"] == "contact_count")
    assert kontakte["bearbeitbar"] is False


async def test_vorgaben_entstehen_genau_einmal(datenbank):
    """Zwei gleichzeitige erste Aufrufe — keine Doppelten."""
    async with klient_fuer("gr-einmal") as k:
        await k.get("/api/mitglieder/wer")
        erste, zweite = await asyncio.gather(_anordnung(k, "contacts"), _anordnung(k, "contacts"))
        dritte = await _anordnung(k, "contacts")
    assert _schluessel(erste) == _schluessel(zweite) == _schluessel(dritte)
    alle = [f for fs in _schluessel(dritte).values() for f in fs]
    assert len(alle) == len(set(alle))


async def test_alte_eigene_eigenschaften_landen_in_weitere(datenbank):
    async with klient_fuer("gr-alt") as k:
        # Wie vor 0034: ohne Gruppe.
        d = (await k.post("/api/eigenschaften", json={"entity": "deals", "label": "Kammer"})).json()
        a = await _anordnung(k, "deals")
    assert "kammer" in _schluessel(a)[eigenschaften.WEITERE]
    assert d["group_id"] is not None


async def test_eigene_liste_zeigt_keine_festen_felder(datenbank):
    """Datensatzseite und Einfuhr lesen `/api/eigenschaften` als „was in custom steht"."""
    async with klient_fuer("gr-liste") as k:
        await _anordnung(k)
        await k.post("/api/eigenschaften", json={"entity": "companies", "label": "Serverraum", "kind": "bool"})
        liste = (await k.get("/api/eigenschaften", params={"entity": "companies"})).json()
        assert [d["key"] for d in liste] == ["serverraum"]
        # Und `custom` nimmt keinen festen Schlüssel an.
        f = (await k.post("/api/companies", json={"name": "Gr GmbH"})).json()
        r = await k.patch(f"/api/companies/{f['id']}", json={"custom": {"city": "Berlin"}})
        assert r.status_code in (400, 422), r.text


async def test_festes_feld_bleibt_fest(datenbank):
    async with klient_fuer("gr-fest") as k:
        a = await _anordnung(k)
        stadt = next(f for g in a["gruppen"] for f in g["felder"] if f["key"] == "city")
        assert (await k.delete(f"/api/eigenschaften/{stadt['id']}")).status_code == 400
        assert (await k.patch(f"/api/eigenschaften/{stadt['id']}", json={"is_active": False})).status_code == 400
        # Beschriftung und Hilfetext gehen.
        r = await k.patch(f"/api/eigenschaften/{stadt['id']}", json={"label": "Stadt", "description": "Sitz"})
        assert r.status_code == 200 and r.json()["label"] == "Stadt"
        # Ein eigener Schlüssel, der ein festes Feld träfe, ist vergeben.
        assert (await k.post("/api/eigenschaften", json={"entity": "companies", "label": "City"})).status_code == 409


async def test_gruppen_anlegen_umbenennen_loeschen_mit_ziel(datenbank):
    async with klient_fuer("gr-crud") as k:
        await _anordnung(k)
        g = (await k.post("/api/eigenschaften/gruppen", json={"entity": "companies", "label": "IT-Umgebung"})).json()
        assert (await k.post("/api/eigenschaften/gruppen", json={"entity": "companies", "label": "IT-Umgebung"})).status_code == 409
        d = (await k.post("/api/eigenschaften", json={
            "entity": "companies", "label": "Serverraum", "kind": "bool", "group_id": g["id"],
        })).json()
        assert d["group_id"] == g["id"]
        assert (await k.patch(f"/api/eigenschaften/gruppen/{g['id']}", json={"label": "IT"})).json()["label"] == "IT"

        # Mit Feld nur mit Ziel.
        assert (await k.delete(f"/api/eigenschaften/gruppen/{g['id']}")).status_code == 409
        a = await _anordnung(k)
        vertrieb = next(x for x in a["gruppen"] if x["key"] == "vertrieb")
        assert (await k.delete(f"/api/eigenschaften/gruppen/{g['id']}", params={"ziel": vertrieb["id"]})).status_code == 204
        a = await _anordnung(k)
        assert "serverraum" in _schluessel(a)["vertrieb"]
        assert "it_umgebung" not in _schluessel(a)

        # Vorgabegruppen bleiben.
        assert (await k.delete(f"/api/eigenschaften/gruppen/{vertrieb['id']}")).status_code == 400


async def test_reihenfolge_ist_alles_oder_nichts(datenbank):
    async with klient_fuer("gr-ordnen") as k:
        a = await _anordnung(k)
        plan = _reihenfolge(a)
        # Stadt nach vorn in die erste Gruppe, Gruppen umdrehen.
        adresse = next(g for g in plan["gruppen"] if g["id"] == next(x["id"] for x in a["gruppen"] if x["key"] == "adresse"))
        stadt = next(f["id"] for x in a["gruppen"] for f in x["felder"] if f["key"] == "city")
        adresse["felder"].remove(stadt)
        plan["gruppen"][0]["felder"].insert(0, stadt)
        plan["gruppen"].reverse()
        r = await k.put("/api/eigenschaften/reihenfolge", json=plan)
        assert r.status_code == 200, r.text
        neu = await _anordnung(k)
        assert [g["key"] for g in neu["gruppen"]] == [g["key"] for g in reversed(a["gruppen"])]
        assert _schluessel(neu)["firmeninformationen"][0] == "city"

        # Ein fehlendes Feld: veralteter Stand, nichts wird geschrieben.
        kaputt = _reihenfolge(neu)
        next(g for g in kaputt["gruppen"] if g["felder"])["felder"].pop()
        assert (await k.put("/api/eigenschaften/reihenfolge", json=kaputt)).status_code == 409
        # Ein Feld doppelt: ebenso.
        doppelt = _reihenfolge(neu)
        voll = [g for g in doppelt["gruppen"] if g["felder"]]
        voll[1]["felder"].append(voll[0]["felder"][0])
        assert (await k.put("/api/eigenschaften/reihenfolge", json=doppelt)).status_code == 409
        assert _schluessel(await _anordnung(k)) == _schluessel(neu)


async def test_fremde_gruppen_und_felder_bleiben_draussen(datenbank):
    async with klient_fuer("gr-a") as a, klient_fuer("gr-b") as b:
        aa = await _anordnung(a)
        bb = await _anordnung(b)
        # B kann A's Gruppe weder umbenennen noch als Ziel nutzen.
        fremd = aa["gruppen"][0]["id"]
        assert (await b.patch(f"/api/eigenschaften/gruppen/{fremd}", json={"label": "x"})).status_code == 404
        assert (await b.post("/api/eigenschaften", json={
            "entity": "companies", "label": "Test", "group_id": fremd,
        })).status_code == 400
        # A's Anordnung in B's Namen: passt nicht.
        assert (await b.put("/api/eigenschaften/reihenfolge", json=_reihenfolge(aa))).status_code == 409
        assert {g["id"] for g in aa["gruppen"]}.isdisjoint({g["id"] for g in bb["gruppen"]})


async def test_nur_verwalter_ordnen(datenbank):
    async with klient_fuer("gr-rolle") as k:
        m = (await k.post("/api/mitglieder", json={"display_name": "Gr Mitglied"})).json()
        a = await _anordnung(k)
        async with als_person(k, m["id"]) as mitglied:
            # Lesen darf jeder — die Datensatzseite braucht es.
            assert (await mitglied.get("/api/eigenschaften/anordnung", params={"entity": "companies"})).status_code == 200
            assert (await mitglied.put("/api/eigenschaften/reihenfolge", json=_reihenfolge(a))).status_code == 403
            assert (await mitglied.post("/api/eigenschaften/gruppen", json={"entity": "companies", "label": "X"})).status_code == 403
            assert (await mitglied.post("/api/eigenschaften", json={"entity": "companies", "label": "X"})).status_code == 403


async def test_nutzung_wird_gezaehlt(datenbank):
    async with klient_fuer("gr-zahl") as k:
        await k.post("/api/eigenschaften", json={"entity": "companies", "label": "Serverraum", "kind": "bool"})
        await k.post("/api/companies", json={"name": "Z1", "city": "Köln", "custom": {"serverraum": True}})
        await k.post("/api/companies", json={"name": "Z2"})
        a = await _anordnung(k, mit_anzahl="true")
    felder = {f["key"]: f for g in a["gruppen"] for f in g["felder"]}
    assert felder["city"]["anzahl"] == 1
    assert felder["name"]["anzahl"] == 2
    assert felder["serverraum"]["anzahl"] == 1
    assert felder["contact_count"]["anzahl"] is None


async def test_archivierte_stehen_gesondert_und_kommen_zurueck(datenbank):
    async with klient_fuer("gr-archiv") as k:
        d = (await k.post("/api/eigenschaften", json={"entity": "contacts", "label": "Hobby"})).json()
        await k.delete(f"/api/eigenschaften/{d['id']}")
        a = await _anordnung(k, "contacts")
        assert [f["key"] for f in a["archiviert"]] == ["hobby"]
        assert "hobby" not in {f for fs in _schluessel(a).values() for f in fs}
        await k.patch(f"/api/eigenschaften/{d['id']}", json={"is_active": True})
        a = await _anordnung(k, "contacts")
        assert a["archiviert"] == []
        assert "hobby" in _schluessel(a)[eigenschaften.WEITERE]


@pytest.mark.usefixtures("eigene_ablage")
async def test_gruppen_ueberleben_die_sicherung(datenbank):
    """Abzug aus einer Organisation, zurück in eine, die schon Vorgaben hat."""
    from app import sicherung
    from app.db import acquire_as
    from tests.test_sicherung import _kennung, _org_und_nutzer

    async with klient_fuer("gr-quelle") as q:
        g = (await q.post("/api/eigenschaften/gruppen", json={"entity": "companies", "label": "IT"})).json()
        await q.post("/api/eigenschaften", json={
            "entity": "companies", "label": "Serverraum", "kind": "bool", "group_id": g["id"],
        })
        # Eine Vorgabegruppe mit eigenem Feld — am Ziel gibt es die Gruppe
        # schon unter anderer id.
        a = await _anordnung(q)
        vertrieb = next(x["id"] for x in a["gruppen"] if x["key"] == "vertrieb")
        await q.post("/api/eigenschaften", json={
            "entity": "companies", "label": "Region", "group_id": vertrieb,
        })
        async with acquire_as(await _kennung(q)) as conn:
            org, _ = await _org_und_nutzer(conn)
            abzug = await sicherung.abzug_erstellen(conn, org)
            # Wie nach einer Deinstallation: Die Quelle ist weg. Sonst
            # kollidierten die ids, die es in derselben Testdatenbank noch gibt.
            await conn.execute("delete from public.property_definitions where org_id = $1", org)
            await conn.execute("delete from public.property_groups where org_id = $1", org)

    async with klient_fuer("gr-ziel") as z:
        await _anordnung(z)
        async with acquire_as(await _kennung(z)) as conn:
            org, nutzer = await _org_und_nutzer(conn)
            await sicherung.zurueckspielen(conn, abzug, org, nutzer)
        felder = _schluessel(await _anordnung(z))
    assert "serverraum" in felder["it"]
    assert "region" in felder["vertrieb"]


async def test_im_anlegen_nur_fuer_bearbeitbares(datenbank):
    async with klient_fuer("gr-anlegen") as k:
        a = await _anordnung(k, "deals")
        felder = {f["key"]: f for g in a["gruppen"] for f in g["felder"]}
        assert (await k.patch(f"/api/eigenschaften/{felder['service_days']['id']}", json={"im_anlegen": True})).status_code == 200
        # Gerechnet — im Dialog nichts zu tun.
        assert (await k.patch(f"/api/eigenschaften/{felder['probability']['id']}", json={"im_anlegen": True})).status_code == 400
        # Der Absagegrund entsteht beim Verlieren.
        assert (await k.patch(f"/api/eigenschaften/{felder['lost_reason']['id']}", json={"im_anlegen": True})).status_code == 400
        a = await _anordnung(k, "deals")
        assert next(f for g in a["gruppen"] for f in g["felder"] if f["key"] == "service_days")["im_anlegen"] is True


async def test_zugeklappte_gruppen_gehoeren_der_person(datenbank):
    async with klient_fuer("gr-klappen") as k:
        r = await k.patch("/api/mitglieder/wer/einstellungen", json={
            "zugeklappt": {"companies": ["adresse", "adresse", "vertrieb"]}, "leere_ausblenden": True,
        })
        assert r.status_code == 200, r.text
        e = r.json()["einstellungen"]
        assert e["zugeklappt"] == {"companies": ["adresse", "vertrieb"]}
        assert e["leere_ausblenden"] is True
        # Unsinn wird abgewiesen.
        for schlecht in ({"zugeklappt": {"tickets": ["x"]}}, {"zugeklappt": {"companies": ["<script>"]}}):
            assert (await k.patch("/api/mitglieder/wer/einstellungen", json=schlecht)).status_code == 422
        # Favoriten bleiben unberührt.
        await k.patch("/api/mitglieder/wer/einstellungen", json={"favoriten": ["/firmen"]})
        e = (await k.get("/api/mitglieder/wer")).json()["einstellungen"]
        assert e["favoriten"] == ["/firmen"] and e["leere_ausblenden"] is True


async def test_anlegen_nimmt_feste_und_eigene_felder_mit(datenbank):
    """Was der Dialog zusätzlich zeigt, geht mit dem POST — feste oben, eigene in custom."""
    async with klient_fuer("gr-post") as k:
        await k.post("/api/eigenschaften", json={"entity": "deals", "label": "Kammer"})
        d = (await k.post("/api/deals", json={
            "name": "Mit Zusatz", "service_days": 3, "custom": {"kammer": "IHK"},
        })).json()
    assert d["service_days"] == 3 and d["custom"]["kammer"] == "IHK"
