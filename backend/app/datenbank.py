"""Der Blick in die Datenbank — lesend, unter Zeilensicherheit.

Warum kein pgweb oder Adminer daneben: Die Tabellen stehen unter FORCE
ROW LEVEL SECURITY, und die Richtlinien lesen `app.current_user_id`. Ein
fremder Datenbank-Browser setzt den Wert nicht und zeigt jede Tabelle
leer. Also läuft der Blick durch Rocket selbst, über `acquire_as`.

Das freie SQL-Feld hat dabei eine Lücke, die „nur lesend" nicht
schließt: Die Mandantentrennung hängt an einer Sitzungsvariable, und die
darf jede Abfrage umsetzen — `set_config('app.current_user_id', …)`,
versteckt auch in `query_to_xml('…')`. Ein Verwalter sähe damit die
Sitzungen des Eigentümers. Deshalb wird jede Abfrage **vor** dem
Ausführen zerlegt (pglast, derselbe Parser wie in Postgres) und nur
durchgelassen, was hier ausdrücklich steht:

- genau eine Anweisung, und die ist ein SELECT (auch WITH, VALUES, TABLE)
- Tabellen nur aus `FREI`, nur im Schema `public`
- Funktionen nur aus `FUNKTIONEN` — eine Liste, keine Sperrliste, denn
  eine Sperrliste vergisst immer die nächste Funktion, die SQL ausführt
- kein SELECT INTO, kein FOR UPDATE

Dahinter steht trotzdem `SET TRANSACTION READ ONLY` und ein Zeitlimit.
Die Prüfung ist die Tür, die Transaktion das Schloss dahinter.
"""

from __future__ import annotations

import datetime as dt
import decimal
import uuid
from typing import Any

import orjson
from pglast import ast, parse_sql
from pglast.parser import ParseError
from pglast.visitors import Visitor

# Tabellen, die man ansehen und abfragen darf. Eine neue Tabelle steht
# weder hier noch in GESPERRT und lässt dadurch einen Test brechen
# (`test_jede_tabelle_ist_frei_oder_gesperrt`) — dieselbe Wache wie beim
# Abzug. Sonst wäre die nächste Tabelle mit einem Geheimnis von selbst
# sichtbar.
FREI = frozenset({
    "activities", "anreicherungen", "ansichten", "audit_log", "aussagen",
    "auswertungen", "besprechung_kontakte", "besprechungen", "companies",
    "contact_companies", "contacts", "deal_contacts", "deals", "dokumente",
    "einfuhren", "eingang", "kampagnen", "listen", "listen_mitglieder",
    "loss_reasons", "mails", "orgs", "pipeline_stages", "pipelines",
    "podcasts", "products", "property_definitions", "quote_items", "quotes",
    "tasks", "themenlaeufe", "ticket_kategorien", "ticket_pipelines",
    "ticket_stages", "tickets", "user_org_roles", "vorlagen",
})

# Was hier nicht hingehört, mit dem Grund — die Oberfläche nennt ihn.
GESPERRT: dict[str, str] = {
    "users": "Passwort-Hashes und Zweitfaktor; die Personen stehen unter Einstellungen › Firma und Team",
    "sitzungen": "Anmeldesitzungen — wer sie liest, kann sich als jemand anderes ausgeben",
    "anmeldeversuche": "Anmeldeversuche mit Adressen, gehören zur Anmeldung",
    "einladungen": "offene Einladungen mit Schlüssel",
    "org_settings": "Zugangsdaten für Sprachmodell, Suche, SMTP und Postfach",
    "webhook_sources": "Geheimnisse der verbundenen Programme",
    "oeffentliche_links": "Schlüssel der Links in Mails — wer sie hat, kann im Namen eines Empfängers abmelden",
}

# Funktionen, die nichts tun außer rechnen. Was fehlt, fehlt mit Absicht,
# vor allem alles, was SQL aus Text ausführt (query_to_xml, dblink …) oder
# Sitzungswerte setzt (set_config).
FUNKTIONEN = frozenset({
    # Zählen und zusammenfassen
    "count", "sum", "avg", "min", "max", "string_agg", "array_agg",
    "json_agg", "jsonb_agg", "bool_and", "bool_or", "every",
    # Fenster
    "row_number", "rank", "dense_rank", "lag", "lead", "first_value",
    "last_value", "ntile",
    # Text
    "lower", "upper", "length", "char_length", "trim", "btrim", "ltrim",
    "rtrim", "substring", "substr", "left", "right", "concat", "concat_ws",
    "replace", "split_part", "position", "strpos", "starts_with",
    "regexp_replace", "regexp_match", "initcap", "lpad", "rpad", "md5",
    "similarity",
    # Zahlen
    "round", "floor", "ceil", "ceiling", "abs", "trunc", "mod", "power",
    "sqrt", "greatest", "least",
    # Zeit
    "now", "date_trunc", "date_part", "extract", "age", "to_char",
    "to_date", "to_timestamp", "make_date", "make_interval", "timezone",
    "date", "justify_days", "justify_interval",
    # JSON und Listen
    "jsonb_extract_path_text", "json_extract_path_text", "jsonb_array_length",
    "json_array_length", "jsonb_array_elements", "jsonb_array_elements_text",
    "jsonb_object_keys", "jsonb_typeof", "jsonb_build_object",
    "json_build_object", "to_jsonb", "to_json", "array_length", "cardinality",
    "unnest", "array_to_string", "generate_series",
    # Typen
    "pg_typeof",
})

HOECHSTENS_ZEILEN = 1000
ZEITLIMIT_MS = 10_000


class Abgewiesen(ValueError):  # noqa: N818 — die Fachbegriffe hier sind deutsch
    """Die Abfrage kommt nicht durch — mit einem Satz, der sagt, warum."""


class _Pruefer(Visitor):
    def __init__(self) -> None:
        super().__init__()
        self.tabellen: list[tuple[str | None, str]] = []
        self.funktionen: list[list[str]] = []
        self.ctes: set[str] = set()
        self.verboten: list[str] = []

    def visit_RangeVar(self, ancestors, node: ast.RangeVar) -> None:  # noqa: N802
        self.tabellen.append((node.schemaname, node.relname))

    def visit_FuncCall(self, ancestors, node: ast.FuncCall) -> None:  # noqa: N802
        self.funktionen.append([teil.sval for teil in node.funcname])

    def visit_CommonTableExpr(self, ancestors, node: ast.CommonTableExpr) -> None:  # noqa: N802
        self.ctes.add(node.ctename)

    def visit_IntoClause(self, ancestors, node) -> None:  # noqa: N802
        self.verboten.append("SELECT INTO legt eine Tabelle an — hier wird nur gelesen.")

    def visit_LockingClause(self, ancestors, node) -> None:  # noqa: N802
        self.verboten.append("FOR UPDATE und Verwandte sperren Zeilen — hier wird nur gelesen.")


def pruefen(sql: str) -> None:
    """Lässt die Abfrage durch oder sagt, woran sie scheitert."""
    if not sql.strip():
        raise Abgewiesen("Die Abfrage ist leer.")
    try:
        anweisungen = parse_sql(sql)
    except ParseError as fehler:
        raise Abgewiesen(f"Das ist kein gültiges SQL: {fehler}") from None

    if len(anweisungen) != 1:
        raise Abgewiesen("Bitte genau eine Abfrage auf einmal.")
    if not isinstance(anweisungen[0].stmt, ast.SelectStmt):
        raise Abgewiesen("Hier sind nur Abfragen mit SELECT erlaubt — nichts, was etwas ändert.")

    pruefer = _Pruefer()
    pruefer(anweisungen)

    if pruefer.verboten:
        raise Abgewiesen(pruefer.verboten[0])

    # Ein WITH, das wie eine echte Tabelle heißt, verdeckte sie: Ein
    # `users` in einer Unterabfrage wäre sonst ein Name, den die Prüfung
    # für einen CTE hält, während Postgres draußen die echte Tabelle liest.
    for name in pruefer.ctes:
        if name in FREI or name in GESPERRT:
            raise Abgewiesen(f"Ein WITH darf nicht heißen wie eine Tabelle: „{name}“.")

    for schema, name in pruefer.tabellen:
        if schema is None and name in pruefer.ctes:
            continue
        if schema not in (None, "public"):
            raise Abgewiesen(f"Nur Tabellen aus dem Schema public — nicht „{schema}.{name}“.")
        if name in GESPERRT:
            raise Abgewiesen(f"„{name}“ ist gesperrt: {GESPERRT[name]}.")
        if name not in FREI:
            raise Abgewiesen(f"„{name}“ ist keine freigegebene Tabelle.")

    for teile in pruefer.funktionen:
        *schema, name = teile
        if schema not in ([], ["pg_catalog"]) or name not in FUNKTIONEN:
            raise Abgewiesen(f"Die Funktion „{'.'.join(teile)}“ ist hier nicht erlaubt.")


def wert(roh: Any) -> Any:
    """Ein Datenbankwert, so wie er als JSON und in der Tabelle ankommt."""
    if roh is None or isinstance(roh, (bool, int, float, str)):
        return roh
    if isinstance(roh, (dt.datetime, dt.date, dt.time)):
        return roh.isoformat()
    if isinstance(roh, (uuid.UUID, decimal.Decimal, dt.timedelta)):
        return str(roh)
    if isinstance(roh, (list, tuple)):
        return [wert(x) for x in roh]
    if isinstance(roh, dict):
        return {str(k): wert(v) for k, v in roh.items()}
    if isinstance(roh, (bytes, bytearray, memoryview)):
        return f"<{len(bytes(roh))} Bytes>"
    return str(roh)


def zelle(roh: Any) -> str:
    """Derselbe Wert als Text für die CSV-Datei."""
    w = wert(roh)
    if w is None:
        return ""
    if isinstance(w, bool):
        return "ja" if w else "nein"
    if isinstance(w, (list, dict)):
        return orjson.dumps(w).decode()
    return str(w)
