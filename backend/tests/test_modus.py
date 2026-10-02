"""Modus Vertrieb/Verein (seit 26.10.19).

Der Modus ändert Begriffe und Navigation der Oberfläche — keine Daten,
keine Rechte. Hier steht, was das Backend dazu tut: ihn speichern, nur
Verwaltern das Umschalten erlauben, und jeder Person über `/wer` sagen,
welcher gilt (auch einer eingeschränkten).
"""

from tests.conftest import als_person, klient_fuer


async def _ok(antwort, *codes):
    assert antwort.status_code in (codes or (200, 201)), f"{antwort.request.url}: {antwort.text}"
    return antwort.json() if antwort.content else None


async def test_modus_umschalten_aendert_nur_den_modus(datenbank):
    async with klient_fuer("mo-verein") as k:
        assert (await _ok(await k.get("/api/mitglieder/wer")))["modus"] == "vertrieb"
        assert (await _ok(await k.get("/api/settings")))["modus"] == "vertrieb"

        mannschaft = await _ok(await k.post("/api/companies", json={"name": "Erste MO"}))
        await _ok(await k.post("/api/contacts", json={"last_name": "Spieler MO", "company_id": mannschaft["id"]}))
        await _ok(await k.post("/api/deals", json={"name": "Sponsoring MO", "company_id": mannschaft["id"]}))
        vorher = (await k.get("/api/contacts?limit=200")).json(), (await k.get("/api/deals")).json()

        assert (await _ok(await k.put("/api/settings", json={"modus": "verein"})))["modus"] == "verein"
        assert (await _ok(await k.get("/api/mitglieder/wer")))["modus"] == "verein"
        # Nichts verschwindet: Leads und Kontakte sind noch da, nur die
        # Oberfläche zeigt sie anders.
        assert ((await k.get("/api/contacts?limit=200")).json(), (await k.get("/api/deals")).json()) == vorher

        # `null` und Unbekanntes ändern nichts.
        assert (await _ok(await k.put("/api/settings", json={"modus": None})))["modus"] == "verein"
        assert (await k.put("/api/settings", json={"modus": "schule"})).status_code == 422

        # Eine eingeschränkte Person erfährt den Modus über /wer, umschalten
        # darf sie nicht.
        trainer = (await _ok(await k.post("/api/mitglieder", json={"display_name": "Trainer MO"})))["id"]
        await _ok(await k.put(f"/api/mitglieder/{trainer}/sicht", json={
            "sicht": "eingeschraenkt", "zugriffe": [{"company_id": mannschaft["id"]}],
        }))
        async with als_person(k, trainer) as t:
            assert (await _ok(await t.get("/api/mitglieder/wer")))["modus"] == "verein"
            assert (await t.put("/api/settings", json={"modus": "vertrieb"})).status_code == 403

        # Zurück: alles wie vorher.
        assert (await _ok(await k.put("/api/settings", json={"modus": "vertrieb"})))["modus"] == "vertrieb"
        assert ((await k.get("/api/contacts?limit=200")).json(), (await k.get("/api/deals")).json()) == vorher
