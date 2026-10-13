# Deploying endlessmind.com

`site/` is published to `~/domains/endlessmind.com/` and `portal/` to `~/domains/portal.endlessmind.com/` on ordinarydata, which Caddy serves for those names: in the checkout there (`~/Desktop/prjx/EveryGame`), `git pull --ff-only && uv run deploy/site.py`. It also writes `docs/` from `specs/`. See `site/README.md` and `portal/README.md`.

DNS for endlessmind.com is on Cloudflare.

## The host

One host runs at `https://relay.endlessmind.com/` as the systemd unit in [endless-host.service](endless-host.service), which says how to install it. After `git pull --ff-only`, `sudo systemctl restart endless-host`; relayed games reconnect by themselves.

| Name                                | What is there                                              |
| ----------------------------------- | ---------------------------------------------------------- |
| `relay.endlessmind.com`             | Endless Maze, the resident game                            |
| `eportal.relay.endlessmind.com`     | An EntryPortal                                             |
| `<ID>.relay.endlessmind.com`        | Each game run somewhere with `--relay` and this address    |

- **Names.** Cloudflare has two records, `relay.endlessmind.com` and `*.relay.endlessmind.com`, both pointing straight at ordinarydata. `maze.endlessmind.com` and `garden.endlessmind.com` forward to the host.
- **Certificate.** One certificate covers both names, so a new game never waits for one. Certbot gets and renews it by proving control of the names through Cloudflare, with the token in `/etc/letsencrypt/cloudflare.ini` (`certbot certonly --dns-cloudflare --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini --cert-name relay.endlessmind.com -d relay.endlessmind.com -d '*.relay.endlessmind.com'`). After each renewal, [relay-certificate-hook.sh](relay-certificate-hook.sh), installed as `/etc/letsencrypt/renewal-hooks/deploy/endless-relay.sh`, copies it to `/etc/caddy/certs/` and reloads Caddy.
- **Caddy.** A site of its own in `/etc/caddy/Caddyfile` for the two names uses that certificate and passes everything to `127.0.0.1:8790`.
- **What to keep.** The maze's secret phrase, its realm identity, exists only in `examples/maze/.data/realm-secret.txt` in the checkout on ordinarydata (ignored by Git). The host's own data is in `.endlessmind/` there. Copy the phrase somewhere safe if the realm should outlive that machine.
