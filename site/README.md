# endlessmind.com

The project's website, served as plain files by Caddy on `ordinarydata.com` from `~/domains/endlessmind.com/`. This folder is the home page; any other page is its own subfolder with its own files and `README.md`. Pages are plain HTML and CSS with no build step.

| Path           | Page                                                           |
| -------------- | -------------------------------------------------------------- |
| `/`            | Home: what Endless Mind is, in short                           |
| `EntryPortal/` | The reference EntryPortal, one folder per version; see below   |
| `docs/`        | Not in this folder: made at deploy time from `specs/`          |

The docs are never copied by hand. `uv run deploy/site.py` (run in the checkout on ordinarydata after `git pull --ff-only`) copies this folder to the web folder and writes `docs/` from `specs/`, pointing links outside `specs/` at GitHub.

Every page carries the same `<nav>` and `<footer>`; change them on every page together. The EntryPortal is the exception: it stands alone and links nowhere.

`EntryPortal/<version>/` (v0.1, v0.2, ... v1.0) holds one version of the reference EntryPortal ([PROTOCOL.md](../specs/PROTOCOL.md), "Rules for EntryPortals"): one self-contained `index.html` and its fingerprint in `SHA256SUMS`. `EntryPortal/index.html` forwards to the newest version, keeping the part after "#", and is the address realms usually name. All of these are written by `deno task portal`, which copies the shared code in from `shared/` and updates the security policy hashes and fingerprint; `deno task test` fails if that was forgotten. Improvements are welcome as new versions: once a version is published it is never edited in place, so a check of it stays true (see `deploy/entryportal.js`).
