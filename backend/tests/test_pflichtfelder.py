"""Stufe C aus docs/PLAN-EIGENSCHAFTEN.md: Pflichtfelder und neue Arten."""

import pytest

from app.eigenschaften import Ungueltig, pruefen
from tests.conftest import klient_fuer


def _def(key, kind, options=None, label=None):
    return {"key": key, "label": label or key.title(), "kind": kind, "options": options or []}


# ---- neue Arten ----------------------------------------------------------


def test_url_nur_mit_schema_und_nie_javascript():
    d = [_def("web", "url")]
    assert pruefen({"web": "https://aimighty.de/x"}, d) == {"web": "https://aimighty.de/x"}
    for schlecht in ("aimighty.de", "javascript:alert(1)", "data:text/html,x", "ftp://x.de"):
        with pytest.raises(Ungueltig):
            pruefen({"web": schlecht}, d)


def test_email_und_telefon():
    d = [_def("mail", "email"), _def("tel", "phone")]
    assert pruefen({"mail": " a@b.de ", "tel": "+49 (221) 123-45"}, d) == {"mail": "a@b.de", "tel": "+49 (221) 123-45"}
    with pytest.raises(Ungueltig):
        pruefen({"mail": "keine-adresse"}, d)
    with pytest.raises(Ungueltig):
        pruefen({"tel": "ruf an"}, d)


def test_betrag_in_ganzen_cent_ohne_runden():
    d = [_def("wert", "currency")]
    assert pruefen({"wert": 150050}, d) == {"wert": 150050}
    assert pruefen({"wert": "99"}, d) == {"wert": 99}
    assert pruefen({"wert": 12.0}, d) == {"wert": 12}
    for schlecht in (12.5, -1, "12,50", True):
        with pytest.raises(Ungueltig):
            pruefen({"wert": schlecht}, d)


def test_langer_text():
    assert pruefen({"n": "Zeile 1\nZeile 2"}, [_def("n", "textarea")]) == {"n": "Zeile 1\nZeile 2"}


async def test_person_muss_zur_organisation_gehoeren(datenbank):
    async with klient_fuer("pf-person-a") as a, klient_fuer("pf-person-b") as b:
        await a.post("/api/eigenschaften", json={"entity": "companies", "label": "Betreuer", "kind": "user"})
        ich = (await a.get("/api/mitglieder/wer")).json()["user_id"]
        fremd = (await b.get("/api/mitglieder/wer")).json()["user_id"]
        f = (await a.post("/api/companies", json={"name": "Betreut", "custom": {"betreuer": ich}})).json()
        assert f["custom"]["betreuer"] == ich
        r = await a.patch(f"/api/companies/{f['id']}", json={"custom": {"betreuer": fremd}})
        assert r.status_code == 400 and "gehört nicht" in r.json()["detail"]
        r = await a.patch(f"/api/companies/{f['id']}", json={"custom": {"betreuer": "kein-uuid"}})
        assert r.status_code == 400


async def test_neue_arten_ueber_die_schnittstelle(datenbank):
    async with klient_fuer("pf-arten") as k:
        for label, kind in (("Portal", "url"), ("Rechnungsmail", "email"), ("Zentrale", "phone"),
                            ("Budget", "currency"), ("Historie", "textarea")):
            r = await k.post("/api/eigenschaften", json={"entity": "deals", "label": label, "kind": kind})
            assert r.status_code == 201, r.text
        d = (await k.post("/api/deals", json={"name": "Arten", "custom": {
            "portal": "https://kunde.de", "rechnungsmail": "rechnung@kunde.de",
            "zentrale": "+49 221 1", "budget": 5000000, "historie": "a\nb",
        }})).json()
        assert d["custom"]["budget"] == 5000000
        a = (await k.get("/api/eigenschaften/anordnung", params={"entity": "deals"})).json()
        arten = {f["key"]: f["art"] for g in a["gruppen"] for f in g["felder"]}
        assert arten["budget"] == "currency" and arten["portal"] == "url"


# ---- Pflichtfelder -------------------------------------------------------


async def _pflicht(k, entity, key):
    a = (await k.get("/api/eigenschaften/anordnung", params={"entity": entity})).json()
    f = next(f for g in a["gruppen"] for f in g["felder"] if f["key"] == key)
    return await k.patch(f"/api/eigenschaften/{f['id']}", json={"required": True})


async def test_pflicht_beim_anlegen_und_leeren(datenbank):
    async with klient_fuer("pf-anlegen") as k:
        await k.post("/api/eigenschaften", json={"entity": "companies", "label": "Kammer"})
        assert (await _pflicht(k, "companies", "kammer")).status_code == 200
        assert (await _pflicht(k, "companies", "city")).status_code == 200

        r = await k.post("/api/companies", json={"name": "Ohne"})
        assert r.status_code == 422
        assert "Kammer" in r.json()["detail"] and "Ort" in r.json()["detail"]
        r = await k.post("/api/companies", json={"name": "Mit", "city": "Köln", "custom": {"kammer": "IHK"}})
        assert r.status_code == 201, r.text
        fid = r.json()["id"]

        # Leeren geht nicht — weder fest noch eigen.
        assert (await k.patch(f"/api/companies/{fid}", json={"city": None})).status_code == 422
        assert (await k.patch(f"/api/companies/{fid}", json={"city": "  "})).status_code == 422
        assert (await k.patch(f"/api/companies/{fid}", json={"custom": {"kammer": None}})).status_code == 422
        # Anderes ändern geht.
        assert (await k.patch(f"/api/companies/{fid}", json={"industry": "Handel"})).status_code == 200


async def test_alte_datensaetze_bleiben_bearbeitbar(datenbank):
    """Nichts wird rückwirkend gesperrt."""
    async with klient_fuer("pf-alt") as k:
        alt = (await k.post("/api/contacts", json={"last_name": "Alt"})).json()
        assert (await _pflicht(k, "contacts", "email")).status_code == 200
        r = await k.patch(f"/api/contacts/{alt['id']}", json={"job_title": "Leitung"})
        assert r.status_code == 200, r.text
        assert (await k.post("/api/contacts", json={"last_name": "Neu"})).status_code == 422


async def test_gerechnetes_und_eigener_weg_werden_nie_pflicht(datenbank):
    async with klient_fuer("pf-nie") as k:
        assert (await _pflicht(k, "deals", "probability")).status_code == 400
        assert (await _pflicht(k, "deals", "lost_reason")).status_code == 400
        assert (await _pflicht(k, "contacts", "marketing_einwilligung")).status_code == 400
        assert (await _pflicht(k, "deals", "close_date")).status_code == 200
        assert (await k.post("/api/deals", json={"name": "Ohne Datum"})).status_code == 422


async def test_archivierte_pflicht_zaehlt_nicht(datenbank):
    async with klient_fuer("pf-archiv") as k:
        d = (await k.post("/api/eigenschaften", json={"entity": "companies", "label": "Region"})).json()
        await k.patch(f"/api/eigenschaften/{d['id']}", json={"required": True})
        assert (await k.post("/api/companies", json={"name": "A"})).status_code == 422
        await k.delete(f"/api/eigenschaften/{d['id']}")
        assert (await k.post("/api/companies", json={"name": "B"})).status_code == 201


async def test_einfuhr_ist_ausgenommen(datenbank):
    """Eine Messeliste scheitert nicht an einem Feld, das auf ihr nicht steht."""
    async with klient_fuer("pf-einfuhr") as k:
        await _pflicht(k, "companies", "city")
        csv = b"Firma;Branche\nMesse GmbH;Handel\n"
        r = await k.post(
            "/api/einfuhr", data={"entity": "companies"},
            files={"datei": ("messe.csv", csv, "text/csv")},
        )
        assert r.status_code == 200, r.text
        namen = [f["name"] for f in (await k.get("/api/companies")).json()]
        assert "Messe GmbH" in namen


async def test_neue_arten_lassen_sich_filtern(datenbank):
    async with klient_fuer("pf-filter") as k:
        await k.post("/api/eigenschaften", json={"entity": "companies", "label": "Betreuer", "kind": "user"})
        await k.post("/api/eigenschaften", json={"entity": "companies", "label": "Portal", "kind": "url"})
        ich = (await k.get("/api/mitglieder/wer")).json()["user_id"]
        await k.post("/api/companies", json={"name": "Mit Betreuer", "custom": {"betreuer": ich, "portal": "https://a.de"}})
        await k.post("/api/companies", json={"name": "Ohne"})
        felder = {f["schluessel"]: f for f in (await k.get("/api/ansichten/felder", params={"entity": "companies"})).json()["felder"]}
        assert felder["custom.betreuer"]["art"] == "person"
        assert felder["custom.portal"]["art"] == "text"
