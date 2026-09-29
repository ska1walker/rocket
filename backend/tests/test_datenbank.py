"""Der Blick in die Datenbank.

Die wichtigsten Tests sind die, in denen jemand versucht, an der
Zeilensicherheit vorbeizukommen: über `set_config`, über SQL in einem
Text (`query_to_xml`), über ein WITH, das wie eine echte Tabelle heißt.
Jeder davon wäre ohne die Prüfung in `app.datenbank` ein Weg in die
Sitzungen einer anderen Person.
"""

from uuid import UUID

import pytest

from app import datenbank as blick
from app.db import acquire
from tests.conftest import klient_fuer


async def _als(klient, rolle: str) -> None:
    wer = (await klient.get("/api/mitglieder/wer")).json()
    async with acquire() as conn:
        await conn.execute(
            "update public.user_org_roles set role = $1::user_role where user_id = $2",
            rolle, UUID(wer["user_id"]),
        )


async def _sql(klient, sql: str):
    return await klient.post("/api/datenbank/abfrage", json={"sql": sql})


# ---- Wer darf -----------------------------------------------------------


async def test_ein_mitglied_bekommt_403(datenbank):
    async with klient_fuer("db-mitglied") as k:
        await _als(k, "member")
        assert (await k.get("/api/datenbank/tabellen")).status_code == 403
        assert (await _sql(k, "select 1")).status_code == 403


async def test_ein_verwalter_darf(datenbank):
    async with klient_fuer("db-verwalter") as k:
        await _als(k, "admin")
        assert (await k.get("/api/datenbank/tabellen")).status_code == 200
        assert (await _sql(k, "select 1 as eins")).json()["zeilen"] == [[1]]


# ---- Was man sieht ------------------------------------------------------


async def test_die_uebersicht_zaehlt_unter_zeilensicherheit(datenbank):
    """Ein fremder Datenbank-Browser sähe hier 0 — Rocket sieht die eigenen Zeilen."""
    async with klient_fuer("db-zaehlen") as k:
        await k.post("/api/companies", json={"name": "Zählfirma"})
        uebersicht = (await k.get("/api/datenbank/tabellen")).json()
    firmen = next(t for t in uebersicht["frei"] if t["name"] == "companies")
    assert firmen["zeilen"] == 1
    assert "name" in {s["name"] for s in firmen["spalten"]}
    assert {g["name"] for g in uebersicht["gesperrt"]} == set(blick.GESPERRT)


async def test_fremde_organisation_bleibt_unsichtbar(datenbank):
    async with klient_fuer("db-fremd-a") as a:
        await a.post("/api/companies", json={"name": "Geheime Firma A"})
    async with klient_fuer("db-fremd-b") as b:
        antwort = await _sql(b, "select name from companies")
        seite = await b.get("/api/datenbank/tabellen/companies")
    assert ["Geheime Firma A"] not in antwort.json()["zeilen"]
    assert all("Geheime Firma A" not in z for z in seite.json()["zeilen"])


async def test_tabelle_blaettern_sortieren_suchen(datenbank):
    async with klient_fuer("db-blaettern") as k:
        for name in ("Bertram", "Anton", "Carla"):
            await k.post("/api/companies", json={"name": name})
        sortiert = (await k.get("/api/datenbank/tabellen/companies", params={"sort": "name"})).json()
        gefunden = (await k.get("/api/datenbank/tabellen/companies", params={
            "spalte": "name", "suche": "arl",
        })).json()
    i = sortiert["spalten"].index("name")
    assert [z[i] for z in sortiert["zeilen"]] == ["Anton", "Bertram", "Carla"]
    assert gefunden["gesamt"] == 1
    assert gefunden["zeilen"][0][i] == "Carla"


async def test_unbekannte_spalte_wird_abgewiesen(datenbank):
    async with klient_fuer("db-spalte") as k:
        antwort = await k.get("/api/datenbank/tabellen/companies", params={"sort": "name; drop table x"})
    assert antwort.status_code == 400


async def test_gesperrte_tabelle_laesst_sich_nicht_blaettern(datenbank):
    async with klient_fuer("db-gesperrt") as k:
        assert (await k.get("/api/datenbank/tabellen/sitzungen")).status_code == 403
        assert (await k.get("/api/datenbank/tabellen/gibtsnicht")).status_code == 404


# ---- Was abgewiesen wird ------------------------------------------------


@pytest.mark.parametrize("sql, grund", [
    ("insert into companies (name) values ('x')", "SELECT"),
    ("update companies set name = 'x'", "SELECT"),
    ("delete from companies", "SELECT"),
    ("drop table companies", "SELECT"),
    ("select 1; select 2", "genau eine"),
    ("select * from users", "gesperrt"),
    ("select token_hash from sitzungen", "gesperrt"),
    ("select * from org_settings", "gesperrt"),
    ("select * from pg_catalog.pg_authid", "Schema public"),
    ("select * from pg_shadow", "keine freigegebene"),
    # Die eigentliche Lücke: die Kennung umsetzen, auf der die Zeilensicherheit steht.
    ("select set_config('app.current_user_id', '00000000-0000-0000-0000-000000000000', true)", "set_config"),
    ("select pg_catalog.set_config('app.current_user_id', 'x', false)", "set_config"),
    ("select query_to_xml('select * from sitzungen', true, true, '')", "query_to_xml"),
    ("select * from companies where name = (select current_setting('app.current_user_id'))", "current_setting"),
    ("select pg_sleep(30)", "pg_sleep"),
    # Ein WITH, das wie eine echte Tabelle heißt, verdeckte sie vor der Prüfung.
    ("select * from users, (with users as (select 1) select * from users) s", "WITH"),
    ("select * into kopie from companies", "SELECT INTO"),
    ("select * from companies for update", "FOR UPDATE"),
    ("selec 1", "kein gültiges SQL"),
])
async def test_abgewiesen(datenbank, sql, grund):
    async with klient_fuer("db-abweisen") as k:
        antwort = await _sql(k, sql)
    assert antwort.status_code == 400, antwort.text
    assert grund in antwort.json()["detail"]


def test_erlaubtes_kommt_durch():
    for sql in (
        "select name, count(*) from companies group by name order by 2 desc",
        "with offen as (select * from deals where closed_at is null) select count(*) from offen",
        "select lower(email), date_trunc('month', created_at) from contacts",
        "select c.name, (select count(*) from contacts k where k.company_id = c.id) from companies c",
        "table companies",
        "values (1, 'a')",
    ):
        blick.pruefen(sql)


# ---- Die Schlösser hinter der Prüfung ------------------------------------


async def test_schreiben_scheitert_auch_hinter_der_pruefung(datenbank, monkeypatch):
    """Käme etwas durch die Prüfung, hält die Transaktion es trotzdem auf."""
    monkeypatch.setattr("app.routers.datenbank.pruefen", lambda sql: None)
    async with klient_fuer("db-schloss") as k:
        antwort = await _sql(k, "insert into companies (name) values ('durchgerutscht')")
        zaehlung = await _sql(k, "select count(*) from companies where name = 'durchgerutscht'")
    assert antwort.status_code == 400
    assert "nur gelesen" in antwort.json()["detail"]
    assert zaehlung.json()["zeilen"] == [[0]]


async def test_zeitlimit_bricht_ab(datenbank, monkeypatch):
    monkeypatch.setattr("app.routers.datenbank.ZEITLIMIT_MS", 200)
    monkeypatch.setattr("app.routers.datenbank.pruefen", lambda sql: None)
    async with klient_fuer("db-zeit") as k:
        antwort = await _sql(k, "select pg_sleep(2)")
    assert antwort.status_code == 400
    assert "abgebrochen" in antwort.json()["detail"]


async def test_hoechstens_tausend_zeilen(datenbank):
    async with klient_fuer("db-viel") as k:
        antwort = (await _sql(k, "select * from generate_series(1, 1500)")).json()
    assert len(antwort["zeilen"]) == blick.HOECHSTENS_ZEILEN
    assert antwort["abgeschnitten"] is True


# ---- Protokoll und Ausfuhr ----------------------------------------------


async def test_jede_abfrage_steht_im_protokoll(datenbank):
    async with klient_fuer("db-protokoll") as k:
        await _sql(k, "select 42")
        await _sql(k, "select * from users")
        eintraege = (await _sql(k, "select 1")).json()  # noqa: F841
        wer = (await k.get("/api/mitglieder/wer")).json()
    async with acquire() as conn:
        await conn.execute("select set_config('app.current_user_id', $1, false)", wer["user_id"])
        diffs = [
            r["diff"] for r in await conn.fetch(
                "select diff::text as diff from public.audit_log "
                "where entity = 'datenbank' and actor_id = $1 order by created_at",
                UUID(wer["user_id"]),
            )
        ]
        await conn.execute("select set_config('app.current_user_id', '', false)")
    assert any("select 42" in d for d in diffs)
    assert any("abgewiesen" in d and "select * from users" in d for d in diffs)


async def test_ausfuhr_als_csv(datenbank):
    async with klient_fuer("db-csv") as k:
        await k.post("/api/companies", json={"name": "=HYPERLINK(1)"})
        antwort = await k.post("/api/datenbank/abfrage/csv", json={"sql": "select name from companies"})
        abgewiesen = await k.post("/api/datenbank/abfrage/csv", json={"sql": "select * from users"})
    assert antwort.status_code == 200
    assert antwort.text.startswith("﻿name")
    # Formelschutz: Excel soll das nicht ausführen.
    assert "'=HYPERLINK(1)" in antwort.text
    assert "rocket-abfrage-" in antwort.headers["content-disposition"]
    assert abgewiesen.status_code == 400


# ---- Die Wache ------------------------------------------------------------


async def test_jede_tabelle_ist_frei_oder_gesperrt(datenbank):
    """Eine neue Tabelle muss hier entschieden werden — sonst wäre die
    nächste mit einem Geheimnis von selbst sichtbar oder fehlte still."""
    async with acquire() as conn:
        tabellen = {
            r["table_name"] for r in await conn.fetch(
                "select table_name from information_schema.tables "
                "where table_schema = 'public' and table_type = 'BASE TABLE'"
            )
        }
    unentschieden = tabellen - blick.FREI - set(blick.GESPERRT)
    assert not unentschieden, f"Weder FREI noch GESPERRT: {sorted(unentschieden)}"
    assert not (blick.FREI & set(blick.GESPERRT))
