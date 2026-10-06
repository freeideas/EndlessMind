# Deploying endlessmind.com

`site/` is published to `~/domains/endlessmind.com/` on ordinarydata, which Caddy already serves for that name: in the checkout there (`~/Desktop/prjx/EveryGame`), `git pull --ff-only && uv run deploy/site.py`. It also writes `docs/` from `specs/`. See `site/README.md`.
