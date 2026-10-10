# Deploying endlessmind.com

`site/` is published to `~/domains/endlessmind.com/` and `portal/` to `~/domains/portal.endlessmind.com/` on ordinarydata, which Caddy serves for those names: in the checkout there (`~/Desktop/prjx/EveryGame`), `git pull --ff-only && uv run deploy/site.py`. It also writes `docs/` from `specs/`. See `site/README.md` and `portal/README.md`.

The example realm, Endless Maze, runs at `https://maze.endlessmind.com/` as the systemd unit in [endless-maze.service](endless-maze.service), which says how to install it; after `git pull --ff-only`, `sudo systemctl restart endless-maze`. `garden.endlessmind.com` forwards there. DNS for endlessmind.com is on Cloudflare.

## The relay

A relay runs at `https://relay.endlessmind.com/` as the systemd unit in [endless-relay.service](endless-relay.service); a game run with `--relay https://relay.endlessmind.com/` is played at `https://<realm ID>.relay.endlessmind.com/`. After `git pull --ff-only`, `sudo systemctl restart endless-relay`; games reconnect by themselves.

- **Names.** Cloudflare has two records, `relay.endlessmind.com` and `*.relay.endlessmind.com`, both pointing straight at ordinarydata.
- **Certificate.** One certificate covers both names, so a new game never waits for one. Certbot gets and renews it by proving control of the names through Cloudflare, with the token in `/etc/letsencrypt/cloudflare.ini` (`certbot certonly --dns-cloudflare --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini --cert-name relay.endlessmind.com -d relay.endlessmind.com -d '*.relay.endlessmind.com'`). After each renewal, [relay-certificate-hook.sh](relay-certificate-hook.sh), installed as `/etc/letsencrypt/renewal-hooks/deploy/endless-relay.sh`, copies it to `/etc/caddy/certs/` and reloads Caddy.
- **Caddy.** A site of its own in `/etc/caddy/Caddyfile` for the two names uses that certificate and passes everything to `127.0.0.1:8790`.

The maze's secret phrase, its realm identity, exists only in `examples/maze/.data/realm-secret.txt` in the checkout on ordinarydata (ignored by Git); copy it somewhere safe if the realm should outlive that machine.
