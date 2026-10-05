# endlessmind.com

The project's website, served as plain files by Caddy on `ordinarydata.com` from `~/domains/endlessmind.com/`. This folder is the home page; every other page is its own subfolder with its own files and `README.md`. Pages are plain HTML and CSS with no build step; PHP is available but used only where plain files cannot do the job.

| Path      | Page                                                                |
| --------- | ------------------------------------------------------------------- |
| `/`       | Home: what Endless Mind is, links to the portal and example realms  |
| `create/` | For people: making a realm with an AI coding agent                  |
| `agents/` | The short address given to AI agents; sends them to the agent guide |
| `host/`   | Keeping a realm up with the host program                            |
| `server/` | Running a helper server                                             |
| `docs/`   | Not in this folder: made at deploy time from `specs/`               |

The docs are never copied by hand. `uv run deploy/site.py` (run in the checkout on ordinarydata after `git pull --ff-only`) copies this folder to the web folder and writes `docs/` from `specs/`, pointing links outside `specs/` at GitHub. The play links on the home page name the example realms hosted from qube (see `deploy/README.md`); they change only if those realms' keys are lost.

Every page carries the same `<nav>` and `<footer>`; change them on every page together.
