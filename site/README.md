# endlessmind.com

The project's website, served as plain files by Caddy on `ordinarydata.com` from `~/domains/endlessmind.com/`. This folder is the home page; any other page is its own subfolder with its own files and `README.md`. Pages are plain HTML and CSS with no build step.

| Path           | Page                                                           |
| -------------- | -------------------------------------------------------------- |
| `/`            | Home: what Endless Mind is, in short                           |
| `EntryPortal/` | Forwards to portal.endlessmind.com; holds published v0.1       |
| `docs/`        | Not in this folder: made at deploy time from `specs/`          |

The docs are never copied by hand. `uv run deploy/site.py` (run in the checkout on ordinarydata after `git pull --ff-only`) copies this folder to the web folder and writes `docs/` from `specs/`, pointing links outside `specs/` at GitHub.

Every page carries the same `<nav>` and `<footer>`; change them on every page together. The EntryPortal is the exception: it stands alone and links nowhere.

The EntryPortal has a site of its own, built from [portal/](../portal/README.md). `EntryPortal/index.html` forwards there (it is written by `deno task portal`), and `EntryPortal/v0.1/` is a published version, so it is never edited.
