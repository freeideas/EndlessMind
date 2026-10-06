# endlessmind.com

The project's website, served as plain files by Caddy on `ordinarydata.com` from `~/domains/endlessmind.com/`. This folder is the home page; any other page is its own subfolder with its own files and `README.md`. Pages are plain HTML and CSS with no build step.

| Path             | Page                                                  |
| ---------------- | ----------------------------------------------------- |
| `/`              | Home: what Endless Mind is, in short                  |
| `EntryPortal/1/` | The reference EntryPortal, version 1; see below       |
| `docs/`          | Not in this folder: made at deploy time from `specs/` |

The docs are never copied by hand. `uv run deploy/site.py` (run in the checkout on ordinarydata after `git pull --ff-only`) copies this folder to the web folder and writes `docs/` from `specs/`, pointing links outside `specs/` at GitHub.

Every page carries the same `<nav>` and `<footer>`; change them on every page together.

`EntryPortal/<version>/` holds the reference EntryPortal ([PROTOCOL.md](../specs/PROTOCOL.md), "Rules for EntryPortals"): one self-contained `index.html` and its fingerprint in `SHA256SUMS`. The shared code in it is copied from `shared/` by `deno task portal`, which also updates its security policy hashes and fingerprint; `deno task test` fails if that was forgotten. Once a version is published it never changes: a change goes into the next version's folder (see `deploy/entryportal.js`).
