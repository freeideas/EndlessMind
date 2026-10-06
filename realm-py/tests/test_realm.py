# The realm library: sign-in notes, join codes and their expiry, claiming records, the public list and
# burned IDs. The same cases as tests/realm_test.js, made directly against realm.handle with a clock the
# tests move by hand.

import asyncio
import json
import re
import secrets
from urllib.parse import quote, unquote, urlencode

from endlessmind import (
    add_signature,
    base64url,
    is_complete,
    master_key,
    memory_store,
    open_realm,
    seed_from_words,
    signer_from_words,
    valid_signers,
    words_from_entropy,
)

BASE = "https://garden.example/"
PORTAL = "https://portal.example/EntryPortal/v0.1/"


def words_for(n):
    return words_from_entropy(bytes([n]) * 32)


PLAYER = signer_from_words(words_for(7))


class Clock:
    now = 1790000000000


def setup():
    clock = Clock()
    realm = open_realm(
        BASE,
        {"name": "Test Realm", "description": "For tests."},
        portal=PORTAL,
        words=words_for(1),
        store=memory_store(),
        now=lambda: clock.now,
    )
    return realm, clock


def call(realm, path, method="GET", headers=None, form=None):
    headers = dict(headers or {})
    body = b""
    if form is not None:
        method, body = "POST", urlencode(form).encode()
        headers["content-type"] = "application/x-www-form-urlencoded;charset=UTF-8"
    return asyncio.run(realm.handle(method, "/" + path, headers, body))


def note(address, time, **extra):
    return add_signature(
        {"v": 1, "type": "enter", "player": PLAYER.id, "name": " Moon  Pie", "address": address, "time": time,
         "nonce": secrets.token_hex(16), "portal": PORTAL, **extra},
        PLAYER,
    )


def join(realm, time, edit=lambda n: n):
    code = call(realm, "endlessmind/start", "POST").json()
    signed = edit(note(code["address"], time))
    answer = call(realm, f"join/{code['code']}", form={"enter": json.dumps(signed)})
    return code, answer, signed


def cookie_of(response):
    return {"cookie": response.headers["set-cookie"].split(";")[0]}


def test_sign_in_lets_in_the_waiting_screen_once():
    realm, clock = setup()
    code, answer, signed = join(realm, clock.now)
    assert answer.status == 200
    assert "You're in" in answer.text()
    assert code["link"] == PORTAL + "#url=" + quote(code["address"], safe="!'()*")
    assert code["qr"].startswith("<svg")
    assert code["typed"] == f"garden.example/join/{code['code']}"

    assert call(realm, f"endlessmind/wait/{code['code']}?token=nope").json()["state"] == "unknown"
    wait = call(realm, f"endlessmind/wait/{code['code']}?token={code['token']}")
    assert wait.json() == {"state": "in", "player": PLAYER.id}
    me = call(realm, "endlessmind/me", headers=cookie_of(wait)).json()
    assert me["player"] == PLAYER.id
    assert me["playerName"] == "Moon Pie"

    again = call(realm, f"join/{code['code']}", form={"enter": json.dumps(note(code["address"], clock.now))})
    assert again.status == 400, "a code works once"
    assert join(realm, clock.now, lambda n: signed)[1].status == 400, "a note for one address is useless at another"


def test_join_codes_expire_and_notes_must_be_recent():
    realm, clock = setup()
    code = call(realm, "endlessmind/start", "POST").json()
    clock.now += 2 * 60 * 1000 + 1
    late = call(realm, f"join/{code['code']}", form={"enter": json.dumps(note(code["address"], clock.now))})
    assert late.status == 400
    assert "expired" in late.text()
    assert call(realm, f"endlessmind/wait/{code['code']}?token={code['token']}").json()["state"] == "expired"
    assert "time on your device" in join(realm, clock.now - 3 * 60 * 1000)[1].text()


def test_notes_refused_when_tampered_reused_or_elsewhere():
    realm, clock = setup()
    assert join(realm, clock.now, lambda n: {**n, "player": "b" + PLAYER.id[1:]})[1].status == 400
    assert join(realm, clock.now, lambda n: None)[1].status == 400

    _, first, signed = join(realm, clock.now)
    assert first.status == 200
    code = call(realm, "endlessmind/start", "POST").json()
    same_nonce = add_signature({**signed, "address": code["address"], "sigs": {}}, PLAYER)
    reused = call(realm, f"join/{code['code']}", form={"enter": json.dumps(same_nonce)})
    assert "already used" in reused.text()

    other = call(realm, "endlessmind/start", "POST").json()
    for_other = note("https://other.example/join/" + other["code"], clock.now)
    wrong = call(realm, f"join/{other['code']}", form={"enter": json.dumps(for_other)})
    assert "different address" in wrong.text()


def sign_in(realm, time):
    code, _, _ = join(realm, time)
    return cookie_of(call(realm, f"endlessmind/wait/{code['code']}?token={code['token']}"))


def sign_payload(response):
    location = response.headers["location"]
    assert location.startswith(PORTAL + "#sign="), location
    return json.loads(unquote(location[len(PORTAL + "#sign=") :]))


def test_claiming():
    realm, clock = setup()
    cookie = sign_in(realm, clock.now)
    asyncio.run(realm.offer(PLAYER.id, [{"text": "Planted ten seeds.", "data": {"seeds": 10}}, {"text": "Watered a seed."}]))
    assert call(realm, "endlessmind/me", headers=cookie).json()["claims"] == 2
    assert call(realm, "endlessmind/claim", "POST").status == 401, "guests cannot claim"

    claim = call(realm, "endlessmind/claim", "POST", cookie).json()
    payload = sign_payload(call(realm, f"claim/{claim['code']}"))
    assert payload["return"] == claim["address"]
    assert len(payload["records"]) == 2
    assert payload["records"][0]["signers"] == [realm.id, PLAYER.id]
    assert "sigs" not in payload["records"][0], "proposals carry no proof yet"

    mine = add_signature({**payload["records"][0], "public": True}, PLAYER)
    changed = add_signature({**payload["records"][1], "text": "Watered a hundred seeds."}, PLAYER)
    done = sign_payload(call(realm, f"claim/{claim['code']}", form={"records": json.dumps([mine, changed])}))
    assert "return" not in done
    assert len(done["records"]) == 1, "a changed text is refused"
    assert is_complete(done["records"][0])
    assert sorted(valid_signers(done["records"][0])) == sorted([realm.id, PLAYER.id])

    listed = call(realm, "endlessmind-list.json").json()
    assert listed["realm"] == realm.id
    assert listed["records"] == done["records"]
    wait = call(realm, f"endlessmind/wait/{claim['code']}?token={claim['token']}").json()
    assert wait == {"state": "claimed", "count": 1}
    assert call(realm, "endlessmind/me", headers=cookie).json()["claims"] == 0
    assert call(realm, f"claim/{claim['code']}").status == 410, "a claim code works once"


def test_private_records_signed_not_published():
    realm, clock = setup()
    cookie = sign_in(realm, clock.now)
    asyncio.run(realm.offer(PLAYER.id, [{"text": "Found the quiet pond."}]))
    claim = call(realm, "endlessmind/claim", "POST", cookie).json()
    [proposal] = sign_payload(call(realm, f"claim/{claim['code']}"))["records"]
    signed = add_signature(proposal, PLAYER)
    done = sign_payload(call(realm, f"claim/{claim['code']}", form={"records": json.dumps([signed])}))
    assert is_complete(done["records"][0])
    assert realm.list()["records"] == []

    assert realm.records(PLAYER.id) == done["records"]
    assert call(realm, "endlessmind/me", headers=cookie).json()["records"] == 1
    restore = call(realm, "endlessmind/restore", "POST", cookie).json()
    back = sign_payload(call(realm, f"claim/{restore['code']}"))
    assert "return" not in back, "nothing to sign, only records to keep"
    assert back["back"] == BASE
    assert back["records"] == done["records"]
    assert call(realm, f"claim/{restore['code']}").status == 410, "a restore code works once"
    assert call(realm, "endlessmind/restore", "POST").status == 401, "only for a signed-in player"


def test_card_signed_and_served_to_any_page():
    realm, _ = setup()
    response = call(realm, "endlessmind-card.json")
    assert response.headers["access-control-allow-origin"] == "*"
    card = response.json()
    assert valid_signers(card) == [realm.id]
    assert card["play"] == [BASE]
    assert card["list"] == BASE + "endlessmind-list.json"


def test_burned_id_refused():
    realm, clock = setup()
    cookie = sign_in(realm, clock.now)
    key = base64url(master_key(seed_from_words(words_for(7))))
    stranger = {"v": 1, "type": "burn", "key": base64url(master_key(seed_from_words(words_for(9))))}
    assert "never seen" in call(realm, "join/ANY", form={"burn": json.dumps(stranger)}).text()
    assert "burned here" in call(realm, "join/ANY", form={"burn": json.dumps({"v": 1, "type": "burn", "key": key})}).text()
    assert call(realm, "endlessmind/me", headers=cookie).json()["player"] is None
    assert "burned" in join(realm, clock.now)[1].text()


def test_signing_device_gets_a_session_and_a_link():
    realm, clock = setup()
    _, answer, _ = join(realm, clock.now)
    assert re.search(f'href="{BASE}"', answer.text())
    assert call(realm, "endlessmind/me", headers=cookie_of(answer)).json()["player"] == PLAYER.id


def test_signin_js_served_unchanged_and_other_paths_left_to_the_game():
    realm, _ = setup()
    from endlessmind.realm import SIGNIN_JS

    response = call(realm, "endlessmind/signin.js")
    assert response.body == SIGNIN_JS.read_bytes()
    assert response.headers["content-type"] == "text/javascript; charset=utf-8"
    assert call(realm, "index.html") is None
    assert call(realm, "endlessmind/nothing") is None


def test_secret_and_data_files_made_on_first_run(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    realm = open_realm(BASE, {"name": "File Realm", "description": "Kept in files."})
    assert (tmp_path / ".data" / "realm-secret.txt").stat().st_mode & 0o777 == 0o600
    asyncio.run(realm.offer(PLAYER.id, [{"text": "Kept."}]))
    again = open_realm(BASE, {"name": "File Realm", "description": "Kept in files."})
    assert again.id == realm.id
    assert again.data["offers"][PLAYER.id][0]["text"] == "Kept."
