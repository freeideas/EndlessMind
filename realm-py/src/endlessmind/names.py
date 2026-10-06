"""Player names, the same as shared/names.js: what people see instead of a player ID.

A player may choose any name; until they do, their name comes from their ID. Names are not unique and
prove nothing: records and trust rest on the ID.
"""

from __future__ import annotations

import re
import unicodedata

from .keys import from_base32

# The same words, in the same order, as shared/names.js (tests/test_cross.py checks the names match).
ADJECTIVES = (
    "amber brave breezy bright bouncy calm cheerful clever cosmic cozy crimson curious dapper daring dreamy "
    "eager fancy frosty gentle gleaming glowing golden happy honest humble jolly keen kind lively lucky lunar "
    "mellow merry mighty minty misty mossy nifty nimble noble peppy plucky polite quick quiet rosy rusty "
    "silver snowy sparkly spry starry sunny swift tidy tiny velvet vivid wandering whimsical witty zesty "
    "patient sunlit"
).split(" ")
NOUNS = (
    "acorn badger beetle biscuit button cactus clover comet cricket dolphin dumpling ember falcon feather "
    "fern galaxy garnet gecko hazel heron iceberg jigsaw kettle kite koala lagoon lantern lynx maple meadow "
    "moose muffin nebula newt nutmeg orchid otter owl panda pebble penguin pinecone pretzel puddle puffin "
    "quill quokka raven ripple rocket saffron sparrow sprout teapot thimble tulip turtle umbrella voyager "
    "waffle walrus willow yak zebra"
).split(" ")

# What JavaScript's \s and trim() count as space.
_SPACE = "\t\n\v\f\r                  　﻿"
_SPACES = re.compile("[" + re.escape(_SPACE) + "]+")


def default_name(id: str) -> str:
    """The starting name for a player ID, such as "Amber Otter"."""
    data = from_base32(id)
    return f"{ADJECTIVES[data[0] % 64].capitalize()} {NOUNS[data[1] % 64].capitalize()}"


def tidy_name(name: object) -> str:
    """Tidy a chosen name: trimmed, single spaces, no control characters, at most 40 characters
    (counted as JavaScript counts them). Returns "" if nothing is left."""
    if not isinstance(name, str):
        return ""
    text = "".join(c for c in name if unicodedata.category(c) not in ("Cc", "Cf"))
    text = _SPACES.sub(" ", text).strip(_SPACE)
    units = text.encode("utf-16-le", "surrogatepass")[:80]
    if len(units) == 80 and 0xD800 <= int.from_bytes(units[78:80], "little") <= 0xDBFF:
        units = units[:78]  # JavaScript would keep half of a character here; drop it instead
    return units.decode("utf-16-le", "surrogatepass").strip(_SPACE)
