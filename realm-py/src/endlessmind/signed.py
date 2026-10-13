"""Signed JSON: sign-in notes and records, and the words a player adds to a record, the same as
shared/signed.js. See "Signed JSON" and "Records" in specs/PROTOCOL.md."""

from __future__ import annotations

import hashlib
import json
import math
import re
from typing import Any

from .keys import Signer, base64url, from_base64url, sign, verify

MAX_SAFE = 2**53 - 1
NOTE_MAX = 500  # the most characters a player's own words on a record may have
_LONE = re.compile("[\ud800-\udfff]")


def js_string(text: str) -> str:
    """A string as JavaScript's JSON.stringify writes it."""
    return _LONE.sub(lambda m: f"\\u{ord(m.group()):04x}", json.dumps(text, ensure_ascii=False))


def _utf16(text: str) -> bytes:
    return text.encode("utf-16-be", "surrogatepass")


def canonical(value: Any) -> str:
    """JSON with object keys sorted at every level and no spaces; numbers must be integers."""
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(canonical(v) for v in value) + "]"
    if isinstance(value, dict):
        keys = sorted(value, key=_utf16)
        return "{" + ",".join(f"{js_string(k)}:{canonical(value[k])}" for k in keys) + "}"
    if value is None or value is True or value is False:
        return json.dumps(value)
    if isinstance(value, int):
        if abs(value) > MAX_SAFE:
            raise ValueError("numbers must be integers")
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value) or not value.is_integer() or abs(value) > MAX_SAFE:
            raise ValueError("numbers must be integers")
        return str(int(value))
    if isinstance(value, str):
        return js_string(value)
    raise TypeError(f"cannot write {type(value).__name__} as JSON")


def signed_bytes(obj: dict) -> bytes:
    """The bytes every signer signs: the canonical JSON of everything except `sigs` and `notes`."""
    return canonical({k: v for k, v in obj.items() if k not in ("sigs", "notes")}).encode("utf-8")


def add_signature(obj: dict, signer: Signer) -> dict:
    """Add one signature to a note or record, keeping any signatures it already has."""
    sig = base64url(sign(signer, signed_bytes(obj)))
    sigs = obj.get("sigs")
    return {**obj, "sigs": {**(sigs if isinstance(sigs, dict) else {}), signer.id: sig}}


def valid_signers(obj: dict) -> list[str]:
    """The IDs whose signatures on this object are valid."""
    data = signed_bytes(obj)
    sigs = obj.get("sigs")
    ok = []
    for id, sig in (sigs.items() if isinstance(sigs, dict) else ()):
        if not isinstance(sig, str):
            continue
        try:
            raw = from_base64url(sig)
        except ValueError:
            continue
        if verify(id, raw, data):
            ok.append(id)
    return ok


def is_complete(record: dict) -> bool:
    """A record is complete when every ID in `signers` has validly signed it."""
    signers = record.get("signers")
    if not isinstance(signers, list) or not signers:
        return False
    ok = valid_signers(record)
    return all(id in ok for id in signers)


def u16len(text: str) -> int:
    """A string's length as JavaScript counts it."""
    return len(text.encode("utf-16-le", "surrogatepass")) // 2


def _note_bytes(record: dict, text: str) -> bytes:
    """The bytes a note's writer signs: they name the record by the SHA-256 of its signed bytes, so a
    note belongs to one exact record."""
    note = {"v": 1, "type": "note", "record": hashlib.sha256(signed_bytes(record)).hexdigest(), "text": text}
    return canonical(note).encode("utf-8")


def add_note(record: dict, signer: Signer, text: str) -> dict:
    """Add a signer's own words (at most 500 characters) to a record, in place of any they added before.
    Only their proof covers them, and the record's proofs stay valid."""
    if not isinstance(text, str) or not text or u16len(text) > NOTE_MAX:
        raise ValueError(f"a note is 1 to {NOTE_MAX} characters")
    sig = base64url(sign(signer, _note_bytes(record, text)))
    notes = record.get("notes")
    return {**record, "notes": {**(notes if isinstance(notes, dict) else {}), signer.id: {"text": text, "sig": sig}}}


def valid_notes(record: dict) -> dict[str, dict[str, str]]:
    """The notes on a record that check out, by their writers' IDs: each written by one of the record's
    signers, for this exact record. Any other note is left out."""
    ok: dict[str, dict[str, str]] = {}
    notes = record.get("notes")
    signers = record.get("signers")
    if not isinstance(notes, dict) or not isinstance(signers, list):
        return ok
    for id in signers:
        note = notes.get(id) if isinstance(id, str) else None
        if not isinstance(note, dict):
            continue
        text, sig = note.get("text"), note.get("sig")
        if not isinstance(text, str) or not text or u16len(text) > NOTE_MAX or not isinstance(sig, str):
            continue
        try:
            if verify(id, from_base64url(sig), _note_bytes(record, text)):
                ok[id] = {"text": text, "sig": sig}
        except (ValueError, TypeError):
            continue
    return ok


def parse_json(text: str | bytes) -> Any:
    """JSON.parse: like json.loads, but refusing NaN and Infinity, which JavaScript does not accept."""

    def refuse(name: str) -> Any:
        raise ValueError(f"not JSON: {name}")

    return json.loads(text, parse_constant=refuse)


def to_json(value: Any) -> str:
    """JSON.stringify(value): compact, keeping key order and non-ASCII characters."""
    return _LONE.sub(
        lambda m: f"\\u{ord(m.group()):04x}", json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    )
