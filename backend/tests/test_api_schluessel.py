"""API-Schlüssel — Rocket ohne Browser aufrufen (seit 26.10.14).

Geprüft wird, was ein Programm von außen tun kann und vor allem, was
nicht: nur in seinen Bereich, nur mit der aktuellen Rolle der Person,
nicht nach dem Widerruf, nicht über eine Organisation hinaus.
"""

import contextlib
from datetime import UTC, datetime, timedelta

from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.db import acquire_as
from app.main import app
from tests.conftest import als_person, klient_fuer


@contextlib.asynccontextmanager
async def programm(schluessel: str):
    """Ein Aufrufer ohne Keks und ohne Olares-Kopf — nur mit dem Schlüssel."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="https://test",
        headers={"Authorization": f"Bearer {schluessel}"},
    ) as k:
        yield k


async def _schluessel(k, name: str = "Make", **mehr) -> dict:
    r = await k.post("/api/api-schluessel", json={"name": name, **mehr})
    assert r.status_code == 201, r.text
    return r.json()


async def _feld(k, label: str = "Branche alt", entity: str = "companies") -> dict:
    r = await k.post("/api/eigenschaften", json={"entity": entity, "label": label})
    assert r.status_code == 201, r.text
    return r.json()


async def test_der_schluessel_steht_genau_einmal_im_klartext(datenbank):
    async with klient_fuer("api-einmal") as k:
        neu = await _schluessel(k, "Skript")
        liste = (await k.get("/api/api-schluessel")).json()
    assert neu["schluessel"].startswith("rk_")
    assert neu["praefix"] == neu["schluessel"][:10]
    assert neu["bereiche"] == ["eigenschaften"]
    eintrag = next(s for s in liste if s["id"] == neu["id"])
    assert "schluessel" not in eintrag
    assert neu["schluessel"] not in str(liste)


async def test_ein_programm_benennt_ein_feld_um_und_das_protokoll_weiss_es(datenbank):
    async with klient_fuer("api-umbenennen") as k:
        feld = await _feld(k)
        firma = (await k.post("/api/companies", json={"name": "Werft", "custom": {feld["key"]: "Schiffbau"}})).json()
        schluessel = (await _schluessel(k, "Make"))["schluessel"]
        wer = (await k.get("/api/mitglieder/wer")).json()

        async with programm(schluessel) as p:
            liste = await p.get("/api/eigenschaften", params={"entity": "companies"})
            assert liste.status_code == 200, liste.text
            r = await p.patch(f"/api/eigenschaften/{feld['id']}", json={"label": "Branche"})
            assert r.status_code == 200, r.text
        assert r.json()["label"] == "Branche"
        assert r.json()["key"] == feld["key"]

        firma_neu = (await k.get(f"/api/companies/{firma['id']}")).json()
    assert firma_neu["custom"][feld["key"]] == "Schiffbau"

    async with acquire_as(wer["user_id"]) as conn:
        zugang = await conn.fetchval(
            "select actor_login from public.audit_log "
            "where entity = 'property_definitions' and entity_id = $1 and action = 'update' "
            "order by created_at desc limit 1",
            feld["id"],
        )
    assert zugang == "api:Make"


async def test_ausserhalb_des_bereichs_gilt_der_schluessel_nicht(datenbank):
    async with klient_fuer("api-bereich") as k:
        schluessel = (await _schluessel(k))["schluessel"]
    async with programm(schluessel) as p:
        assert (await p.get("/api/companies")).status_code == 403
        assert (await p.get("/api/contacts")).status_code == 403
        assert (await p.get("/api/settings")).status_code == 403
        # Kein Schlüssel erzeugt Schlüssel.
        assert (await p.get("/api/api-schluessel")).status_code == 403
        assert (await p.post("/api/api-schluessel", json={"name": "noch einer"})).status_code == 403
        # Ein ähnlicher Pfad ist nicht derselbe.
        assert (await p.get("/api/eigenschaftenX")).status_code in (403, 404)
        assert (await p.get("/api/eigenschaften/anordnung", params={"entity": "deals"})).status_code == 200


async def test_falsch_widerrufen_oder_abgelaufen_heisst_401(datenbank):
    async with klient_fuer("api-widerruf") as k:
        neu = await _schluessel(k)
        abgelaufen = await _schluessel(
            k, "kurz", laeuft_ab=(datetime.now(UTC) + timedelta(seconds=2)).isoformat()
        )
        async with programm(neu["schluessel"]) as p:
            assert (await p.get("/api/eigenschaften", params={"entity": "deals"})).status_code == 200
        assert (await k.delete(f"/api/api-schluessel/{neu['id']}")).status_code == 204
        liste = (await k.get("/api/api-schluessel")).json()
        assert next(s for s in liste if s["id"] == neu["id"])["widerrufen_am"] is not None

    async with programm(neu["schluessel"]) as p:
        assert (await p.get("/api/eigenschaften", params={"entity": "deals"})).status_code == 401
    async with programm(neu["schluessel"][:-2] + "xx") as p:
        assert (await p.get("/api/eigenschaften", params={"entity": "deals"})).status_code == 401
    async with programm("rk_" + "a" * 43) as p:
        assert (await p.get("/api/eigenschaften", params={"entity": "deals"})).status_code == 401

    async with acquire_as((await _wer("api-widerruf"))["user_id"]) as conn:
        await conn.execute(
            "update public.api_schluessel set laeuft_ab = now() - interval '1 second' where id = $1",
            abgelaufen["id"],
        )
    async with programm(abgelaufen["schluessel"]) as p:
        assert (await p.get("/api/eigenschaften", params={"entity": "deals"})).status_code == 401


async def _wer(name: str) -> dict:
    async with klient_fuer(name) as k:
        return (await k.get("/api/mitglieder/wer")).json()


async def test_ein_ablauf_in_der_vergangenheit_wird_abgelehnt(datenbank):
    async with klient_fuer("api-vergangen") as k:
        r = await k.post("/api/api-schluessel", json={
            "name": "alt", "laeuft_ab": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
        })
        assert r.status_code == 400
        r = await k.post("/api/api-schluessel", json={"name": "x", "bereiche": ["alles"]})
        assert r.status_code == 422


async def test_der_schluessel_folgt_der_rolle_und_der_mitgliedschaft(datenbank):
    """Erzeugt hat ihn eine Verwalterin. Wird sie Mitglied, liest er nur
    noch; wird sie entfernt, gilt er nicht mehr."""
    async with klient_fuer("api-rolle") as eigentuemer:
        m = (await eigentuemer.post("/api/mitglieder", json={"display_name": "Vera Verwalterin"})).json()
        r = await eigentuemer.patch(f"/api/mitglieder/{m['id']}/rolle", json={"role": "admin"})
        assert r.status_code == 200, r.text
        feld = await _feld(eigentuemer, "Region")
        async with als_person(eigentuemer, m["id"]) as vera:
            schluessel = (await _schluessel(vera, "Veras Skript"))["schluessel"]

        async with programm(schluessel) as p:
            assert (await p.patch(f"/api/eigenschaften/{feld['id']}", json={"label": "Gebiet"})).status_code == 200

        r = await eigentuemer.patch(f"/api/mitglieder/{m['id']}/rolle", json={"role": "member"})
        assert r.status_code == 200, r.text
        async with programm(schluessel) as p:
            assert (await p.get("/api/eigenschaften", params={"entity": "companies"})).status_code == 200
            assert (await p.patch(f"/api/eigenschaften/{feld['id']}", json={"label": "Zone"})).status_code == 403

        assert (await eigentuemer.delete(f"/api/mitglieder/{m['id']}")).status_code == 204
        async with programm(schluessel) as p:
            assert (await p.get("/api/eigenschaften", params={"entity": "companies"})).status_code == 401


async def test_ein_schluessel_sieht_nur_seine_organisation(datenbank):
    async with klient_fuer("api-mandant-a") as a, klient_fuer("api-mandant-b") as b:
        fremd = await _feld(b, "Geheim")
        schluessel_b = await _schluessel(b, "B")
        schluessel = (await _schluessel(a, "A"))["schluessel"]
        liste_a = (await a.get("/api/api-schluessel")).json()
    assert schluessel_b["id"] not in {s["id"] for s in liste_a}
    async with programm(schluessel) as p:
        felder = (await p.get("/api/eigenschaften", params={"entity": "companies"})).json()
        assert fremd["id"] not in {f["id"] for f in felder}
        assert (await p.patch(f"/api/eigenschaften/{fremd['id']}", json={"label": "Meins"})).status_code == 404
    async with klient_fuer("api-mandant-a") as a:
        assert (await a.delete(f"/api/api-schluessel/{schluessel_b['id']}")).status_code == 404


async def test_im_modus_eigen_hilft_der_olares_kopf_einem_falschen_schluessel_nicht(datenbank, monkeypatch):
    monkeypatch.setattr(settings, "anmeldung_modus", "eigen")
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="https://test",
        headers={"Authorization": "Bearer rk_" + "b" * 43, "X-Bfl-User": "api-modus"},
    ) as k:
        assert (await k.get("/api/eigenschaften", params={"entity": "deals"})).status_code == 401
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://test", headers={"X-Bfl-User": "api-modus"},
    ) as k:
        assert (await k.get("/api/eigenschaften", params={"entity": "deals"})).status_code == 401


async def test_ein_feld_wechselt_per_patch_die_gruppe(datenbank):
    async with klient_fuer("api-gruppe") as k:
        feld = await _feld(k, "Messe")
        ziel = (await k.post("/api/eigenschaften/gruppen", json={"entity": "companies", "label": "Messedaten"})).json()
        andere = (await k.post("/api/eigenschaften/gruppen", json={"entity": "contacts", "label": "Messedaten"})).json()
        schluessel = (await _schluessel(k))["schluessel"]
        async with programm(schluessel) as p:
            r = await p.patch(f"/api/eigenschaften/{feld['id']}", json={"group_id": ziel["id"]})
            assert r.status_code == 200, r.text
            assert r.json()["group_id"] == ziel["id"]
            assert (await p.patch(f"/api/eigenschaften/{feld['id']}", json={"group_id": andere["id"]})).status_code == 409
            assert (await p.patch(f"/api/eigenschaften/{feld['id']}", json={"group_id": None})).status_code == 400
        anordnung = (await k.get("/api/eigenschaften/anordnung", params={"entity": "companies"})).json()
    gruppe = next(g for g in anordnung["gruppen"] if g["id"] == ziel["id"])
    assert [f["key"] for f in gruppe["felder"]] == [feld["key"]]


async def test_fremde_gruppe_ist_unbekannt(datenbank):
    async with klient_fuer("api-gruppe-a") as a, klient_fuer("api-gruppe-b") as b:
        feld = await _feld(a, "Stand")
        fremd = (await b.post("/api/eigenschaften/gruppen", json={"entity": "companies", "label": "Fremd"})).json()
        r = await a.patch(f"/api/eigenschaften/{feld['id']}", json={"group_id": fremd["id"]})
    assert r.status_code == 409
