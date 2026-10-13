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

## The package

`uv run deploy/package.py` builds everything into `dist/` (ignored by Git) and publishes nothing. The version is `version` in `deno.json`; the pinned Deno is `DENO_VERSION` in the script, and every Deno it downloads is checked against the SHA-256 Deno publishes. Building for Windows compiles its small launcher, so it needs `deno` on the computer that builds.

| File in `dist/`                                  | What it is                                             |
| ------------------------------------------------ | ------------------------------------------------------ |
| `endlessmind-<version>-<target>.tar.gz` / `.zip` | Deno, the repository's code and a launcher, per system |
| `endlessmind_<version>_amd64.deb` / `_arm64.deb` | The same for apt, under `/usr/lib/endlessmind`         |
| `endlessmind.rb`                                 | The Homebrew formula                                   |
| `PKGBUILD`                                       | The Arch package                                       |
| `winget/`                                        | The three winget manifest files                        |

The targets are `macos-arm64`, `macos-x64`, `linux-x64`, `linux-arm64` and `windows-x64`. The formula, `PKGBUILD` and manifest are written when all five are built, and each names its archive's address under `https://github.com/freeideas/EndlessMind/releases/download/v<version>/` and its SHA-256.

To publish a version:

1. Raise `version` in `deno.json`, commit and push, and run `uv run deploy/package.py`.
2. Make a release named `v<version>` on the repository's GitHub page and attach the archives, the `.deb` files, `PKGBUILD` and `endlessmind.rb`.
3. Homebrew: put `endlessmind.rb` as `Formula/endlessmind.rb` in the repository `freeideas/homebrew-tap`.
4. Arch: push `PKGBUILD` to the AUR package `endlessmind` (`makepkg --printsrcinfo > .SRCINFO` beside it).
5. winget: copy `winget/` to `manifests/f/FreeIdeas/EndlessMind/<version>/` in a fork of `microsoft/winget-pkgs` and open a pull request.
6. apt: the `.deb` is installed from the release page; a package repository for `apt update` is not set up.
