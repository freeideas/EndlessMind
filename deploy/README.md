# Deploying endlessmind.com

`site/` is published to `~/domains/endlessmind.com/` on ordinarydata, which Caddy already serves (with PHP) for that name: in the checkout there, `git pull --ff-only && uv run deploy/site.py`. See `site/README.md`.

The helper servers (play.endlessmind.com and play2.endlessmind.com) and the example realms hosted from qube were shut down on 2026-10-06 for the redesign. Their old data directories and realm keys are still on those machines.
