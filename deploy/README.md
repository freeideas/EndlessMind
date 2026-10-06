# Deploying endlessmind.com

`site/` is published to `~/domains/endlessmind.com/` and `portal/` to `~/domains/portal.endlessmind.com/` on ordinarydata, which Caddy serves for those names: in the checkout there (`~/Desktop/prjx/EveryGame`), `git pull --ff-only && uv run deploy/site.py`. It also writes `docs/` from `specs/`. See `site/README.md` and `portal/README.md`.

The example realm, Endless Maze, runs at `https://maze.endlessmind.com/` as the systemd unit in [endless-maze.service](endless-maze.service), which says how to install it; after `git pull --ff-only`, `sudo systemctl restart endless-maze`. `garden.endlessmind.com`, the earlier example, now forwards there. DNS for endlessmind.com is on Cloudflare.

The maze's secret phrase, its realm identity, exists only in `examples/maze/data/realm-secret.txt` in the checkout on ordinarydata (ignored by Git); copy it somewhere safe if the realm should outlive that machine.
