# Deploying play.endlessmind.com

The public helper server runs on `ordinarydata.com` from the checkout at `~/Desktop/prjx/EveryGame`, as the systemd unit in `endlessmind-hub.service`, behind the Caddy site block in `Caddyfile.snippet`. It is one helper server among any number; nothing depends on it.

To deploy a new version: `ssh ace@ordinarydata.com`, then in the checkout `git pull --ff-only && sudo systemctl restart endlessmind-hub`.

First setup (already done): copy the unit to `/etc/systemd/system/` and run `sudo systemctl enable --now endlessmind-hub`; add the snippet to `/etc/caddy/Caddyfile`, then `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`.

The server keeps its data in `data/` inside the checkout. Logs: `journalctl -u endlessmind-hub`.
