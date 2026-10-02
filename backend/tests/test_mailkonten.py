"""Das persönliche Postfach (seit 26.10.20).

Kein echtes IMAP: Ein Postfach aus Listen steht an der Stelle von
`mailkonten.oeffnen`. Geprüft wird, was zählt — nur Kontakte werden
eingelesen, Privates verlässt das Postfach nicht einmal als Text, nichts
wird markiert, jede Person sieht nur ihr eigenes Postfach.
"""

import email

import pytest

from app import mailkonten
from app.db import acquire_as
from tests.conftest import als_person, klient_fuer

ICH = "kai@aimighty-mk.de"


def mail(uid: int, von: str, an: str, betreff: str, mid: str, **kopf) -> tuple[int, bytes]:
    zeilen = {"From": von, "To": an, "Subject": betreff, "Message-ID": mid,
              "Date": "Fri, 02 Oct 2026 09:00:00 +0200", **kopf}
    text = "".join(f"{k}: {v}\r\n" for k, v in zeilen.items())
    return uid, (text + "\r\nText von " + betreff).encode()


class Postfach:
    """Zwei Ordner aus Listen. Merkt sich, was ganz geladen wurde."""

    def __init__(self, ordner: dict[str, list[tuple[int, bytes]]]):
        self.ordner = ordner
        self.ganz: list[tuple[str, int]] = []

    def gesendet_finden(self):
        return "Gesendet"

    def neue(self, ordner, ab, uidv_alt):
        liste = [(u, email.message_from_bytes(b), len(b)) for u, b in self.ordner.get(ordner, []) if not ab or u > ab]
        return 7, liste

    def inhalte(self, ordner, uids):
        self.ganz += [(ordner, u) for u in uids]
        return {u: email.message_from_bytes(b) for u, b in self.ordner[ordner] if u in uids}

    def schliessen(self):
        pass


@pytest.fixture
def postfach(monkeypatch):
    stelle = {"pf": Postfach({})}
    monkeypatch.setattr(mailkonten, "oeffnen", lambda konto: stelle["pf"])
    return stelle


async def _ok(antwort, *codes):
    assert antwort.status_code in (codes or (200, 201)), f"{antwort.request.url}: {antwort.text}"
    return antwort.json() if antwort.content else None


async def test_nur_kontakte_kommen_ins_crm(datenbank, postfach):
    async with klient_fuer("mk-kontakte") as k:
        firma = await _ok(await k.post("/api/companies", json={"name": "Kunde MK"}))
        kunde = await _ok(await k.post("/api/contacts", json={"last_name": "Kunde", "email": "einkauf@kunde-mk.de", "company_id": firma["id"]}))

        konto = await _ok(await k.put("/api/mailkonto", json={"anbieter": "google", "adresse": ICH, "passwort": "app-passwort"}))
        # Die Voreinstellung füllt die Server.
        assert (konto["imap_host"], konto["imap_port"], konto["smtp_host"], konto["smtp_port"]) == ("imap.gmail.com", 993, "smtp.gmail.com", 465)
        assert konto["passwort_gesetzt"] is True and "passwort" not in konto

        postfach["pf"] = Postfach({
            "INBOX": [
                mail(1, "einkauf@kunde-mk.de", ICH, "Angebot bitte", "<a1@kunde>"),
                mail(2, "oma@privat.de", ICH, "Geburtstag Sonntag", "<p1@privat>"),
                mail(3, "einkauf@kunde-mk.de", ICH, "Abwesend", "<a2@kunde>", **{"Auto-Submitted": "auto-replied"}),
            ],
            "Gesendet": [mail(10, ICH, "Einkauf <einkauf@kunde-mk.de>", "Re: Angebot bitte", "<s1@aimighty>")],
        })
        bilanz = await _ok(await k.post("/api/mailkonto/abholen"))
        assert bilanz["zugeordnet"] == 2 and bilanz["privat"] == 1 and bilanz["gelesen"] == 4

        verlauf = await _ok(await k.get(f"/api/activities?contact_id={kunde['id']}"))
        mails = sorted((a["payload"]["richtung"], a["subject"]) for a in verlauf if a["kind"] == "email")
        assert mails == [("ausgehend", "An einkauf@kunde-mk.de: Re: Angebot bitte"),
                         ("eingehend", "Von einkauf@kunde-mk.de: Angebot bitte")]
        assert any("Text von Angebot bitte" in (a["body"] or "") for a in verlauf)

        # Privates wurde nicht einmal ganz geladen — nur die Kopfzeilen.
        assert ("INBOX", 2) not in postfach["pf"].ganz
        wer = await _ok(await k.get("/api/mitglieder/wer"))
        async with acquire_as(wer["user_id"]) as conn:
            assert await conn.fetchval("select count(*) from public.activities where subject ilike '%Geburtstag%' or body ilike '%Geburtstag%'") == 0
            roh = await conn.fetchval("select passwort from public.mailkonten")
            assert roh and "app-passwort" not in roh

        # Der nächste Lauf liest nur Neues.
        bilanz = await _ok(await k.post("/api/mailkonto/abholen"))
        assert bilanz["gelesen"] == 0
        stand = await _ok(await k.get("/api/mailkonto"))
        assert stand["eingelesen"] == 2 and stand["letzter_fehler"] is None and stand["ordner_aus"] == "Gesendet"


async def test_dieselbe_mail_bei_zweien_ist_ein_eintrag(datenbank, postfach):
    async with klient_fuer("mk-doppelt") as k:
        await _ok(await k.post("/api/contacts", json={"last_name": "Kunde", "email": "chef@kunde-dp.de"}))
        await _ok(await k.put("/api/mailkonto", json={"anbieter": "ionos", "adresse": ICH, "passwort": "x"}))
        marc = (await _ok(await k.post("/api/mitglieder", json={"display_name": "Marc DP"})))["id"]
        rund = mail(1, "chef@kunde-dp.de", f"{ICH}, marc@aimighty.de", "Rundmail an beide", "<r1@kunde>")
        postfach["pf"] = Postfach({"INBOX": [rund]})
        assert (await _ok(await k.post("/api/mailkonto/abholen")))["zugeordnet"] == 1
        async with als_person(k, marc) as m:
            await _ok(await m.put("/api/mailkonto", json={"anbieter": "eigen", "adresse": "marc@aimighty.de", "passwort": "y", "imap_host": "imap.example.de"}))
            postfach["pf"] = Postfach({"INBOX": [rund]})
            bilanz = await _ok(await m.post("/api/mailkonto/abholen"))
            assert bilanz["zugeordnet"] == 0 and bilanz["doppelt"] == 1


async def test_jedes_postfach_gehoert_seiner_person(datenbank, postfach):
    async with klient_fuer("mk-eigen") as k:
        await _ok(await k.put("/api/mailkonto", json={"anbieter": "strato", "adresse": ICH, "passwort": "geheim"}))
        mitglied = (await _ok(await k.post("/api/mitglieder", json={"display_name": "Mitglied MK"})))["id"]
        async with als_person(k, mitglied) as m:
            # Sie sieht das Postfach der Eigentümerin nicht …
            assert (await m.get("/api/mailkonto")).json() is None
            await _ok(await m.put("/api/mailkonto", json={"anbieter": "onecom", "adresse": "m@aimighty.de", "passwort": "z"}))
        # … und die Eigentümerin ihres nicht — auch nicht in der Datenbank.
        assert (await _ok(await k.get("/api/mailkonto")))["adresse"] == ICH
        wer = await _ok(await k.get("/api/mitglieder/wer"))
        async with acquire_as(wer["user_id"]) as conn:
            assert await conn.fetchval("select count(*) from public.mailkonten") == 1
        # Nur lesen heißt: kein Postfach verbinden.
        leser = (await _ok(await k.post("/api/mitglieder", json={"display_name": "Leser MK"})))["id"]
        await _ok(await k.patch(f"/api/mitglieder/{leser}/rolle", json={"role": "viewer"}))
        async with als_person(k, leser) as v:
            r = await v.put("/api/mailkonto", json={"anbieter": "google", "adresse": "v@x.de", "passwort": "p"})
            assert r.status_code == 403


async def test_microsoft_wird_erklaert_nicht_versucht(datenbank):
    async with klient_fuer("mk-ms") as k:
        r = await k.put("/api/mailkonto", json={"adresse": ICH, "passwort": "p", "imap_host": "outlook.office365.com"})
        assert r.status_code == 422 and "Microsoft" in r.text
        r = await k.put("/api/mailkonto", json={"adresse": ICH, "imap_host": "imap.example.de"})
        assert r.status_code == 422 and "Passwort" in r.text


async def test_trainer_bekommt_nur_post_seiner_spieler(datenbank, postfach):
    async with klient_fuer("mk-trainer") as k:
        a = await _ok(await k.post("/api/companies", json={"name": "A MK"}))
        b = await _ok(await k.post("/api/companies", json={"name": "B MK"}))
        await _ok(await k.post("/api/contacts", json={"last_name": "Eigen", "email": "eigen@spieler.de", "company_id": a["id"]}))
        await _ok(await k.post("/api/contacts", json={"last_name": "Fremd", "email": "fremd@spieler.de", "company_id": b["id"]}))
        trainer = (await _ok(await k.post("/api/mitglieder", json={"display_name": "Trainer MK"})))["id"]
        await _ok(await k.put(f"/api/mitglieder/{trainer}/sicht", json={"sicht": "eingeschraenkt", "zugriffe": [{"company_id": a["id"]}]}))
        async with als_person(k, trainer) as t:
            await _ok(await t.put("/api/mailkonto", json={"anbieter": "google", "adresse": "trainer@verein.de", "passwort": "p"}))
            postfach["pf"] = Postfach({"INBOX": [
                mail(1, "eigen@spieler.de", "trainer@verein.de", "Training", "<t1@x>"),
                mail(2, "fremd@spieler.de", "trainer@verein.de", "Wechsel", "<t2@x>"),
            ]})
            bilanz = await _ok(await t.post("/api/mailkonto/abholen"))
            # Den fremden Spieler kennt er nicht — für ihn ist das private Post.
            assert bilanz["zugeordnet"] == 1 and bilanz["privat"] == 1
            assert ("INBOX", 2) not in postfach["pf"].ganz


async def test_verbindung_testen_meldet_beides(datenbank, monkeypatch):
    async def pruefen(konto):
        assert konto.passwort == "p"
        return {"imap": None, "smtp": "Anmeldung abgelehnt", "gesendet": "Sent"}

    monkeypatch.setattr(mailkonten, "pruefen", pruefen)
    async with klient_fuer("mk-test") as k:
        assert (await k.post("/api/mailkonto/testen")).status_code == 404
        await _ok(await k.put("/api/mailkonto", json={"anbieter": "google", "adresse": ICH, "passwort": "p"}))
        r = await _ok(await k.post("/api/mailkonto/testen"))
        assert r == {"imap": None, "smtp": "Anmeldung abgelehnt", "gesendet": "Sent", "ok": False}
