# Deploying endlessmind.com

`site/` is published to `~/domains/endlessmind.com/` on ordinarydata, which Caddy already serves for that name: in the checkout there (`~/Desktop/prjx/EveryGame`), `git pull --ff-only && uv run deploy/site.py`. It also writes `docs/` from `specs/`. See `site/README.md`.

The example realm runs at `https://garden.endlessmind.com/` as the systemd unit in [lantern-garden.service](lantern-garden.service), which says how to install it; after `git pull --ff-only`, `sudo systemctl restart lantern-garden`. DNS for endlessmind.com is on Cloudflare.
