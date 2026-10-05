# Working on this repository

Instructions for AI agents (and people) changing Endless Mind itself. Agents building realms for actors should read [specs/AGENT-GUIDE.md](specs/AGENT-GUIDE.md) instead.

## Layout

| Path        | What it is                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------- |
| `README.md` | For end users: people who play and people who create                                         |
| `specs/`    | Design, protocol, runtime interface, agent guide, running, examples                          |
| `shared/`   | Code run unchanged in browsers and Deno: keys, hashes, signed messages, relay, referee loop  |
| `server/`   | The helper server (one file, keep it a few hundred lines)                                    |
| `host/`     | The host program: referees a realm without a browser                                         |
| `portal/`   | The reference browser portal, served as plain files                                          |
| `examples/` | Realm source folders (`realm.json`, rules, renderer)                                         |
| `tests/`    | Deno unit tests and the browser end-to-end test                                              |
| `site/`     | The endlessmind.com website: one subfolder per page, each with its own README.md             |
| `deploy/`   | How endlessmind.com and its helper servers run, and the site's deploy script                 |

## Conventions

- Plain JavaScript ES modules with JSDoc type comments; no build step, no bundler, no npm dependencies in the portal or shared code. Browsers must be able to load every file as it is.
- `deno task check` and `deno task test` must pass before committing; run `uv run tests/e2e.py chromium firefox webkit` after changing the portal, sandbox, server or host program. How to run things is in [specs/RUNNING.md](specs/RUNNING.md).
- The server holds no game state and makes no rules. If a feature needs the server to understand a game, it belongs in the portal or in realm code instead.
- If a format changes on purpose, regenerate the test vectors with `deno run tests/vectors.js > specs/test-vectors.json` (never to make a failing test pass by accident).
- Protocol changes (message shapes, signing, manifest, announcements) must be reflected in [specs/PROTOCOL.md](specs/PROTOCOL.md) or [specs/RUNTIME.md](specs/RUNTIME.md), keeping the "rules for the rules" in PROTOCOL.md.
- Design decisions go in [specs/DESIGN.md](specs/DESIGN.md), using the terms in its "Words used here" section (actor is whoever plays, a person or an AI; portal is the software that gets an actor into a realm; realm is the technical word).
- Docs: plain language, no em or en dashes as punctuation, no hard-wrapped paragraphs, tables under 120 characters wide.
- Examples and demos are original work only (see "Original work only" in DESIGN.md).
