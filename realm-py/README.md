# The realm library for Python

What a realm written in Python includes to join Endless Mind: the same sign-in by QR code, claiming records, realm card, public list and refusing burned IDs as [realm/realm.js](../realm/realm.js), with the same addresses, formats and `.data/` files, so a realm can move between the two. The browser side is not copied: the realm serves [realm/signin.js](../realm/signin.js) unchanged. The formats are in [specs/PROTOCOL.md](../specs/PROTOCOL.md).

| File                         | What it is                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `src/endlessmind/realm.py`   | The server side: `open_realm`, then `realm.handle(...)` for each request      |
| `src/endlessmind/asgi.py`    | `RealmMiddleware`: puts the realm in front of any ASGI app, such as FastAPI   |
| `src/endlessmind/keys.py`    | Secret phrases, keys and IDs, as `shared/keys.js`                             |
| `src/endlessmind/signed.py`  | Signed JSON, as `shared/signed.js`                                            |
| `src/endlessmind/names.py`   | Starting names and tidying chosen names, as `shared/names.js`                 |
| `src/endlessmind/qr.py`      | QR codes as SVG, as `shared/qr.js`                                            |
| `tests/`                     | pytest; `test_cross.py` runs the JavaScript with Deno and compares            |

## Install

The package is `endlessmind`. A game in another repository adds it as a path dependency on a checkout of this one, with `uv add --editable ../EveryGame/realm-py`, which writes this to its `pyproject.toml`:

```toml
[tool.uv.sources]
endlessmind = { path = "../EveryGame/realm-py", editable = true }
```

Keep it editable: the realm serves `realm/signin.js` from the checkout, so the page always gets the same file the Deno realms serve. (Without the checkout, pass `signin_file=` to `open_realm`.)

## Use

With FastAPI (or any ASGI app):

```python
from fastapi import FastAPI, Request
from endlessmind import RealmMiddleware, open_realm

realm = open_realm(
    "https://garden.example.org/",  # the public address; the realm answers under it
    {"name": "My Realm", "description": "What it is, in a sentence."},
)
app = FastAPI()
app.add_middleware(RealmMiddleware, realm=realm)

@app.get("/")
async def home(request: Request):
    player = await realm.player(request)  # the player ID, or None for a guest
    if player:
        realm.player_name(player)  # the name to show for them, such as "Witty Clover"
        realm.records(player)  # every record signed with them, public and private (only public ones are listed)
        await realm.offer(player, [{"text": "Finished the Glass Maze."}])  # a record for the player to claim
    ...
```

Without ASGI, call the core directly. It needs only the method, the path as sent (with its query string), the headers and the body, and returns a `Response` (`status`, `headers`, `body`) or `None` when the request is the game's:

```python
response = await realm.handle("POST", "/join/K7Q2P9", headers, body)
```

`realm.player(...)` takes anything that carries the request's headers: a Starlette or FastAPI request, an ASGI scope, a headers mapping, or the `Cookie` header itself.

On the page: `import { mountSignIn } from "./endlessmind/signin.js"; mountSignIn(element, { onChange })`, as in [realm/README.md](../realm/README.md).

`open_realm` takes the same options as `openRealm`, written the Python way: `portal`, `secret_file`, `data_file`, `words`, `store`, `now`, `is_burned` (may be a plain function or a coroutine) and `on_record`. Like the JavaScript version, it keeps the realm's secret phrase in `.data/realm-secret.txt` (made on first run; keep a copy, since it is the realm's identity) and what it must remember in `.data/realm-data.json`, inside the folder the game runs in. A custom `store` has plain `load()` and `save(data)` methods. Unlike `openRealm`, `open_realm` is not a coroutine, so a game can open its realm when it starts, before any event loop runs. Like the JavaScript version, a realm keeps join codes, claim codes and recent nonces in memory, so run one process per realm.

The addresses it answers are the ones listed in [realm/README.md](../realm/README.md#what-it-answers).

## Matching the JavaScript

- **Keys:** the same recipe (BIP39 seed, then the SLIP-0010 Ed25519 master key), using `cryptography` for Ed25519 and the standard library for the rest. The tests check the published BIP39 and SLIP-0010 vectors, as `tests/keys_test.js` does.
- **Signed JSON:** keys sorted by UTF-16 code units and strings written as `JSON.stringify` writes them, so the bytes signed are the same. Ed25519 signatures do not depend on chance, so both versions sign the same card byte for byte.
- **QR codes:** made with Project Nayuki's own Python version of the same generator (the `qrcodegen` package, pinned to 1.8.0 like `shared/qrcodegen.js`), so the SVG images come out byte for byte the same.
- **Names and lengths** count characters as JavaScript does. One small difference: where a chosen name is cut at 40 characters in the middle of an emoji, JavaScript keeps half of the emoji and Python drops it.
- **Forms:** sign-in notes, burn notices and claimed records arrive as URL-encoded or multipart forms, as with `request.formData()`.

## Tests

`uv run pytest` in this folder. `tests/test_cross.py` runs [tests/js_helper.js](tests/js_helper.js) with Deno and checks that the two versions give the same IDs, canonical JSON, signatures, names, QR codes and realm card, and that a realm moves between them on its data file. It is skipped when Deno is not installed.
