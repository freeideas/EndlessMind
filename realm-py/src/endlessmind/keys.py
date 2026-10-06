"""Keys and IDs, the same as shared/keys.js.

A key is an Ed25519 key pair. Its ID is the public key in lowercase base32 (52 characters). A person's
key comes from 24 words (BIP39), which recreate the same key on any device.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import unicodedata
from dataclasses import dataclass, field

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from .words_en import WORDS

B32 = "abcdefghijklmnopqrstuvwxyz234567"
_INDEX = {w: i for i, w in enumerate(WORDS)}
_ID = re.compile(r"[a-z2-7]{52}")


def base32(data: bytes) -> str:
    out, bits, value = [], 0, 0
    for b in data:
        value = ((value << 8) | b) & 0xFFFF
        bits += 8
        while bits >= 5:
            out.append(B32[(value >> (bits - 5)) & 31])
            bits -= 5
    if bits > 0:
        out.append(B32[(value << (5 - bits)) & 31])
    return "".join(out)


def from_base32(text: str) -> bytes:
    out, bits, value = bytearray(), 0, 0
    for ch in text:
        i = B32.find(ch)
        if i < 0:
            raise ValueError("not base32")
        value = ((value << 5) | i) & 0xFFFF
        bits += 5
        if bits >= 8:
            out.append((value >> (bits - 8)) & 255)
            bits -= 8
    return bytes(out)


def base64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def from_base64url(text: str) -> bytes:
    """Decode base64url with or without padding; raises ValueError if it is not base64url."""
    s = text.rstrip("=")
    if len(s) % 4 == 1:
        raise ValueError("not base64url")
    return base64.b64decode(s.replace("-", "+").replace("_", "/") + "=" * (-len(s) % 4), validate=True)


def is_id(value: object) -> bool:
    return isinstance(value, str) and _ID.fullmatch(value) is not None


def new_words() -> str:
    """24 new words: 256 random bits and an 8-bit checksum, as BIP39 says."""
    return words_from_entropy(os.urandom(32))


def words_from_entropy(entropy: bytes) -> str:
    if len(entropy) != 32:
        raise ValueError("entropy must be 32 bytes")
    check = hashlib.sha256(entropy).digest()[0]
    bits = "".join(f"{b:08b}" for b in bytes(entropy) + bytes([check]))
    return " ".join(WORDS[int(bits[i * 11 : i * 11 + 11], 2)] for i in range(24))


def _phrase_bytes(words: list[str]) -> bytes:
    bits = "".join(f"{_INDEX[w]:011b}" for w in words)
    return bytes(int(bits[i * 8 : i * 8 + 8], 2) for i in range(33))


def check_words(text: str) -> str:
    """Tidy typed or pasted words, or raise ValueError if they are not 24 valid words with a matching
    checksum. Anything but letters is ignored, so a numbered list copied from a screenshot works."""
    words = [w for w in re.split(r"[^a-z]+", text.lower()) if w]
    if len(words) != 24:
        raise ValueError(f"expected 24 words, got {len(words)}")
    bad = [w for w in words if w not in _INDEX]
    if bad:
        raise ValueError(f"not in the word list: {', '.join(bad)}")
    data = _phrase_bytes(words)
    if hashlib.sha256(data[:32]).digest()[0] != data[32]:
        raise ValueError("the words do not fit together; check for a mistyped word")
    return " ".join(words)


def compact_phrase(words: str) -> str:
    """The phrase written compactly, for QR codes: its 256 random bits in base32 (52 characters)."""
    return base32(_phrase_bytes(check_words(words).split(" "))[:32])


def words_from_compact(compact: str) -> str:
    if not _ID.fullmatch(compact):
        raise ValueError("not a compact phrase")
    return words_from_entropy(from_base32(compact))


def seed_from_words(words: str, passphrase: str = "") -> bytes:
    """The BIP39 seed (64 bytes) for the words."""
    tidy = check_words(words)
    password = unicodedata.normalize("NFKD", tidy).encode()
    salt = unicodedata.normalize("NFKD", "mnemonic" + passphrase).encode()
    return hashlib.pbkdf2_hmac("sha512", password, salt, 2048, 64)


def master_key(seed: bytes) -> bytes:
    """The SLIP-0010 Ed25519 master private key (32 bytes) for a seed."""
    return hmac.new(b"ed25519 seed", seed, hashlib.sha512).digest()[:32]


@dataclass(frozen=True)
class Signer:
    """A signing key and its ID."""

    id: str
    private_key: Ed25519PrivateKey = field(repr=False)


def signer_from_private_key(raw: bytes) -> Signer:
    if len(raw) > 32:
        raise ValueError("a private key is 32 bytes")
    raw = bytes(raw).ljust(32, b"\0")  # as shared/keys.js, which fills a shorter key with zeros
    key = Ed25519PrivateKey.from_private_bytes(raw)
    public = key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    return Signer(base32(public), key)


def signer_from_words(words: str) -> Signer:
    """The key for 24 words: the BIP39 seed with no passphrase, then its SLIP-0010 master key."""
    return signer_from_private_key(master_key(seed_from_words(words)))


def sign(signer: Signer, data: bytes) -> bytes:
    return signer.private_key.sign(data)


def verify(id: str, signature: bytes, data: bytes) -> bool:
    if not is_id(id):
        return False
    try:
        Ed25519PublicKey.from_public_bytes(from_base32(id)).verify(signature, data)
        return True
    except (InvalidSignature, ValueError):
        return False
