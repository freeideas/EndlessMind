"""Signed JSON: notes and records, the same as shared/signed.js. See "Signed JSON" in specs/PROTOCOL.md."""

from __future__ import annotations

import json
import math
import re
from typing import Any

from .keys import Signer, base64url, from_base64url, sign, verify

MAX_SAFE = 2**53 - 1
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
    """The bytes every signer signs: the canonical JSON of everything except `sigs`."""
    return canonical({k: v for k, v in obj.items() if k != "sigs"}).encode("utf-8")


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
