# The secret-phrase recipe must match the published standards, so the Python version turns the same 24
# words into the same ID as shared/keys.js. Vectors: BIP39 (Trezor's list) and SLIP-0010, as in
# tests/keys_test.js.

import json
import os
import re
from pathlib import Path

import pytest

from endlessmind import (
    add_signature,
    base32,
    canonical,
    check_words,
    compact_phrase,
    default_name,
    from_base32,
    is_complete,
    master_key,
    new_words,
    seed_from_words,
    signer_from_private_key,
    signer_from_words,
    tidy_name,
    valid_signers,
    words_from_compact,
    words_from_entropy,
)
from endlessmind.words_en import WORDS

REPO = Path(__file__).resolve().parents[2]
ZERO_WORDS = " ".join(["abandon"] * 23 + ["art"])


def test_bip39_vector():
    assert words_from_entropy(bytes(32)) == ZERO_WORDS
    assert seed_from_words(ZERO_WORDS, "TREZOR").hex() == (
        "bda85446c68413707090a52022edd26a1c9462295029f2e60cd7c4f2bbd3097170af7a4d73245cafa9c3cca8d561a7c3de6f5d4a10be8ed2a5e608d68f92fcc8"
    )


def test_slip10_vector():
    raw = master_key(bytes.fromhex("000102030405060708090a0b0c0d0e0f"))
    assert raw.hex() == "2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7"
    signer = signer_from_private_key(raw)
    assert from_base32(signer.id).hex() == "a4b2856bfec510abab89753fac1ac0e1112364e7d250545963f135f2a33188ed"


def test_id_for_all_zero_phrase():
    assert signer_from_words(ZERO_WORDS).id == "pl5hdegz6xnovjc5szio2phhycltxmhdl5zwdp4fqoe2rty4h46a"


def test_word_list_matches_shared():
    js = (REPO / "shared" / "words-en.js").read_text()
    assert re.search(r'WORDS = "([a-z ]+)"', js)[1].split(" ") == WORDS


def test_words_are_tidied_and_mistakes_caught():
    assert check_words("  Abandon " + ZERO_WORDS[8:].upper() + "\n") == ZERO_WORDS
    with pytest.raises(ValueError, match="fit together"):
        check_words(ZERO_WORDS[:-3] + "zoo")
    with pytest.raises(ValueError, match="not in the word list"):
        check_words(ZERO_WORDS + "t")
    with pytest.raises(ValueError, match="24 words"):
        check_words("abandon art")
    check_words(new_words())
    numbered = "\n".join(f"{i + 1}. {w}" for i, w in enumerate(ZERO_WORDS.split(" ")))
    assert check_words(numbered) == ZERO_WORDS


def test_base32_round_trip():
    data = os.urandom(32)
    assert from_base32(base32(data)) == data


def test_canonical():
    assert canonical({"b": 1, "a": [True, None, "x"], "c": {"z": 1, "y": 2}}) == '{"a":[true,null,"x"],"b":1,"c":{"y":2,"z":1}}'
    with pytest.raises(ValueError):
        canonical({"a": 1.5})
    assert canonical({"a": 2.0}) == '{"a":2}'


def test_record_complete_only_when_all_signed():
    realm = signer_from_words(words_from_entropy(bytes([1]) * 32))
    player = signer_from_words(ZERO_WORDS)
    record = {"v": 1, "type": "record", "signers": [realm.id, player.id], "time": 1790000000000, "text": "Finished the Glass Maze."}
    half = add_signature(record, realm)
    assert not is_complete(half)
    whole = add_signature(half, player)
    assert is_complete(whole)
    assert valid_signers({**whole, "text": "Finished the Glass Maze twice."}) == []


def test_protocol_examples_check_out():
    md = (REPO / "specs" / "PROTOCOL.md").read_text()
    examples = [t for t in re.findall(r"```json\n([\s\S]*?)```", md) if '"sigs"' in t and '"..."' not in t]
    assert len(examples) >= 2
    for text in examples:
        example = json.loads(text)
        assert sorted(valid_signers(example)) == sorted(example["sigs"])


def test_names():
    assert re.fullmatch(r"[A-Z][a-z]+ [A-Z][a-z]+", default_name(signer_from_words(ZERO_WORDS).id))
    assert tidy_name("  Moon \u0000 Pie\n ") == "Moon Pie"
    assert len(tidy_name("x" * 60)) == 40
    assert tidy_name(7) == ""


def test_compact_phrase():
    assert words_from_compact(compact_phrase(ZERO_WORDS)) == ZERO_WORDS
    words = new_words()
    compact = compact_phrase(words)
    assert len(compact) == 52
    assert words_from_compact(compact) == words
