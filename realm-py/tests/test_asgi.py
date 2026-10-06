# The ASGI adapter in a FastAPI app: the realm answers its own addresses, the game answers the rest
# (including POST bodies on paths the realm passes on), and the game reads the player from its request.

import json
import secrets

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from endlessmind import RealmMiddleware, add_signature, memory_store, open_realm, signer_from_words, words_from_entropy

BASE = "http://testserver/game/"
PLAYER = signer_from_words(words_from_entropy(bytes([7]) * 32))


def make_app():
    realm = open_realm(BASE, {"name": "ASGI Realm", "description": "For tests."}, words=words_from_entropy(bytes([1]) * 32), store=memory_store())
    app = FastAPI()
    app.add_middleware(RealmMiddleware, realm=realm)

    @app.get("/game/")
    async def home(request: Request):
        player = await realm.player(request)
        return {"player": player, "name": realm.player_name(player) if player else None}

    @app.post("/game/endlessmind/echo")
    async def echo(request: Request):
        return {"body": (await request.body()).decode()}

    return realm, app


def test_fastapi_sign_in_and_player():
    realm, app = make_app()
    client = TestClient(app, base_url="http://testserver")
    assert client.get("/game/").json() == {"player": None, "name": None}
    assert client.get("/game/endlessmind-card.json").json()["name"] == "ASGI Realm"
    assert client.head("/game/endlessmind-card.json").content == b""
    assert client.get("/game/endlessmind/signin.js").text.startswith("// The sign-in box")

    code = client.post("/game/endlessmind/start").json()
    note = add_signature(
        {"v": 1, "type": "enter", "player": PLAYER.id, "name": "Moon Pie", "address": code["address"],
         "time": realm.now(), "nonce": secrets.token_hex(16)},
        PLAYER,
    )
    phone = TestClient(app, base_url="http://testserver")
    answer = phone.post(f"/game/join/{code['code']}", data={"enter": json.dumps(note)})
    assert answer.status_code == 200 and "You're in" in answer.text
    wait = client.get(f"/game/endlessmind/wait/{code['code']}", params={"token": code["token"]})
    assert wait.json() == {"state": "in", "player": PLAYER.id}
    assert client.get("/game/").json() == {"player": PLAYER.id, "name": "Moon Pie"}
    assert client.get(f"/game/join/{code['code']}", follow_redirects=False).status_code == 303


def test_bodies_the_realm_passes_on_reach_the_game():
    _, app = make_app()
    client = TestClient(app)
    assert client.post("/game/endlessmind/echo", content=b"x" * 300_000).json() == {"body": "x" * 300_000}, "even past the size the realm reads"
