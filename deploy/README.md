# Deploying endlessmind.com

## The website

`site/` is published to `~/domains/endlessmind.com/` on ordinarydata, which Caddy already serves (with PHP) for that name: in the checkout there, `git pull --ff-only && uv run deploy/site.py`. See `site/README.md`.

## The helper server at play.endlessmind.com

The public helper server runs on `ordinarydata.com` from the checkout at `~/Desktop/prjx/EveryGame`, as the systemd unit in `endlessmind-hub.service`, behind the Caddy site block in `Caddyfile.snippet`. It is one helper server among any number; nothing depends on it.

To deploy a new version: `ssh ace@ordinarydata.com`, then in the checkout `git pull --ff-only && sudo systemctl restart endlessmind-hub`.

First setup (already done): copy the unit to `/etc/systemd/system/` and run `sudo systemctl enable --now endlessmind-hub`; add the snippet to `/etc/caddy/Caddyfile`, then `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`.

The server keeps its data in `data/` inside the checkout. Logs: `journalctl -u endlessmind-hub`.

## A second helper server on emeraldslate

`play2.endlessmind.com` is a separate helper server with its own data, for testing realms and actors spread over two servers. It runs on `emeraldslate` as the systemd user unit `endlessmind-hub2.service` (install steps are in the file), listening only on its Tailscale address. Caddy on ordinarydata passes traffic to it (second block in `Caddyfile.snippet`). Deploy a new version there with `git pull --ff-only && systemctl --user restart endlessmind-hub2`.

## Example realms hosted from qube

The Mac mini `qube` (behind a home router, needing only outgoing connections) keeps both example realms up with the host program, as the launchd agents `com.endlessmind.host.*.plist`. Each start pulls the checkout at `~/EndlessMind` (not under `~/Desktop`, which macOS hides from background jobs), so restarting one publishes the latest version. The Listening Well's OpenRouter key is read from `~/creds` at start. Realm keys stay in that checkout's `keys/`, and losing them changes the realms' links.

Install or update: copy the plists to `~/Library/LaunchAgents/`, then `launchctl bootout gui/$(id -u)/<label>` (if loaded) and `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/<label>.plist`. Logs: `/tmp/endlessmind-<realm>.log`.
