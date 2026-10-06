# endlessmind.com

The project's website, served as plain files by Caddy on `ordinarydata.com` from `~/domains/endlessmind.com/`. This folder is the home page; any other page is its own subfolder with its own files and `README.md`. Pages are plain HTML and CSS with no build step.

| Path    | Page                                                 |
| ------- | ---------------------------------------------------- |
| `/`     | Home: what Endless Mind is, in short                 |
| `docs/` | Not in this folder: made at deploy time from `specs/` |

The docs are never copied by hand. `uv run deploy/site.py` (run in the checkout on ordinarydata after `git pull --ff-only`) copies this folder to the web folder and writes `docs/` from `specs/`, pointing links outside `specs/` at GitHub.

Every page carries the same `<nav>` and `<footer>`; change them on every page together.
