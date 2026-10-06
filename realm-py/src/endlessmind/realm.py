"""The realm library for Python: the same as realm/realm.js, for game servers written in Python.

    realm = open_realm(base="https://example.org/", card={"name": "...", "description": "..."})
    response = await realm.handle(method, path, headers, body)  # a Response, or None for the game

Inside the game, `await realm.player(request)` is the signed-in player's ID (or None for a guest), and
`await realm.offer(player, [{"text": ...}])` proposes records for the player to claim. The page includes
`<base>endlessmind/signin.js`, which draws the sign-in and claim boxes. See realm-py/README.md.
"""

from __future__ import annotations

import copy
import email.parser
import email.policy
import inspect
import os
import re
import secrets
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable, Iterable, Mapping, Protocol, Union
from urllib.parse import parse_qsl, quote, urlsplit

from .keys import check_words, from_base64url, is_id, new_words, signer_from_private_key, signer_from_words
from .names import default_name, tidy_name
from .qr import qr_svg
from .signed import MAX_SAFE, add_signature, canonical, is_complete, parse_json, signed_bytes, to_json, valid_signers

JOIN_MS = 2 * 60 * 1000  # a join code works once, for two minutes
CLOCK_MS = 2 * 60 * 1000  # how far a sign-in note's time may be from this realm's clock
CLAIM_MS = 10 * 60 * 1000  # a claim code works until its records come back, for ten minutes
SESSION_MS = 30 * 24 * 60 * 60 * 1000
MAX_SIGNED = 16 * 1024
MAX_BODY = 256 * 1024
CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"  # no 0, 1, I or O, which are easy to mistype
COOKIE = "endlessmind"
DEFAULT_PORTAL = "https://portal.endlessmind.com/"  # forwards to the newest version

# realm/signin.js in this repository, served unchanged.
SIGNIN_JS = Path(__file__).resolve().parents[3] / "realm" / "signin.js"

Headers = Union[Mapping[str, str], Iterable[tuple[Any, Any]], None]


class Store(Protocol):
    """Where the realm keeps what it must remember."""

    def load(self) -> Any: ...
    def save(self, data: Any) -> None: ...


@dataclass
class Response:
    """An answer to send: status, headers (lowercase names) and body."""

    status: int = 200
    headers: dict[str, str] = field(default_factory=dict)
    body: bytes = b""

    def text(self) -> str:
        return self.body.decode("utf-8")

    def json(self) -> Any:
        return parse_json(self.body)


def open_realm(
    base: str,
    card: Mapping[str, Any],
    *,
    portal: str | None = None,
    secret_file: str | os.PathLike | None = None,
    data_file: str | os.PathLike | None = None,
    words: str | None = None,
    store: Store | None = None,
    now: Callable[[], int] | None = None,
    is_burned: Callable[[str], bool | Awaitable[bool]] | None = None,
    on_record: Callable[[dict], Any] | None = None,
    signin_file: str | os.PathLike | None = None,
) -> "Realm":
    """Open a realm, as openRealm in realm/realm.js. `base` is the realm's public address, ending in "/".
    The secret phrase is `words`, or is kept in `secret_file` (made on first run, default
    `.data/realm-secret.txt`). What it must remember is kept in `data_file` (default
    `.data/realm-data.json`), or in `store`."""
    if (not words and not secret_file) or (not store and not data_file):
        os.makedirs(".data", exist_ok=True)
    words = words or _secret_words(secret_file or ".data/realm-secret.txt")
    signer = signer_from_words(words)
    store = store or FileStore(data_file or ".data/realm-data.json")
    signin = Path(signin_file) if signin_file else SIGNIN_JS
    if not signin.is_file():
        raise FileNotFoundError(
            f"{signin} is missing: install endlessmind as an editable path dependency from a checkout of "
            "the EveryGame repository, or pass signin_file"
        )
    options = dict(base=base, card=dict(card), portal=portal, now=now, is_burned=is_burned, on_record=on_record)
    realm = Realm(options, signer, store, store.load() or {}, signin)
    realm.sign_card()
    return realm


class Realm:
    def __init__(self, options: dict, signer, store: Store, data: dict, signin: Path = SIGNIN_JS):
        if not options["base"].endswith("/"):
            raise ValueError("base must end with /")
        self.options = options
        self.base = _normalize_base(options["base"])
        self.base_path = urlsplit(self.base).path
        self.portal = options.get("portal") or DEFAULT_PORTAL
        self.signer = signer
        self.id = signer.id
        self.store = store
        self.now: Callable[[], int] = options.get("now") or (lambda: int(time.time() * 1000))
        self.signin = signin
        self.data: dict = {"sessions": {}, "offers": {}, "public": [], "records": [], "burned": {}, "players": {}, **data}
        self.card: dict | None = None
        self._joins: dict[str, dict] = {}
        self._claims: dict[str, dict] = {}
        self._nonces: dict[str, int] = {}  # sign-in note nonces seen recently, with when they can be forgotten

    def sign_card(self) -> None:
        """Sign a fresh realm card."""
        text = self.options["card"]
        card = {
            "v": 1,
            "type": "card",
            "signers": [self.id],
            "time": self.now(),
            "name": text["name"],
            "description": text["description"],
            **({"picture": text["picture"]} if text.get("picture") else {}),
            **({"tags": text["tags"]} if text.get("tags") else {}),
            "play": [self.base],
            "list": self.base + "endlessmind-list.json",
        }
        self.card = add_signature(card, self.signer)

    def list(self) -> dict:
        """The realm's public list: its complete records marked public."""
        return {"v": 1, "type": "list", "realm": self.id, "records": self.data["public"]}

    async def handle(self, method: str, path: str, headers: Headers = None, body: bytes = b"") -> Response | None:
        """Answer the requests this library owns, or return None to let the game answer. `path` is the
        request's path as sent (percent-encoded), with or without its query string."""
        pathname, _, query = path.partition("?")
        if not pathname.startswith(self.base_path):
            return None
        sub = pathname[len(self.base_path) :]
        params = parse_qsl(query, keep_blank_values=True)
        method = method.upper()
        get = method in ("GET", "HEAD")
        post = method == "POST"
        if get and sub == "endlessmind-card.json":
            return _json(self.card, 200, {"access-control-allow-origin": "*"})
        if get and sub == "endlessmind-list.json":
            return _json(self.list(), 200, {"access-control-allow-origin": "*"})
        if get and sub == "endlessmind/signin.js":
            return Response(200, {"content-type": "text/javascript; charset=utf-8"}, self.signin.read_bytes())
        if get and sub == "endlessmind/me":
            return _json(await self._me(headers))
        if post and sub == "endlessmind/start":
            return _json(await self._start_join(headers, any(k == "rename" for k, _ in params)))
        if post and sub == "endlessmind/claim":
            return await self._start_claim(headers)
        if post and sub == "endlessmind/restore":
            return await self._start_restore(headers)
        if post and sub == "endlessmind/signout":
            return self._sign_out(headers)
        m = re.fullmatch(r"endlessmind/wait/([A-Za-z0-9]+)", sub)
        if get and m:
            token = next((v for k, v in params if k == "token"), "")
            return self._wait(m[1].upper(), token)
        m = re.fullmatch(r"join/([A-Za-z0-9]+)", sub)
        if get and m:
            return _redirect(self._portal_link(self.join_address(m[1].upper())))
        if post and m:
            return await self._join_post(m[1].upper(), headers, body)
        m = re.fullmatch(r"claim/([A-Za-z0-9]+)", sub)
        if get and m:
            return self._claim_get(m[1].upper())
        if post and m:
            return await self._claim_post(m[1].upper(), headers, body)
        return None

    async def player(self, request: Any) -> str | None:
        """The signed-in player's ID, or None for a guest. `request` is anything with the request's
        headers: a Starlette or FastAPI request, an ASGI scope, a headers mapping, or the Cookie header."""
        session = self.data["sessions"].get(_cookie(request, COOKIE) or "")
        if not session or self.now() - session["created"] > SESSION_MS:
            return None
        if await self.is_burned(session["player"]):
            return None
        return session["player"]

    async def offer(self, player: str, items: Iterable[Mapping[str, Any]]) -> None:
        """Propose records for a player to claim. The realm signs each one after the player has."""
        offers = self.data["offers"].setdefault(player, [])
        for item in items:
            text, data = item.get("text"), item.get("data")
            if not isinstance(text, str) or _u16len(text) > 1000:
                raise ValueError("a record's text must be at most 1000 characters")
            offers.append(
                {"v": 1, "type": "record", "signers": [self.id, player], "time": self.now(), "text": text, **({"data": data} if data else {})}
            )
        self._save()

    def public_records(self, player: str) -> list[dict]:
        """The complete public records this realm has signed together with the player, oldest first."""
        return [r for r in self.data["public"] if player in r["signers"]]

    def records(self, player: str) -> list[dict]:
        """Every complete record this realm has signed together with the player, public and private,
        oldest first. Private ones are never listed; they are kept so the player can get them back."""
        kept = self.data["records"]
        all_ = kept + [r for r in self.data["public"] if not any(r is k for k in kept)]
        seen, out = set(), []
        for r in all_:
            key = canonical(r)
            if player not in r["signers"] or key in seen:
                continue
            seen.add(key)
            out.append(r)
        return out

    def player_name(self, id: str) -> str:
        """The name the player chose in their EntryPortal, as of their latest sign-in here, or their
        starting name. Names are not unique and prove nothing; show them, but key everything by the ID."""
        return (self.data["players"].get(id) or {}).get("name") or default_name(id)

    async def is_burned(self, id: str) -> bool:
        if id in self.data["burned"]:
            return True
        check = self.options.get("is_burned")
        if not check:
            return False
        result = check(id)
        if inspect.isawaitable(result):
            result = await result
        return bool(result)

    def join_address(self, code: str) -> str:
        return f"{self.base}join/{code}"

    def claim_address(self, code: str) -> str:
        return f"{self.base}claim/{code}"

    # ---- signing in ----

    async def _start_join(self, headers: Headers, rename: bool) -> dict:
        """A one-time join code for the page to show. With `rename`, a signed-in player wants to change
        their name: the code opens their own EntryPortal with the name box."""
        self._forget_old()
        code = self._new_code()
        token = secrets.token_hex(16)
        self._joins[code] = {"token": token, "created": self.now()}
        address = self.join_address(code)
        player = await self.player(headers) if rename else None
        portal = (player and (self.data["players"].get(player) or {}).get("portal")) or self.portal
        link = self._portal_link(address, portal) + ("&rename" if rename else "")
        return {"code": code, "token": token, "address": address, "link": link, "typed": _typed(address), "qr": qr_svg(link), "expires": self.now() + JOIN_MS}

    async def _join_post(self, code: str, headers: Headers, body: bytes) -> Response:
        form = _read_form(headers, body)
        if form is None:
            return self._page("Too large", "That request was too large.", 413)
        burn = form.get("burn")
        if isinstance(burn, str):
            return await self._burn_post(burn)
        text = form.get("enter")
        if not isinstance(text, str):
            return self._page("Nothing to do", "This address expects a sign-in note.", 400)
        problem = await self._check_note(code, text)
        if problem:
            return self._page("Not signed in", problem, 400)
        # The device that made the note may play too: give its browser a session of its own.
        session = self._new_session(self._joins[code]["player"])
        return self._page(
            "You're in",
            "You're in. If the game is open on another screen, it is signed in there too, and you can close this page.",
            200,
            {"href": self.base, "text": f"Play {self.card['name']} here"},
            {"set-cookie": self._cookie(session, SESSION_MS)},
        )

    async def _check_note(self, code: str, text: str) -> str:
        """Check a sign-in note for a join code, and let in the screen waiting on it. Returns a problem, or ""."""
        now = self.now()
        if _u16len(text) > MAX_SIGNED:
            return "The sign-in note is too large."
        try:
            note = parse_json(text)
        except ValueError:
            return "The sign-in note is not readable."
        if not isinstance(note, dict) or not _is_one(note.get("v")) or note.get("type") != "enter" or not is_id(note.get("player")):
            return "The sign-in note is not readable."
        join = self._joins.get(code)
        address = note.get("address")
        if not isinstance(address, str) or address.lower() != self.join_address(code).lower():
            return "This sign-in note was made for a different address."
        if not join or join.get("player") or now - join["created"] > JOIN_MS:
            return "This sign-in code has expired or was already used. Ask your screen for a new one."
        t = note.get("time")
        if not _safe_int(t) or abs(t - now) > CLOCK_MS:
            return "The time on your device and on this realm differ by more than two minutes."
        nonce = note.get("nonce")
        if not isinstance(nonce, str) or _u16len(nonce) < 16 or _u16len(nonce) > 64:
            return "The sign-in note is not readable."
        if nonce in self._nonces:
            return "This sign-in note was already used."
        if note["player"] not in valid_signers(note):
            return "The sign-in note's proof does not check out."
        if await self.is_burned(note["player"]):
            return "That player ID has been burned, so it cannot be used here."
        self._nonces[nonce] = now + 2 * CLOCK_MS
        join["player"] = note["player"]
        portal = note.get("portal")
        portal = portal if isinstance(portal, str) and re.match(r"https?://", portal) else None
        name = tidy_name(note.get("name"))
        self.data["players"][note["player"]] = {**({"portal": portal} if portal else {}), **({"name": name} if name else {}), "seen": now}
        self._save()
        return ""

    def _wait(self, code: str, token: str) -> Response:
        join = self._joins.get(code)
        if join and join["token"] == token:
            if join.get("player") and not join.get("taken"):
                join["taken"] = True
                session = self._new_session(join["player"])
                return _json({"state": "in", "player": join["player"]}, 200, {"set-cookie": self._cookie(session, SESSION_MS)})
            if join.get("taken"):
                return _json({"state": "in", "player": join["player"]})
            return _json({"state": "expired" if self.now() - join["created"] > JOIN_MS else "waiting"})
        claim = self._claims.get(code)
        if claim and claim["token"] == token:
            if claim.get("done") is not None:
                return _json({"state": "claimed", "count": claim["done"]})
            return _json({"state": "expired" if self.now() - claim["created"] > CLAIM_MS else "waiting"})
        return _json({"state": "unknown"}, 404)

    async def _me(self, headers: Headers) -> dict:
        player = await self.player(headers)
        return {
            "realm": self.id,
            "name": self.card["name"],
            "player": player,
            "playerName": self.player_name(player) if player else None,
            "portal": (player and (self.data["players"].get(player) or {}).get("portal")) or self.portal,
            "claims": len(self.data["offers"].get(player) or []) if player else 0,
            "records": len(self.records(player)) if player else 0,
        }

    def _sign_out(self, headers: Headers) -> Response:
        self.data["sessions"].pop(_cookie(headers, COOKIE) or "", None)
        self._save()
        return _json({"ok": True}, 200, {"set-cookie": self._cookie("", 0)})

    # ---- claiming records ----

    async def _start_claim(self, headers: Headers) -> Response:
        player = await self.player(headers)
        if not player:
            return _json({"error": "not signed in"}, 401)
        records = self.data["offers"].get(player) or []
        if not records:
            return _json({"error": "nothing to claim"}, 400)
        return self._new_claim(player, list(records), False)

    async def _start_restore(self, headers: Headers) -> Response:
        """"Get my records back": a one-time code that hands the signed-in player every record this realm
        holds for them, through their EntryPortal, the same way finished claims are handed back."""
        player = await self.player(headers)
        if not player:
            return _json({"error": "not signed in"}, 401)
        records = self.records(player)
        if not records:
            return _json({"error": "no records"}, 400)
        return self._new_claim(player, records, True)

    def _new_claim(self, player: str, records: list, restore: bool) -> Response:
        self._forget_old()
        code = self._new_code()
        token = secrets.token_hex(16)
        self._claims[code] = {"token": token, "created": self.now(), "player": player, "records": records, **({"restore": True} if restore else {})}
        address = self.claim_address(code)
        return _json({"code": code, "token": token, "address": address, "link": address, "typed": _typed(address), "qr": qr_svg(address), "count": len(records), "expires": self.now() + CLAIM_MS})

    def _claim_get(self, code: str) -> Response:
        claim = self._claims.get(code)
        if not claim or claim.get("done") is not None or self.now() - claim["created"] > CLAIM_MS:
            return self._page("Expired", "This code has expired or was already used. Ask your screen for a new one.", 410)
        portal = (self.data["players"].get(claim["player"]) or {}).get("portal", self.portal)
        if claim.get("restore"):
            # Complete records to keep: no `return`, since there is nothing to sign.
            claim["done"] = len(claim["records"])
            return _redirect(portal + "#sign=" + _encode(to_json({"records": claim["records"], "back": self.base})))
        return _redirect(portal + "#sign=" + _encode(to_json({"return": self.claim_address(code), "records": claim["records"]})))

    async def _claim_post(self, code: str, headers: Headers, body: bytes) -> Response:
        claim = self._claims.get(code)
        if not claim or claim.get("done") is not None or self.now() - claim["created"] > CLAIM_MS:
            return self._page("Expired", "This claim code has expired or was already used. Ask your screen for a new one.", 410)
        form = _read_form(headers, body)
        try:
            raw = (form or {}).get("records")
            returned = parse_json("null" if raw is None else raw)
        except ValueError:
            returned = None
        if not isinstance(returned, list):
            return self._page("Not readable", "The records sent back were not readable.", 400)
        completed = [done for done in (self._countersign(claim, r) for r in returned) if done]
        # Proposals the player did not sign are dropped: players keep the records they want.
        offered = {_proposal_key(r) for r in claim["records"]}
        player = claim["player"]
        self.data["offers"][player] = [r for r in self.data["offers"].get(player) or [] if _proposal_key(r) not in offered]
        if not self.data["offers"][player]:
            del self.data["offers"][player]
        claim["done"] = len(completed)
        self._save()
        on_record = self.options.get("on_record")
        for record in completed:
            if on_record:
                on_record(record)
        if not completed:
            return self._page("Nothing signed", "No records were signed. Go back to your screen.")
        portal = (self.data["players"].get(player) or {}).get("portal", self.portal)
        # `back` lets the EntryPortal offer a way back to the game, for a player who claimed on this device.
        return _redirect(portal + "#sign=" + _encode(to_json({"records": completed, "back": self.base})))

    def _countersign(self, claim: dict, record: Any) -> dict | None:
        """Sign a record the player sent back, if it is one of the claim's proposals with only `public`
        and `sigs` changed and the player's proof checks out. Returns the complete record, or None."""
        if not isinstance(record, dict):
            return None
        if "public" in record and not isinstance(record["public"], bool):
            return None
        try:
            key = _proposal_key(record)
            if not any(_proposal_key(p) == key for p in claim["records"]):
                return None
            if len(signed_bytes(record)) > MAX_SIGNED:
                return None
        except (ValueError, TypeError):
            return None
        if claim["player"] not in valid_signers(record):
            return None
        body = {k: v for k, v in record.items() if k != "sigs"}
        done = add_signature({**body, "sigs": {claim["player"]: record["sigs"][claim["player"]]}}, self.signer)
        if not is_complete(done):
            return None
        self.data["records"].append(done)
        if done.get("public") is True:
            self.data["public"].append(done)
        return done

    # ---- burning ----

    async def _burn_post(self, text: str) -> Response:
        try:
            notice = parse_json(text)
            if not isinstance(notice, dict) or not _is_one(notice.get("v")) or notice.get("type") != "burn":
                raise ValueError
            if isinstance(notice.get("key"), str):
                id = signer_from_private_key(from_base64url(notice["key"])).id
            elif isinstance(notice.get("words"), str):
                id = signer_from_words(notice["words"]).id
            else:
                raise ValueError
        except (ValueError, TypeError):
            return self._page("Not readable", "That burn notice is not readable.", 400)
        if id not in self.data["players"] and not any(id in r["signers"] for r in self.data["public"]):
            return self._page("Unknown here", "This realm has never seen that player ID, so nothing changed.")
        await self.burn(id, notice)
        return self._page("Burned", "Noted: that player ID is burned here, and nothing signed by it counts any more.")

    async def burn(self, id: str, notice: Any) -> None:
        """Treat an ID as gone: end its sessions, drop its offers and public records, and refuse it from
        now on. Call this for notices learned elsewhere, such as from a board."""
        self.data["burned"][id] = notice
        for token, session in list(self.data["sessions"].items()):
            if session["player"] == id:
                del self.data["sessions"][token]
        self.data["offers"].pop(id, None)
        self.data["public"] = [r for r in self.data["public"] if id not in r["signers"]]
        self.data["records"] = [r for r in self.data["records"] if id not in r["signers"]]
        self._save()

    # ---- helpers ----

    def _new_code(self) -> str:
        while True:
            code = "".join(CODE_CHARS[b & 31] for b in os.urandom(6))
            if code not in self._joins and code not in self._claims:
                return code

    def _forget_old(self) -> None:
        now = self.now()
        self._joins = {c: j for c, j in self._joins.items() if now - j["created"] <= 2 * JOIN_MS}
        self._claims = {c: j for c, j in self._claims.items() if now - j["created"] <= 2 * CLAIM_MS}
        self._nonces = {n: until for n, until in self._nonces.items() if now <= until}

    def _portal_link(self, address: str, portal: str | None = None) -> str:
        return (portal or self.portal) + "#url=" + _encode(address)

    def _cookie(self, value: str, ms: int) -> str:
        secure = "; Secure" if self.base.startswith("https:") else ""
        return f"{COOKIE}={value}; Path={self.base_path}; Max-Age={ms // 1000}; HttpOnly; SameSite=Lax{secure}"

    def _new_session(self, player: str) -> str:
        """A new session for a player, kept until it expires or they sign out."""
        session = secrets.token_hex(24)
        self.data["sessions"][session] = {"player": player, "created": self.now()}
        self._save()
        return session

    def _page(self, title: str, message: str, status: int = 200, link: dict | None = None, headers: dict | None = None) -> Response:
        """A small page for the browser that sent a form here."""
        name = _escape(self.card["name"])
        link = link or {"href": "", "text": ""}
        button = (
            f'<p><a href="{_escape(link["href"])}" style="display:inline-block;padding:.6rem 1.1rem;border-radius:10px;background:#5b3fd0;color:#fff;text-decoration:none">{_escape(link["text"])}</a></p>'
            if link["href"]
            else ""
        )
        body = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_escape(title)} | {name}</title><style>body{{font:20px/1.5 system-ui,sans-serif;max-width:30rem;margin:3rem auto;padding:0 1rem}}</style></head>
<body><h1>{_escape(title)}</h1><p>{_escape(message)}</p>{button}<p><small>{name}</small></p></body></html>"""
        return Response(status, {"content-type": "text/html; charset=utf-8", **(headers or {})}, body.encode("utf-8"))

    def _save(self) -> None:
        self.store.save(copy.deepcopy(self.data))


class FileStore:
    """Keep the realm's data in a JSON file, in the same format as realm/realm.js."""

    def __init__(self, path: str | os.PathLike):
        self.path = str(path)

    def load(self) -> Any:
        try:
            with open(self.path, encoding="utf-8") as f:
                return parse_json(f.read())
        except FileNotFoundError:
            return None

    def save(self, data: Any) -> None:
        with open(self.path + ".new", "w", encoding="utf-8") as f:
            f.write(to_json(data))
        os.replace(self.path + ".new", self.path)


class MemoryStore:
    """Keep the realm's data in memory only, for tests."""

    def __init__(self) -> None:
        self.saved = "null"

    def load(self) -> Any:
        return parse_json(self.saved)

    def save(self, data: Any) -> None:
        self.saved = to_json(data)


def file_store(path: str | os.PathLike) -> FileStore:
    return FileStore(path)


def memory_store() -> MemoryStore:
    return MemoryStore()


def _secret_words(path: str | os.PathLike) -> str:
    """The realm's secret phrase from a file, made on first run."""
    try:
        with open(path, encoding="utf-8") as f:
            return check_words(f.read())
    except FileNotFoundError:
        pass
    words = new_words()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(words + "\n")
    print(f"Made a new secret phrase for this realm in {path}. Keep a copy somewhere safe: it is the realm's identity.")
    return words


def _proposal_key(record: dict) -> str:
    """What identifies a proposal: everything except `public` and `sigs`."""
    return canonical({k: v for k, v in record.items() if k not in ("public", "sigs")})


def _read_form(headers: Headers, body: bytes) -> dict[str, Any] | None:
    """The fields of a form POST (first value of each), {} if it is not a form, or None if too large."""
    try:
        length = int(_header(headers, "content-length") or 0)
    except ValueError:
        length = 0
    if length > MAX_BODY or len(body) > MAX_BODY:
        return None
    ctype = _header(headers, "content-type") or ""
    kind = ctype.split(";")[0].strip().lower()
    form: dict[str, Any] = {}
    if kind == "application/x-www-form-urlencoded":
        for k, v in parse_qsl(body.decode("utf-8", "replace"), keep_blank_values=True):
            form.setdefault(k, v)
    elif kind == "multipart/form-data":
        message = email.parser.BytesParser(policy=email.policy.HTTP).parsebytes(
            b"Content-Type: " + ctype.encode("latin-1", "replace") + b"\r\n\r\n" + body
        )
        if message.is_multipart():
            for part in message.iter_parts():
                name = part.get_param("name", header="content-disposition")
                if not name or name in form:
                    continue
                payload = part.get_payload(decode=True) or b""
                # A file upload is not text, as in the JavaScript version.
                form[name] = None if part.get_filename() else payload.decode("utf-8", "replace")
    return form


def _header(headers: Any, name: str) -> str | None:
    """One header from a mapping, a list of pairs, an ASGI scope, or an object with `.headers`."""
    if headers is None:
        return None
    if isinstance(headers, Mapping) and headers.get("type") in ("http", "websocket") and "headers" in headers:
        headers = headers["headers"]  # an ASGI scope
    elif not isinstance(headers, (Mapping, list, tuple)) and hasattr(headers, "headers"):
        headers = headers.headers
    items = headers.items() if isinstance(headers, Mapping) or hasattr(headers, "items") else headers
    for k, v in items:
        k = k.decode("latin-1") if isinstance(k, bytes) else str(k)
        if k.lower() == name:
            return v.decode("latin-1") if isinstance(v, bytes) else str(v)
    return None


def _cookie(request: Any, name: str) -> str | None:
    raw = request if isinstance(request, str) else _header(request, "cookie")
    for part in (raw or "").split(";"):
        k, *v = part.strip().split("=")
        if k == name:
            return "=".join(v)
    return None


def _normalize_base(base: str) -> str:
    """The address as JavaScript's new URL(base).href writes it, for ordinary web addresses."""
    u = urlsplit(base)
    scheme, host = u.scheme.lower(), (u.hostname or "").lower()
    port = u.port
    if port is not None and not (scheme, port) in (("http", 80), ("https", 443)):
        host += f":{port}"
    return f"{scheme}://{host}{u.path or '/'}" + (f"?{u.query}" if u.query else "")


def _typed(address: str) -> str:
    """The address as a person would type it: https is assumed, so it is left out."""
    return re.sub(r"^https://", "", address)


def _encode(text: str) -> str:
    """encodeURIComponent."""
    return quote(text, safe="!'()*")


def _u16len(text: str) -> int:
    """A string's length as JavaScript counts it."""
    return len(text.encode("utf-16-le", "surrogatepass")) // 2


def _safe_int(value: Any) -> bool:
    """Number.isSafeInteger."""
    if isinstance(value, bool):
        return False
    if isinstance(value, float):
        return value.is_integer() and abs(value) <= MAX_SAFE
    return isinstance(value, int) and abs(value) <= MAX_SAFE


def _is_one(value: Any) -> bool:
    return _safe_int(value) and value == 1


def _json(value: Any, status: int = 200, headers: dict | None = None) -> Response:
    return Response(
        status,
        {"content-type": "application/json; charset=utf-8", "cache-control": "no-store", **(headers or {})},
        to_json(value).encode("utf-8"),
    )


def _redirect(location: str) -> Response:
    return Response(303, {"location": location, "cache-control": "no-store"})


def _escape(text: Any) -> str:
    return re.sub(r'[&<>"]', lambda m: f"&#{ord(m.group())};", str(text))
