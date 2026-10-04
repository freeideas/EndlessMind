# Running the server and app

## On one computer

1. Install Deno: `brew install deno` (macOS, Linux) or `winget install DenoLand.Deno` (Windows).
2. In this repository, run `deno task start`. Options: `--port 8000`, `--hostname 0.0.0.0`, `--cert cert.pem --key key.pem`, `--origin <address>[,<address>]`. The server may read files only inside this folder, so keep certificate files here.
3. Open `http://localhost:8000/`. To try two players on one computer, use two different browsers (or one normal and one private window), since each browser profile keeps its own character.

The server keeps announcements and uploaded realm files in `./data`. Delete that folder to start fresh.

**The server must know its own address.** A player proves a key to a server by signing that server's name, and the server refuses a proof made under a name it does not go by (otherwise a dishonest server could pass a proof on). It knows `localhost` and this computer's network addresses by itself. For any other address (a tunnel, a domain name, a private network name), start it with `--origin https://<that address>`; several are separated by commas. If someone reaches it under an unknown name, the server prints the option to add.

## On several devices

Browsers allow the key functions Endless Mind uses only on **https** addresses or on **localhost**. A plain `http://192.168.x.x:8000` address works for loading the page, but the app will say it needs a secure connection. Pick one way to get https:

1. **A quick tunnel (easiest).** `brew install cloudflared` (or `winget install Cloudflare.cloudflared`), then, with the server running, `cloudflared tunnel --url http://localhost:8000`. It prints an `https://....trycloudflare.com` address that works from any device, even over mobile data. Restart the server with `--origin https://....trycloudflare.com` so it knows that address. Traffic passes through Cloudflare's servers, and the address changes each time.
2. **Your own private network.** With Tailscale (`brew install tailscale`) on your devices, `tailscale serve 8000` gives the server an https address reachable only from your own devices.
3. **A local certificate.** `brew install mkcert`, `mkcert -install`, then `mkcert <your computer's address> localhost` and `deno task start --cert <file>.pem --key <file>-key.pem`. Each other device must be told to trust mkcert's root certificate (`mkcert -CAROOT` shows where it is), which is fiddly on phones.
4. **A real server.** Run it on any always-on machine with a domain name, behind a web server that handles https automatically (Caddy does this with one line of configuration).

## Hosting a realm

Under **Your realms**, choose **Start hosting** to make this tab its referee. Opening a realm only visits it, even when you own it. **Stop hosting** ends the referee; navigating to another realm does not. Keep that tab open and in front: phones pause background tabs almost at once, and desktop browsers slow them down. Other players wait for its referee while it is closed. Use **Save full backup** and **Load keys** to carry the key, locally held files and committed realm storage to another trusted app. Importing does not publish or start hosting. To move helper servers while keeping the same app, change **Helper server**, then choose **Publish here** or **Start hosting**. A realm is playable while explicit hosting runs in a tab or in the host program (below).

## Hosting without a browser

The host program referees a realm with no browser, so the realm stays up as long as the program runs, for example on an always-on machine. It is also the only way to referee a realm whose rules are private.

- `deno task host --server <web address> --realm <folder>` reads the realm's folder, uploads its public files to that server, announces the realm and referees it, printing its link. The realm's key is kept in `./keys/<folder name>.json` (git ignores `keys/`), or in the file given with `--keys FILE`. Each start reads the folder again and publishes its current files under the same key, so the link stays the same: this is how to publish a new version of a realm. A key file holding one realm belongs to that folder whatever the realm is called, so renaming a realm keeps its address. Only a key file holding several realms is searched by name; there, add `--address <its address>` after renaming.
- `deno task host --server <web address> --keys FILE` hosts a realm straight from a key file, including one saved by the browser app's **Save full backup**: the first realm in it, or the one given with `--address`. This does not work for private rules, which are never in a key file; use `--realm` for those.
- The rules run directly, with no sandbox, and can use the network and read files, so host only realms you wrote or trust.
- Keep key files inside `keys/`: the task may write only there. Whoever has a key file is that realm, so keep it like a password.
- If another host explicitly starts on the same helper server, the most recent connection wins and the previous host stops. Different servers can host conflicting copies; copying a key copies its authority.

To try the [listening well](examples/listening-well.md), with a server running: `deno task host --server http://localhost:8000 --realm examples/listening-well`. Its rules ask an AI model through OpenRouter (a service offering many models, some free) when `OPENROUTER_API_KEY` is set on that machine, and otherwise echo each question back. `WELL_MODEL` picks the model; the default, `openrouter/free`, uses any model that costs nothing. The key goes only to OpenRouter, never to the helper server or to visitors.

## Tests

- `deno task test`: unit tests for the shared code, the server, the maze's rules and the host program (with a visitor that uses no browser). With `OPENROUTER_API_KEY` set it also runs one live test, in which a real AI model answers through the listening well and the test checks that neither the key nor the rules reach the server or a visitor.
- `deno task check`: type-checks everything (plain JavaScript with type comments).
- `uv run tests/e2e.py [chromium] [firefox] [webkit]`: opens two real browsers, publishes the maze from one, joins from the other, and checks that each sees the other move. It also checks explicit hosting and takeover, guest reconnection after a host restart, sandbox restrictions, cross-server visits from a stable app origin, offline exports, binary backup restoration, realm storage, expired announcements, cancelled navigation, and the listening well run by the host program. Needs `uv` (`brew install uv`); the first run for firefox or webkit needs `uv run --with playwright playwright install firefox webkit`.

## If something does not connect

- **Device clocks.** Each device ignores messages stamped more than 10 minutes away from its own clock (this blocks replayed messages). Make sure every device sets its time automatically.
- **Starting fresh.** Delete `./data` on the server, and in the browser clear this site's data. Clearing site data deletes your keys (your character and the realms you published) unless you saved them with **Save my keys**.

## Local files, saved data and backups

**Save my keys** always exports locally held identity keys and manifests, without fetching anything. **Save full backup** adds locally held original file bytes and data that realm rules committed through `storage`. Neither operation needs a server. Old browser records may lack their original files; **Publish here** or **Start hosting** retrieves missing files once from the chosen server and keeps a local copy. Keys-only imports likewise need the files before they can host. A full backup reports missing local files instead of silently omitting them; keys-only export remains available. The new `emind-keys/1` JSON format base64-encodes files; older `emind-keys/0` text backups remain readable. Loading storage merges the keys present in the backup into that realm's local storage.

The host saves realm data beside its key file as `<key-file>.<realm-address>.state.json`. Rules choose what to save and when; the platform does not automatically save live game state. To export keys, public files and committed data together, run `deno task host --keys keys/my-realm.json --backup keys/my-realm-backup.json`. Stop the realm first if you need a fixed point across several storage values. Private rules still need their original folder. An existing local state file takes precedence over imported initial data.

## Helper server budgets

Defaults are 256 MB across at most 10,000 stored files, 32 MB of files per realm, 1,000 announcements and key-free releases together, 256 WebSocket connections, and per connection 1,000 incoming messages and 4 MB per second. Set `--max-storage-mb`, `--max-files`, `--max-realm-mb`, `--max-announcements`, `--max-connections`, `--messages-per-second` or `--bytes-per-second` when starting the server. At most 16 HTTP writes are processed concurrently, and a connection can hold at most 64 claims plus outstanding challenges. A sender over its traffic limit has its messages dropped and is told; a receiver with over 4 MB queued misses messages but is never disconnected, so flooding a realm cannot knock it off the server. A file is stored only while a live announcement or release lists it, and is deleted within the hour once none does. Duplicate files do not consume the disk quota twice. Existing disk usage is counted on startup. These are per-server resource budgets, not restrictions on realm behavior, and do not replace an operator's network-level traffic controls.
