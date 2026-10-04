# Running the server and app

## On one computer

1. Install Deno: `brew install deno` (macOS, Linux) or `winget install DenoLand.Deno` (Windows).
2. In this repository, run `deno task start`. Options: `--port 8000`, `--hostname 0.0.0.0`, `--data ./data`, `--cert cert.pem --key key.pem`.
3. Open `http://localhost:8000/`. To try two players on one computer, use two different browsers (or one normal and one private window), since each browser profile keeps its own character.

The server keeps announcements and uploaded realm files in `./data`. Delete that folder to start fresh.

## On several devices

Browsers allow the key functions EveryGame uses only on **https** addresses or on **localhost**. A plain `http://192.168.x.x:8000` address works for loading the page, but the app will say it needs a secure connection. Pick one way to get https:

1. **A quick tunnel (easiest).** `brew install cloudflared` (or `winget install Cloudflare.cloudflared`), then, with the server running, `cloudflared tunnel --url http://localhost:8000`. It prints an `https://....trycloudflare.com` address that works from any device, even over mobile data. Traffic passes through Cloudflare's servers, and the address changes each time.
2. **Your own private network.** With Tailscale (`brew install tailscale`) on your devices, `tailscale serve 8000` gives the server an https address reachable only from your own devices.
3. **A local certificate.** `brew install mkcert`, `mkcert -install`, then `mkcert <your computer's address> localhost` and `deno task start --cert <file>.pem --key <file>-key.pem`. Each other device must be told to trust mkcert's root certificate (`mkcert -CAROOT` shows where it is), which is fiddly on phones.
4. **A real server.** Run it on any always-on machine with a domain name, behind a web server that handles https automatically (Caddy does this with one line of configuration).

## Hosting a realm

The browser tab that published a realm holds its key and is its referee. Keep that tab open and in front: phones pause background tabs almost at once, and desktop browsers slow them down. Other players see "the referee is not online" while it is closed. Always-on hosting (a headless runner holding a signed hosting permission) comes later; see [DESIGN.md](DESIGN.md).

## Tests

- `deno task test`: unit tests for the shared code, the server and the example realm's rules.
- `deno task check`: type-checks everything (plain JavaScript with type comments).
- `uv run tests/e2e.py [chromium] [firefox] [webkit]`: opens two real browsers, publishes the maze from one, joins from the other, and checks that each sees the other move. Needs `uv` (`brew install uv`); the first run for firefox or webkit needs `uv run --with playwright playwright install firefox webkit`.
