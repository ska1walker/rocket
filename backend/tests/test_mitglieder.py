"""Mehrere Menschen, eine Organisation.

Jede Person hat seit 0.6.0 einen eigenen Zugang; den Wechsel auf einen
fremden Sitzplatz gibt es nicht mehr. Diese Tests halten nach, dass Arbeit
der angemeldeten Person zugeschrieben wird, dass alle den Bestand sehen
und dass Namen und Rollen nicht über Mandanten hinweg greifen.
"""

import re
from uuid import UUID


from app.db import acquire
from tests.conftest import als_person, klient_fuer


async def test_person_ohne_olares_zugang_anlegen(datenbank):
    async with klient_fuer("team-a") as klient:
        marc = (await klient.post("/api/mitglieder", json={"display_name": "Marc Bayer"})).json()

    assert marc["zugang"] == "sitzplatz"
    # Boxweit eindeutig: Gibt es „marc-bayer" schon, kommt eine Nummer dazu.
    assert re.fullmatch(r"marc-bayer(-\d+)?", marc["olares_username"])
    assert marc["role"] == "member"


async def test_umlaute_werden_zur_kennung(datenbank):
    async with klient_fuer("team-umlaut") as klient:
        person = (await klient.post("/api/mitglieder", json={"display_name": "Jörg Müller"})).json()
    assert re.fullmatch(r"joerg-mueller(-\d+)?", person["olares_username"])


async def test_dieselbe_person_nicht_zweimal(datenbank):
    async with klient_fuer("team-b") as klient:
        await klient.post("/api/mitglieder", json={"display_name": "Marc Bayer"})
        zweimal = await klient.post("/api/mitglieder", json={"display_name": "Marc Bayer"})
    assert zweimal.status_code == 409


async def test_liste_zeigt_beide_sorten(datenbank):
    async with klient_fuer("team-c") as klient:
        await klient.post("/api/mitglieder", json={"display_name": "Marc Bayer"})
        liste = (await klient.get("/api/mitglieder")).json()

    arten = {m["display_name"]: m["zugang"] for m in liste}
    assert arten["team-c"] == "olares"
    assert arten["Marc Bayer"] == "sitzplatz"


async def test_arbeit_wird_der_angemeldeten_person_zugeschrieben(datenbank):
    """Der eigentliche Zweck: Marc legt an, und es gehört Marc."""
    async with klient_fuer("team-d") as kai:
        marc = (await kai.post("/api/mitglieder", json={"display_name": "Marc Bayer"})).json()
        eigene = (await kai.post("/api/companies", json={"name": "Kais Firma"})).json()

        async with als_person(kai, marc["id"]) as als_marc:
            wer = (await als_marc.get("/api/mitglieder/wer")).json()
            marcs = (await als_marc.post("/api/companies", json={"name": "Marcs Firma"})).json()

    assert wer["user_id"] == marc["id"]
    assert wer["display_name"] == "Marc Bayer"
    assert wer["login_username"] == marc["olares_username"]

    assert marcs["owner_id"] == marc["id"]
    assert eigene["owner_id"] != marc["id"]


async def test_beide_sehen_alles(datenbank):
    """Zwei Gesellschafter, ein Vertrieb — Besitz ist Arbeitsteilung."""
    async with klient_fuer("team-e") as kai:
        marc = (await kai.post("/api/mitglieder", json={"display_name": "Marc Bayer"})).json()
        await kai.post("/api/companies", json={"name": "Von Kai"})

        async with als_person(kai, marc["id"]) as als_marc:
            await als_marc.post("/api/companies", json={"name": "Von Marc"})
            marcs_sicht = [f["name"] for f in (await als_marc.get("/api/companies")).json()]

        kais_sicht = [f["name"] for f in (await kai.get("/api/companies")).json()]

    assert {"Von Kai", "Von Marc"} <= set(kais_sicht)
    assert {"Von Kai", "Von Marc"} <= set(marcs_sicht)


async def test_protokoll_haelt_die_angemeldete_person_fest(datenbank):
    """Wer anlegt, steht im Protokoll — mit seiner eigenen Kennung."""
    from app.db import acquire_as

    async with klient_fuer("team-f") as kai:
        marc = (await kai.post("/api/mitglieder", json={"display_name": "Marc Bayer"})).json()

        async with als_person(kai, marc["id"]) as als_marc:
            firma = (await als_marc.post("/api/companies", json={"name": "Protokollfirma"})).json()

        async with acquire_as(marc["id"]) as conn:
            eintrag = await conn.fetchrow(
                "select actor_id, actor_login from public.audit_log "
                "where entity = 'companies' and entity_id = $1",
                firma["id"],
            )

    assert str(eintrag["actor_id"]) == marc["id"]
    assert eintrag["actor_login"] == marc["olares_username"]


async def test_eigener_zugang_wird_nicht_entfernt(datenbank):
    async with klient_fuer("team-j") as klient:
        wer = (await klient.get("/api/mitglieder/wer")).json()
        antwort = await klient.delete(f"/api/mitglieder/{wer['user_id']}")
    assert antwort.status_code == 400


async def test_person_entfernen_laesst_besitz_stehen(datenbank):
    """Besitz umzuschreiben wäre eine Geschichtsfälschung."""
    async with klient_fuer("team-k") as kai:
        marc = (await kai.post("/api/mitglieder", json={"display_name": "Marc Bayer"})).json()
        async with als_person(kai, marc["id"]) as als_marc:
            firma = (await als_marc.post("/api/companies", json={"name": "Marcs Erbe"})).json()

            weg = await kai.delete(f"/api/mitglieder/{marc['id']}")
            assert weg.status_code == 204

            nachher = (await kai.get(f"/api/companies/{firma['id']}")).json()
            assert nachher["owner_id"] == marc["id"]

            # Und die Sitzung der entfernten Person greift nicht mehr.
            assert (await als_marc.get("/api/companies")).status_code == 401


async def test_boxinhaber_bekommt_einen_namen(datenbank):
    """Der Olares-Zugang bringt nur die Kennung mit. Der Name kommt von Hand."""
    async with klient_fuer("team-name") as klient:
        wer = (await klient.get("/api/mitglieder/wer")).json()
        assert wer["display_name"] == "team-name"

        neu = (
            await klient.patch(f"/api/mitglieder/{wer['user_id']}", json={"display_name": "  Kai Böhm "})
        ).json()
        assert neu["display_name"] == "Kai Böhm"
        assert neu["olares_username"] == "team-name"  # die Kennung bleibt
        assert neu["zugang"] == "olares"

        # Die Liste und „wer" zeigen den Namen; ein weiterer Aufruf setzt ihn nicht zurück.
        liste = (await klient.get("/api/mitglieder")).json()
        assert [m["display_name"] for m in liste if m["id"] == wer["user_id"]] == ["Kai Böhm"]
        assert (await klient.get("/api/mitglieder/wer")).json()["display_name"] == "Kai Böhm"

        leer = await klient.patch(f"/api/mitglieder/{wer['user_id']}", json={})
        assert leer.status_code == 400
        kurz = await klient.patch(f"/api/mitglieder/{wer['user_id']}", json={"display_name": "K"})
        assert kurz.status_code == 422


async def test_fremde_person_bleibt_unbenannt(datenbank):
    """Der Name einer Person aus einer anderen Organisation ist nicht erreichbar."""
    async with klient_fuer("team-x") as x, klient_fuer("team-y") as y:
        marc = (await x.post("/api/mitglieder", json={"display_name": "Marc Bayer"})).json()
        antwort = await y.patch(f"/api/mitglieder/{marc['id']}", json={"display_name": "Jemand"})
        assert antwort.status_code == 404
        liste = (await x.get("/api/mitglieder")).json()
        assert [m["display_name"] for m in liste if m["id"] == marc["id"]] == ["Marc Bayer"]


# ---- Persönliche Einstellungen (seit 0.3.8) ---------------------------------


async def test_einstellungen_rundlauf(datenbank):
    async with klient_fuer("einst-a") as k:
        assert (await k.get("/api/mitglieder/wer")).json()["einstellungen"] == {}
        r = await k.patch("/api/mitglieder/wer/einstellungen", json={"favoriten": ["/firmen", "/deals", "/firmen"]})
        assert r.status_code == 200, r.text
        # Reihenfolge bleibt, Dubletten fallen weg.
        assert r.json()["einstellungen"] == {"favoriten": ["/firmen", "/deals"]}
        assert (await k.get("/api/mitglieder/wer")).json()["einstellungen"]["favoriten"] == ["/firmen", "/deals"]
        # null löscht den Schlüssel.
        r = await k.patch("/api/mitglieder/wer/einstellungen", json={"favoriten": None})
        assert r.json()["einstellungen"] == {}


async def test_einstellungen_gehoeren_zur_person(datenbank):
    async with klient_fuer("einst-b") as kai:
        marc = (await kai.post("/api/mitglieder", json={"display_name": "Marc Bayer"})).json()
        async with als_person(kai, marc["id"]) as als_marc:
            await als_marc.patch("/api/mitglieder/wer/einstellungen", json={"favoriten": ["/kampagnen"]})
            assert (await als_marc.get("/api/mitglieder/wer")).json()["einstellungen"] == {"favoriten": ["/kampagnen"]}
            assert (await kai.get("/api/mitglieder/wer")).json()["einstellungen"] == {}
            await kai.patch("/api/mitglieder/wer/einstellungen", json={"favoriten": ["/firmen"]})
            assert (await als_marc.get("/api/mitglieder/wer")).json()["einstellungen"] == {"favoriten": ["/kampagnen"]}


async def test_einstellungen_werden_geprueft(datenbank):
    async with klient_fuer("einst-c") as k:
        for schlecht in ({"favoriten": "x"}, {"favoriten": ["javascript:alert(1)"]}, {"unbekannt": 1}, {"favoriten": ["/a"] * 21 and [f"/p{i}" for i in range(21)]}):
            assert (await k.patch("/api/mitglieder/wer/einstellungen", json=schlecht)).status_code == 422, schlecht
        assert (await k.patch("/api/mitglieder/wer/einstellungen", json={})).status_code == 400


# ---------------------------------------------------------------------------
# Rollen — wer auf einer fremden Box helfen darf
# ---------------------------------------------------------------------------

async def test_eigentuemer_macht_jemanden_zum_verwalter(datenbank):
    """Der Fall, für den es gebaut ist.

    Kai soll auf Marcs Box die Einstellungen sehen können, ohne dass Marc
    ihm sein eigenes Passwort gibt. Bis 0.9.2 bekam jede angelegte Person
    fest `member`, und es gab keinen Endpunkt, der das ändert.
    """
    async with klient_fuer("rolle-eigner") as marc:
        kai = (await marc.post("/api/mitglieder", json={"display_name": "Kai Böhm"})).json()
        assert kai["role"] == "member"

        antwort = await marc.patch(f"/api/mitglieder/{kai['id']}/rolle", json={"role": "admin"})
        assert antwort.status_code == 200, antwort.text
        assert antwort.json()["role"] == "admin"

        liste = (await marc.get("/api/mitglieder")).json()
        assert {m["olares_username"]: m["role"] for m in liste}["kai-boehm"] == "admin"

        # Und wieder zurück.
        zurueck = await marc.patch(f"/api/mitglieder/{kai['id']}/rolle", json={"role": "member"})
        assert zurueck.json()["role"] == "member"


async def test_verwalter_vergibt_keine_rollen(datenbank):
    """Sonst könnte ein Verwalter die Eigentümerin herabstufen.

    Ein Verwalter darf schon alles, was `verwaltet` schützt. Rollen zu
    setzen wäre der eine Schritt darüber hinaus: Er endete damit, dass
    sich jemand die Organisation aneignet.
    """
    async with klient_fuer("rolle-admin") as klient:
        wer = (await klient.get("/api/mitglieder/wer")).json()
        dritte = (await klient.post("/api/mitglieder", json={"display_name": "Ada Lovelace"})).json()

        # Aus der Eigentümerin wird eine Verwalterin. Ein Zugang über den
        # Kopf legt sonst immer die eigene Organisation an, mit `owner`.
        async with acquire() as conn:
            await conn.execute(
                "update public.user_org_roles set role = 'admin' where user_id = $1",
                UUID(wer["user_id"]),
            )

        # Was `verwaltet` schützt, darf sie weiterhin.
        assert (await klient.get("/api/mitglieder")).status_code == 200
        abgewiesen = await klient.patch(
            f"/api/mitglieder/{dritte['id']}/rolle", json={"role": "admin"}
        )

    assert abgewiesen.status_code == 403
    assert "gehört" in abgewiesen.json()["detail"]


async def test_eine_zweite_eigentuemerin_laesst_sich_nicht_herabstufen(datenbank):
    """Der Riegel in der SQL, nicht nur im Vorspann.

    Zwei Eigentümerinnen entstehen im Betrieb nicht, aber der Riegel
    `r.role <> 'owner'` ist die Stelle, an der Eigentum wirklich hängt —
    und die gehört geprüft, nicht behauptet.
    """
    async with klient_fuer("rolle-zwei-eigner") as klient:
        kai = (await klient.post("/api/mitglieder", json={"display_name": "Kai Böhm"})).json()
        async with acquire() as conn:
            await conn.execute(
                "update public.user_org_roles set role = 'owner' where user_id = $1",
                UUID(kai["id"]),
            )
        antwort = await klient.patch(f"/api/mitglieder/{kai['id']}/rolle", json={"role": "member"})

    assert antwort.status_code == 404


async def test_owner_laesst_sich_nicht_vergeben(datenbank):
    """Eigentum zu übergeben ist etwas anderes als eine Rolle zu setzen."""
    async with klient_fuer("rolle-owner") as marc:
        kai = (await marc.post("/api/mitglieder", json={"display_name": "Kai Böhm"})).json()
        antwort = await marc.patch(f"/api/mitglieder/{kai['id']}/rolle", json={"role": "owner"})
    assert antwort.status_code == 422


async def test_fremde_organisation_bleibt_unberuehrt(datenbank):
    async with klient_fuer("rolle-fremd-a") as a:
        ihre = (await a.post("/api/mitglieder", json={"display_name": "Ada Lovelace"})).json()
    async with klient_fuer("rolle-fremd-b") as b:
        antwort = await b.patch(f"/api/mitglieder/{ihre['id']}/rolle", json={"role": "admin"})
    assert antwort.status_code == 404


async def test_gleicher_name_in_zwei_organisationen_sind_zwei_menschen(datenbank):
    """Die Kennung ist boxweit eindeutig und zugleich der Anmeldename.

    Früher bekam eine zweite Organisation mit ihrem „Marc Bayer" den Nutzer
    der ersten — und über die Einladung dessen Passwort und Organisation.
    """
    async with klient_fuer("name-org-a") as a, klient_fuer("name-org-b") as b:
        marc_a = (await a.post("/api/mitglieder", json={"display_name": "Marc Doppelt"})).json()
        marc_b = (await b.post("/api/mitglieder", json={"display_name": "Marc Doppelt"})).json()
        assert marc_a["id"] != marc_b["id"]
        assert marc_a["olares_username"] != marc_b["olares_username"]

        await a.post("/api/companies", json={"name": "Nur bei A"})
        async with als_person(b, marc_b["id"]) as als_b:
            wer = (await als_b.get("/api/mitglieder/wer")).json()
            namen = [f["name"] for f in (await als_b.get("/api/companies")).json()]
        assert wer["user_id"] == marc_b["id"]
        assert "Nur bei A" not in namen
        # Die Person in A bleibt unberührt: kein Passwort, niemand angemeldet.
        liste_a = (await a.get("/api/mitglieder")).json()
        assert [m["id"] for m in liste_a if m["display_name"] == "Marc Doppelt"] == [marc_a["id"]]
