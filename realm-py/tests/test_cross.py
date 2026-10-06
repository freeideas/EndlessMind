# The Python port against the JavaScript it copies: the same inputs must give the same IDs, canonical
# JSON, signatures, names, QR codes and realm card, and a realm must be able to move between the two on
# the same .data/ files. Runs deno (skipped when it is not installed).

import asyncio
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from endlessmind import (
    add_signature,
    canonical,
    default_name,
    memory_store,
    open_realm,
    qr_svg,
    signer_from_words,
    tidy_name,
    valid_signers,
    words_from_entropy,
)
from endlessmind.signed import to_json

HERE = Path(__file__).resolve().parent
DENO = shutil.which("deno") or str(Path.home() / ".local" / "bin" / "deno")
pytestmark = pytest.mark.skipif(not os.path.exists(DENO), reason="deno is not installed")

PHRASES = [words_from_entropy(bytes([n]) * 32) for n in range(0, 256, 37)] + [words_from_entropy(os.urandom(32)) for _ in range(5)]
BASE = "https://garden.example/sub/"
CARD = {"name": "Cross Realm", "description": "Ünïcode ✓ and \"quotes\".", "tags": ["a", "b"]}


def js(command, value):
    result = subprocess.run(
        [DENO, "run", "--quiet", "--allow-read", "--allow-write", str(HERE / "js_helper.js")],
        input=to_json({"command": command, "input": value}),
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


def test_same_ids():
    assert js("ids", PHRASES) == [signer_from_words(w).id for w in PHRASES]


TRICKY = [
    {"b": 1, "a": [True, None, "x"], "c": {"z": -0, "y": 9007199254740991}},
    {"é": 1, "e": 2, "\U0001f600": 3, "￿": 4, "Z": 5, "": 6},
    {"text": "line\nbreak\ttab \"q\" \\ \u0000\u001f\u007f  ünï ✓ \U0001f600 </script>"},
    ["\ud800 lone", {"nested": [[], {}, [{"k": "v"}]]}],
]


def test_same_canonical_json():
    assert js("canonical", TRICKY) == [canonical(v) for v in TRICKY]


def test_signatures_agree_both_ways():
    words = PHRASES[1]
    objects = [{"v": 1, "type": "record", "signers": [signer_from_words(words).id], "time": 1790000000000, **o} for o in TRICKY if isinstance(o, dict)]
    py_signed = [add_signature(o, signer_from_words(words)) for o in objects]
    assert js("sign", {"words": words, "objects": objects}) == py_signed, "Ed25519 signatures are deterministic"
    assert js("verify", py_signed) == [valid_signers(o) for o in py_signed] == [[signer_from_words(words).id]] * len(objects)


def test_same_names():
    ids = [signer_from_words(w).id for w in PHRASES]
    assert js("names", ids) == [default_name(i) for i in ids]
    names = ["  Moon \u0000 Pie\n ", "x" * 60, 7, None, "a​b  c", "\U0001f600" * 30, " 　 wide ﻿"]
    assert js("tidy", names) == [tidy_name(n) for n in names]


def test_same_qr_codes():
    texts = ["hi", "https://portal.endlessmind.com/#url=https%3A%2F%2Fgarden.example%2Fjoin%2FK7Q2P9", "12345", "ünï ✓ " * 20]
    assert js("qr", texts) == [qr_svg(t) for t in texts]


def test_same_realm_card():
    words = PHRASES[2]
    realm = open_realm(BASE, CARD, words=words, store=memory_store(), now=lambda: 1790000000000)
    assert js("card", {"base": BASE, "card": CARD, "words": words, "now": 1790000000000}) == realm.card


def test_a_realm_moves_between_the_two_on_its_data_file(tmp_path):
    words, player = PHRASES[3], signer_from_words(PHRASES[4])
    data = tmp_path / "realm-data.json"
    realm = open_realm(BASE, CARD, words=words, data_file=data)
    # A player signed in, with a chosen name, and a complete public record, made by the Python version.
    realm.data["players"][player.id] = {"name": "Moon Pie", "seen": 1}
    session = realm._new_session(player.id)
    asyncio.run(realm.offer(player.id, [{"text": "Planted ten seeds.", "data": {"seeds": 10}}]))
    proposal = realm.data["offers"].pop(player.id)[0]
    record = add_signature(add_signature({**proposal, "public": True}, player), realm.signer)
    realm.data["records"].append(record)
    realm.data["public"].append(record)
    realm._save()

    seen = js("realm", {"base": BASE, "card": CARD, "words": words, "dataFile": str(data), "player": player.id, "cookie": f"endlessmind={session}"})
    assert seen["me"]["player"] == player.id
    assert seen["me"]["playerName"] == "Moon Pie"
    assert seen["records"] == [record]
    assert seen["list"] == realm.list()
    # And back: the Python version reads what the JavaScript version wrote.
    again = open_realm(BASE, CARD, words=words, data_file=data)
    assert again.data["offers"][player.id][0]["text"] == "Offered by the JavaScript version."
    assert asyncio.run(again.player(f"endlessmind={session}")) == player.id
