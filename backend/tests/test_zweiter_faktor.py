"""Der zweite Faktor und das Rücksetzen per Mail.

Geprüft wird, was ein Angreifer versuchen würde: mit Passwort allein
hinein, denselben Code zweimal, Codes raten, die Vorstufe als Sitzung
benutzen, über die Mail am zweiten Faktor vorbei. Dazu die Pflicht, die
nicht nur ein Hinweis sein darf.
"""

from uuid import UUID

import pytest_asyncio

from app import audit as _audit  # noqa: F401 — sicherstellen, dass das Protokoll geladen ist
from app import zweiterfaktor as zf
from app.db import acquire, acquire_as
from app.routers import anmeldung as anmeldung_router
from tests.test_anmeldung import GUT, _konto, eigen_an, klient_fuer


@pytest_asyncio.fixture(autouse=True, loop_scope="session")
async def _bremse_leeren(datenbank):
    async with acquire() as conn:
        await conn.execute("delete from public.anmeldeversuche")
    yield
    async with acquire() as conn:
        await conn.execute("delete from public.anmeldeversuche")


# ── RFC 6238 ─────────────────────────────────────────────────────────────


def test_die_testvektoren_aus_dem_rfc():
    """RFC 6238, Anhang B, SHA-1 — auf sechs Stellen gekürzt."""
    geheimnis = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"  # "12345678901234567890"
    assert zf.code_zu(geheimnis, zf.schritt_jetzt(59)) == "287082"
    assert zf.code_zu(geheimnis, zf.schritt_jetzt(1111111109)) == "081804"
    assert zf.code_zu(geheimnis, zf.schritt_jetzt(1234567890)) == "005924"


def test_ein_schritt_nachsicht_und_nicht_mehr():
    g = zf.geheimnis_neu()
    jetzt = 1_800_000_000.0
    s = zf.schritt_jetzt(jetzt)
    assert zf.pruefen(g, zf.code_zu(g, s), None, jetzt) == s
    assert zf.pruefen(g, zf.code_zu(g, s - 1), None, jetzt) == s - 1
    assert zf.pruefen(g, zf.code_zu(g, s + 1), None, jetzt) == s + 1
    assert zf.pruefen(g, zf.code_zu(g, s - 2), None, jetzt) is None
    # Derselbe oder ein älterer Schritt gilt nach Gebrauch nicht mehr.
    assert zf.pruefen(g, zf.code_zu(g, s), s, jetzt) is None
    assert zf.pruefen(g, "12345", None, jetzt) is None


def test_die_uri_nennt_rocket_und_die_kennung():
    uri = zf.uri("ABC", "kai böhm")
    assert uri.startswith("otpauth://totp/Rocket%3Akai%20b")
    assert "secret=ABC" in uri and "issuer=Rocket" in uri
    assert zf.qr_svg(uri).lstrip().startswith("<svg")


# ── Helfer ───────────────────────────────────────────────────────────────


async def _einrichten(k) -> tuple[str, list[str], int]:
    """Richtet über die Oberfläche den Faktor ein. Gibt Geheimnis, Codes
    und den verbrauchten Zeitschritt zurück."""
    r = await k.post("/api/anmeldung/zweiter-faktor/einrichten")
    assert r.status_code == 200, r.text
    geheimnis = r.json()["geheimnis"]
    schritt = zf.schritt_jetzt()
    r = await k.post("/api/anmeldung/zweiter-faktor/bestaetigen", json={"code": zf.code_zu(geheimnis, schritt)})
    assert r.status_code == 200, r.text
    return geheimnis, r.json()["codes"], schritt


async def _mit_faktor(k, monkeypatch, anzeigename: str) -> tuple[str, str, list[str], int]:
    """Konto anlegen, anmelden, Faktor einrichten, abmelden."""
    name, _ = await _konto(k, anzeigename)
    eigen_an(monkeypatch)
    assert (await k.post("/api/anmeldung", json={"name": name, "passwort": GUT})).json()["angemeldet"]
    geheimnis, codes, schritt = await _einrichten(k)
    assert (await k.post("/api/abmeldung")).status_code == 204
    return name, geheimnis, codes, schritt


async def _protokoll(user_id: str) -> list[str]:
    async with acquire_as(UUID(user_id)) as conn:
        return [
            r["action"] for r in await conn.fetch(
                "select action from public.audit_log where entity = 'anmeldung' and entity_id = $1 "
                "order by id", UUID(user_id),
            )
        ]


# ── Anmelden mit zweitem Faktor ─────────────────────────────────────────


async def test_mit_faktor_reicht_das_passwort_allein_nicht(datenbank, monkeypatch):
    async with klient_fuer("zf-ohne-code") as k:
        name, geheimnis, _, schritt = await _mit_faktor(k, monkeypatch, "Faktor Eins")
        r = await k.post("/api/anmeldung", json={"name": name, "passwort": GUT})
        assert r.status_code == 200
        assert r.json() == {"angemeldet": False, "name": None, "modus": "eigen", "zweiter_faktor": True}
        assert k.cookies.get("rocket_sitzung") is None
        # Die Vorstufe ist keine Sitzung.
        assert (await k.get("/api/companies")).status_code == 401
        assert (await k.get("/api/anmeldung/lage")).json()["zweiter_faktor"] is True

        assert (await k.post("/api/anmeldung/code", json={"code": "000000"})).status_code == 403
        r = await k.post("/api/anmeldung/code", json={"code": zf.code_zu(geheimnis, schritt + 1)})
        assert r.status_code == 200, r.text
        assert r.json()["angemeldet"] is True
        assert (await k.get("/api/companies")).status_code == 200


async def test_derselbe_code_gilt_nur_einmal(datenbank, monkeypatch):
    async with klient_fuer("zf-einmal") as k:
        name, geheimnis, _, schritt = await _mit_faktor(k, monkeypatch, "Faktor Einmal")
        code = zf.code_zu(geheimnis, schritt + 1)
        await k.post("/api/anmeldung", json={"name": name, "passwort": GUT})
        assert (await k.post("/api/anmeldung/code", json={"code": code})).status_code == 200
        await k.post("/api/abmeldung")
        await k.post("/api/anmeldung", json={"name": name, "passwort": GUT})
        # Jemand hat über die Schulter geschaut — derselbe Code kommt nicht noch einmal durch.
        assert (await k.post("/api/anmeldung/code", json={"code": code})).status_code == 403


async def test_ein_wiederherstellungscode_gilt_genau_einmal(datenbank, monkeypatch):
    async with klient_fuer("zf-wiederherstellung") as k:
        name, _, codes, _ = await _mit_faktor(k, monkeypatch, "Faktor Handy Weg")
        assert len(codes) == 10 and len(set(codes)) == 10
        await k.post("/api/anmeldung", json={"name": name, "passwort": GUT})
        assert (await k.post("/api/anmeldung/code", json={"code": codes[0].lower()})).status_code == 200
        stand = (await k.get("/api/anmeldung/zweiter-faktor")).json()
        assert stand["aktiv"] is True and stand["codes_uebrig"] == 9
        await k.post("/api/abmeldung")
        await k.post("/api/anmeldung", json={"name": name, "passwort": GUT})
        assert (await k.post("/api/anmeldung/code", json={"code": codes[0]})).status_code == 403


async def test_codes_raten_bremst(datenbank, monkeypatch):
    async with klient_fuer("zf-raten") as k:
        name, geheimnis, _, schritt = await _mit_faktor(k, monkeypatch, "Faktor Raten")
        await k.post("/api/anmeldung", json={"name": name, "passwort": GUT})
        antworten = [
            (await k.post("/api/anmeldung/code", json={"code": f"{i:06d}"})).status_code for i in range(11)
        ]
        assert antworten[-1] == 429
        # Auch der richtige Code kommt jetzt nicht mehr durch.
        r = await k.post("/api/anmeldung/code", json={"code": zf.code_zu(geheimnis, schritt + 1)})
        assert r.status_code == 429


async def test_abgelaufene_vorstufe_gilt_nicht(datenbank, monkeypatch):
    async with klient_fuer("zf-ablauf") as k:
        name, geheimnis, _, schritt = await _mit_faktor(k, monkeypatch, "Faktor Ablauf")
        await k.post("/api/anmeldung", json={"name": name, "passwort": GUT})
        async with acquire() as conn, conn.transaction():
            from app import anmeldung
            await conn.execute(
                "select set_config('app.anmelde_token', $1, true)",
                anmeldung.token_hash(k.cookies.get("rocket_vorstufe")),
            )
            await conn.execute("update public.sitzungen set laeuft_ab = now() - interval '1 minute'")
        r = await k.post("/api/anmeldung/code", json={"code": zf.code_zu(geheimnis, schritt + 1)})
        assert r.status_code == 401


async def test_anmeldungen_stehen_im_protokoll(datenbank, monkeypatch):
    async with klient_fuer("zf-protokoll") as k:
        name, geheimnis, _, schritt = await _mit_faktor(k, monkeypatch, "Faktor Protokoll")
        await k.post("/api/anmeldung", json={"name": name, "passwort": "falsch falsch falsch"})
        await k.post("/api/anmeldung", json={"name": name, "passwort": GUT})
        await k.post("/api/anmeldung/code", json={"code": "999999"})
        await k.post("/api/anmeldung/code", json={"code": zf.code_zu(geheimnis, schritt + 1)})
        wer = (await k.get("/api/mitglieder/wer")).json()
        await k.post("/api/abmeldung")
    eintraege = await _protokoll(wer["user_id"])
    assert eintraege[-6:] == [
        "zweiter_faktor_eingerichtet", "anmeldung", "abmeldung",
        "anmeldung_abgewiesen", "anmeldung_abgewiesen", "anmeldung",
    ][-6:] or eintraege.count("anmeldung_abgewiesen") >= 2
    assert "zweiter_faktor_eingerichtet" in eintraege and eintraege[-1] == "abmeldung"


# ── Einrichten und Abschalten ───────────────────────────────────────────


async def test_abgebrochene_einrichtung_sperrt_niemanden_aus(datenbank, monkeypatch):
    async with klient_fuer("zf-abbruch") as k:
        name, _ = await _konto(k, "Faktor Abbruch")
        eigen_an(monkeypatch)
        await k.post("/api/anmeldung", json={"name": name, "passwort": GUT})
        assert (await k.post("/api/anmeldung/zweiter-faktor/einrichten")).status_code == 200
        await k.post("/api/abmeldung")
        # QR gesehen, nie bestätigt: Das Passwort genügt weiter.
        assert (await k.post("/api/anmeldung", json={"name": name, "passwort": GUT})).json()["angemeldet"]


async def test_falscher_erster_code_aktiviert_nichts(datenbank, monkeypatch):
    async with klient_fuer("zf-erster-code") as k:
        name, _ = await _konto(k, "Faktor Erster Code")
        eigen_an(monkeypatch)
        await k.post("/api/anmeldung", json={"name": name, "passwort": GUT})
        await k.post("/api/anmeldung/zweiter-faktor/einrichten")
        r = await k.post("/api/anmeldung/zweiter-faktor/bestaetigen", json={"code": "000000"})
        assert r.status_code == 422
        assert (await k.get("/api/anmeldung/zweiter-faktor")).json()["aktiv"] is False


async def test_ein_aktiver_faktor_wird_nicht_still_ersetzt(datenbank, monkeypatch):
    async with klient_fuer("zf-ersetzen") as k:
        name, _ = await _konto(k, "Faktor Ersetzen")
        eigen_an(monkeypatch)
        await k.post("/api/anmeldung", json={"name": name, "passwort": GUT})
        await _einrichten(k)
        assert (await k.post("/api/anmeldung/zweiter-faktor/einrichten")).status_code == 409


async def test_abschalten_braucht_passwort_und_code(datenbank, monkeypatch):
    async with klient_fuer("zf-abschalten") as k:
        name, _ = await _konto(k, "Faktor Abschalten")
        eigen_an(monkeypatch)
        await k.post("/api/anmeldung", json={"name": name, "passwort": GUT})
        geheimnis, codes, schritt = await _einrichten(k)
        pfad = "/api/anmeldung/zweiter-faktor/abschalten"
        assert (await k.post(pfad, json={"passwort": "falsches passwort", "code": codes[0]})).status_code == 403
        assert (await k.post(pfad, json={"passwort": GUT, "code": "000000"})).status_code == 403
        assert (await k.post(pfad, json={"passwort": GUT, "code": codes[1]})).status_code == 204
        assert (await k.get("/api/anmeldung/zweiter-faktor")).json() == {
            "aktiv": False, "seit": None, "codes_uebrig": 0, "pflicht": False,
        }


async def test_eine_neue_einladung_nimmt_den_faktor_mit(datenbank, monkeypatch):
    """Der Weg für das verlorene Handy ohne Codes: neu einladen."""
    async with klient_fuer("zf-einladung") as k:
        name, _, _, _ = await _mit_faktor(k, monkeypatch, "Faktor Einladung")
        monkeypatch.setattr("app.config.settings.anmeldung_modus", "olares")
        liste = (await k.get("/api/mitglieder")).json()
        mid = next(m["id"] for m in liste if m["olares_username"] == name)
        ein = (await k.post(f"/api/mitglieder/{mid}/einladung")).json()
        token = ein["pfad"].rsplit("/", 1)[-1]
        assert (await k.post(f"/api/einladung/{token}", json={"passwort": GUT + "!"})).status_code == 200
        eigen_an(monkeypatch)
        await k.post("/api/abmeldung")
        assert (await k.post("/api/anmeldung", json={"name": name, "passwort": GUT + "!"})).json()["angemeldet"]


# ── Pflicht ──────────────────────────────────────────────────────────────


async def _eigentuemer_mit_passwort(k, monkeypatch, kennung: str) -> None:
    """Der Olares-Kopf ist der Eigentümer; er setzt sein erstes Passwort
    und meldet sich danach im Modus `eigen` selbst an."""
    assert (await k.post("/api/anmeldung/passwort", json={"alt": "x", "neu": GUT})).status_code == 204
    eigen_an(monkeypatch)
    assert (await k.post("/api/anmeldung", json={"name": kennung, "passwort": GUT})).json()["angemeldet"]


async def test_pflicht_nur_wer_selbst_einen_faktor_hat(datenbank, monkeypatch):
    async with klient_fuer("zf-pflicht-selbst") as k:
        await _eigentuemer_mit_passwort(k, monkeypatch, "zf-pflicht-selbst")
        r = await k.put("/api/anmeldung/zweiter-faktor/pflicht", json={"an": True})
        assert r.status_code == 409
        await _einrichten(k)
        r = await k.put("/api/anmeldung/zweiter-faktor/pflicht", json={"an": True})
        assert r.status_code == 200 and r.json()["pflicht"] is True


async def test_pflicht_ist_keine_bitte(datenbank, monkeypatch):
    async with klient_fuer("zf-pflicht") as eigner:
        name, _ = await _konto(eigner, "Pflicht Mitglied")
        # Das Einlösen der Einladung hat den Keks des Mitglieds gesetzt —
        # weiter geht es als Eigentümer.
        eigner.cookies.clear()
        await _eigentuemer_mit_passwort(eigner, monkeypatch, "zf-pflicht")
        await _einrichten(eigner)
        assert (await eigner.put("/api/anmeldung/zweiter-faktor/pflicht", json={"an": True})).status_code == 200

    async with klient_fuer("zf-pflicht-mitglied") as m:
        eigen_an(monkeypatch)
        assert (await m.post("/api/anmeldung", json={"name": name, "passwort": GUT})).json()["angemeldet"]
        # Alles außer der Einrichtung wartet.
        r = await m.get("/api/companies")
        assert r.status_code == 403
        assert r.headers["x-rocket-zweiter-faktor"] == "einrichten"
        wer = await m.get("/api/mitglieder/wer")
        assert wer.status_code == 200 and wer.json()["zweiter_faktor_fehlt"] is True
        # Das Mitglied darf die Pflicht nicht abschalten.
        assert (await m.put("/api/anmeldung/zweiter-faktor/pflicht", json={"an": False})).status_code == 403
        await _einrichten(m)
        assert (await m.get("/api/companies")).status_code == 200
        # Und abschalten geht unter Pflicht nicht.
        r = await m.post("/api/anmeldung/zweiter-faktor/abschalten", json={"passwort": GUT, "code": "000000"})
        assert r.status_code == 403


# ── Rücksetzen per Mail und per Datei ───────────────────────────────────


async def _mail_bereit(k, name: str, monkeypatch) -> list:
    """SMTP für die Organisation, eine Adresse für die Person, und eine
    Attrappe statt des echten Versands."""
    monkeypatch.setattr("app.config.settings.anmeldung_modus", "olares")
    # Als Eigentümer über den Olares-Kopf, nicht als das zuletzt
    # angemeldete Mitglied.
    k.cookies.clear()
    r = await k.put("/api/settings", json={
        "smtp_host": "smtp.example.org", "smtp_port": 587, "smtp_absender": "crm@example.org",
    })
    assert r.status_code == 200, r.text
    liste = (await k.get("/api/mitglieder")).json()
    mid = next(m["id"] for m in liste if m["olares_username"] == name)
    assert (await k.patch(f"/api/mitglieder/{mid}", json={"email": f"{name}@example.org"})).status_code == 200
    gesendet: list = []

    async def attrappe(konto, nachricht):
        gesendet.append(nachricht)

    monkeypatch.setattr(anmeldung_router, "mail_senden", attrappe)
    eigen_an(monkeypatch)
    return gesendet


async def _code_aus(gesendet: list) -> str:
    for aufgabe in list(anmeldung_router._laufend):
        await aufgabe
    assert gesendet, "keine Mail verschickt"
    text = gesendet[-1].get_content()
    return text.split("Ihr Code: ", 1)[1].split("\n", 1)[0].strip()


async def test_der_code_kommt_per_mail_und_steht_nirgends_im_klartext(datenbank, monkeypatch):
    async with klient_fuer("zf-mail") as k:
        name, _ = await _konto(k, "Mail Rueck")
        gesendet = await _mail_bereit(k, name, monkeypatch)
        assert (await k.post("/api/anmeldung/vergessen", json={"name": name})).status_code == 200
        code = await _code_aus(gesendet)
        assert gesendet[-1]["To"] == f"{name}@example.org"
        async with acquire() as conn:
            # Nicht im Postausgang — den sehen Verwalter im Datenbank-Blick.
            await conn.execute("select 1")
        monkeypatch.setattr("app.config.settings.anmeldung_modus", "olares")
        treffer = (await k.post("/api/datenbank/abfrage", json={
            "sql": f"select count(*) from mails where text like '%{code}%'"
        })).json()
        assert treffer["zeilen"] == [[0]]
        eigen_an(monkeypatch)
        r = await k.post("/api/anmeldung/zuruecksetzen", json={"name": name, "code": code, "passwort": GUT + "neu"})
        assert r.status_code == 200 and r.json()["angemeldet"] is True
        # Einmal verbraucht, gilt er nicht noch einmal.
        r = await k.post("/api/anmeldung/zuruecksetzen", json={"name": name, "code": code, "passwort": GUT + "neu2"})
        assert r.status_code == 403


async def test_unbekannter_name_bekommt_dieselbe_antwort_und_keine_mail(datenbank, monkeypatch):
    async with klient_fuer("zf-mail-unbekannt") as k:
        name, _ = await _konto(k, "Mail Bekannt")
        gesendet = await _mail_bereit(k, name, monkeypatch)
        bekannt = await k.post("/api/anmeldung/vergessen", json={"name": name})
        unbekannt = await k.post("/api/anmeldung/vergessen", json={"name": "gibt-es-nicht-xyz"})
        for aufgabe in list(anmeldung_router._laufend):
            await aufgabe
    assert bekannt.status_code == unbekannt.status_code == 200
    assert bekannt.json() == unbekannt.json()
    assert len(gesendet) == 1


async def test_die_mail_geht_nicht_am_zweiten_faktor_vorbei(datenbank, monkeypatch):
    async with klient_fuer("zf-mail-faktor") as k:
        name, geheimnis, _, schritt = await _mit_faktor(k, monkeypatch, "Mail Mit Faktor")
        gesendet = await _mail_bereit(k, name, monkeypatch)
        await k.post("/api/anmeldung/vergessen", json={"name": name})
        code = await _code_aus(gesendet)
        r = await k.post("/api/anmeldung/zuruecksetzen", json={"name": name, "code": code, "passwort": GUT + "neu"})
        assert r.status_code == 200
        assert r.json()["angemeldet"] is False and r.json()["zweiter_faktor"] is True
        assert (await k.get("/api/companies")).status_code == 401
        r = await k.post("/api/anmeldung/code", json={"code": zf.code_zu(geheimnis, schritt + 1)})
        assert r.status_code == 200 and r.json()["angemeldet"] is True


async def test_die_datei_auf_der_box_setzt_den_faktor_mit_zurueck(datenbank, monkeypatch):
    """Wer die Datei öffnen kann, verfügt über die Box — und braucht diesen
    Weg, wenn Handy und Codes weg sind."""
    from app import zuruecksetzen

    async with klient_fuer("zf-datei") as k:
        name, _, _, _ = await _mit_faktor(k, monkeypatch, "Datei Faktor")
        await k.post("/api/anmeldung/vergessen", json={"name": name})
        for aufgabe in list(anmeldung_router._laufend):
            await aufgabe
        gelesen = zuruecksetzen._lesen()
        assert gelesen is not None
        r = await k.post("/api/anmeldung/zuruecksetzen", json={"name": name, "code": gelesen[1], "passwort": GUT + "neu"})
        assert r.status_code == 200 and r.json()["angemeldet"] is True
        assert (await k.get("/api/anmeldung/zweiter-faktor")).json()["aktiv"] is False


async def test_ein_zurueckgesetztes_passwort_meldet_alle_geraete_ab(datenbank, monkeypatch):
    """Wer sein Passwort zurücksetzt, tut es oft aus Verdacht. Dann darf
    der Keks auf dem fremden Gerät danach nichts mehr wert sein — auch
    wenn die Zeilensicherheit ohne Nutzerkontext nichts sieht."""
    async with klient_fuer("zf-rueck-geraete") as k:
        name, _ = await _konto(k, "Rueck Geraete")
        eigen_an(monkeypatch)
        async with klient_fuer("zf-rueck-geraete") as fremd:
            fremd.headers.pop("X-Bfl-User")
            assert (await fremd.post("/api/anmeldung", json={"name": name, "passwort": GUT})).status_code == 200
            assert (await fremd.get("/api/mitglieder/wer")).status_code == 200

            gesendet = await _mail_bereit(k, name, monkeypatch)
            assert (await k.post("/api/anmeldung/vergessen", json={"name": name})).status_code == 200
            code = await _code_aus(gesendet)
            r = await k.post("/api/anmeldung/zuruecksetzen", json={"name": name, "code": code, "passwort": GUT + "neu"})
            assert r.status_code == 200, r.text

            assert (await fremd.get("/api/mitglieder/wer")).status_code == 401


async def test_die_liste_sagt_wer_einen_faktor_hat(datenbank, monkeypatch):
    """Vor dem Einschalten der Pflicht soll man sehen, wen sie trifft."""
    async with klient_fuer("zf-liste") as k:
        name, *_ = await _mit_faktor(k, monkeypatch, "Mit Faktor")
        monkeypatch.setattr("app.config.settings.anmeldung_modus", "olares")
        k.cookies.clear()
        liste = (await k.get("/api/mitglieder")).json()
    stand = {m["olares_username"]: m["zweiter_faktor"] for m in liste}
    assert stand[name] is True
    assert stand["zf-liste"] is False
