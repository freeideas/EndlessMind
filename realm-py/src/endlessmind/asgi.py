"""A thin ASGI adapter: put the realm in front of any ASGI app (FastAPI, Starlette, Quart, ...).

    app = FastAPI()
    app.add_middleware(RealmMiddleware, realm=realm)

Requests the realm owns are answered by it; everything else goes on to the app unchanged.
"""

from __future__ import annotations

from typing import Any, Awaitable, Callable
from urllib.parse import quote

from .realm import MAX_BODY, Realm, Response

Scope = dict
Receive = Callable[[], Awaitable[dict]]
Send = Callable[[dict], Awaitable[None]]
_OWNED = ("endlessmind", "join/", "claim/")  # every address the realm answers starts with one of these


class RealmMiddleware:
    def __init__(self, app: Callable[..., Awaitable[None]], realm: Realm):
        self.app = app
        self.realm = realm

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        raw = scope.get("raw_path")
        path = raw.decode("latin-1") if raw else quote(scope["path"])
        base = self.realm.base_path
        if not path.startswith(base) or not path[len(base) :].startswith(_OWNED):
            return await self.app(scope, receive, send)
        # Read the body (only as much as the realm accepts), so it can be handed on if the realm passes.
        body, more = b"", scope["method"] == "POST"
        while more and len(body) <= MAX_BODY:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body += message.get("body", b"")
            more = message.get("more_body", False)
        query = scope.get("query_string", b"").decode("latin-1")
        response = await self.realm.handle(scope["method"], path + ("?" + query if query else ""), scope, body)
        if response is None:
            return await self.app(scope, _replay(body, more, receive), send)
        await send_response(response, send, head=scope["method"] == "HEAD")


async def send_response(response: Response, send: Send, head: bool = False) -> None:
    """Send a realm Response over ASGI."""
    headers = [(k.encode("latin-1"), v.encode("latin-1")) for k, v in response.headers.items()]
    headers.append((b"content-length", str(len(response.body)).encode()))
    await send({"type": "http.response.start", "status": response.status, "headers": headers})
    await send({"type": "http.response.body", "body": b"" if head else response.body})


def _replay(body: bytes, more: bool, receive: Receive) -> Receive:
    sent = False

    async def again() -> dict[str, Any]:
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": body, "more_body": more}
        return await receive()

    return again
