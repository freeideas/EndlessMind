# Deploying play.endlessmind.com

The public helper server runs on `ordinarydata.com` from the checkout at `~/Desktop/prjx/EveryGame`, as the systemd unit in `endlessmind-hub.service`, behind the Caddy site block in `Caddyfile.snippet`. It is one helper server among any number; nothing depends on it.

To deploy a new version: `ssh ace@ordinarydata.com`, then in the checkout `git pull --ff-only && sudo systemctl restart endlessmind-hub`.

First setup (already done): copy the unit to `/etc/systemd/system/` and run `sudo systemctl enable --now endlessmind-hub`; add the snippet to `/etc/caddy/Caddyfile`, then `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`.

The server keeps its data in `data/` inside the checkout. Logs: `journalctl -u endlessmind-hub`.

## Example realms hosted from qube

The Mac mini `qube` (behind a home router, needing only outgoing connections) keeps both example realms up with the host program, as the launchd agents `com.endlessmind.host.*.plist`. Each start pulls the checkout at `~/EndlessMind` (not under `~/Desktop`, which macOS hides from background jobs), so restarting one publishes the latest version. The Listening Well's OpenRouter key is read from `~/creds` at start. Realm keys stay in that checkout's `keys/`, and losing them changes the realms' links.

Install or update: copy the plists to `~/Library/LaunchAgents/`, then `launchctl bootout gui/$(id -u)/<label>` (if loaded) and `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/<label>.plist`. Logs: `/tmp/endlessmind-<realm>.log`.
