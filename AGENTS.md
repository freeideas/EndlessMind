# Working on this repository

Instructions for AI agents (and people) changing Endless Mind itself. Agents building realms for players should read [specs/AGENT-GUIDE.md](specs/AGENT-GUIDE.md) instead.

## Layout

| Path        | What it is                                                                  |
| ----------- | --------------------------------------------------------------------------- |
| `README.md` | For end users: players and creators                                         |
| `specs/`    | Design, protocol, runtime interface, agent guide, running, examples         |
| `shared/`   | Code that runs unchanged in browsers and Deno: keys, hashes, signed messages |
| `server/`   | The helper server (one file, keep it a few hundred lines)                   |
| `app/`      | The reference browser app, served as plain files                            |
| `examples/` | Realm source folders (`realm.json`, rules, renderer)                        |
| `tests/`    | Deno unit tests and the browser end-to-end test                             |

## Conventions

- Plain JavaScript ES modules with JSDoc type comments; no build step, no bundler, no npm dependencies in the app or shared code. Browsers must be able to load every file as it is.
- `deno task check` and `deno task test` must pass before committing; run `uv run tests/e2e.py chromium firefox webkit` after changing the app, sandbox or server. How to run things is in [specs/RUNNING.md](specs/RUNNING.md).
- The server holds no game state and makes no rules. If a feature needs the server to understand a game, it belongs in the app or in realm code instead.
- If a format changes on purpose, regenerate the test vectors with `deno run tests/vectors.js > specs/test-vectors.json` (never to make a failing test pass by accident).
- Protocol changes (message shapes, signing, manifest, announcements) must be reflected in [specs/PROTOCOL.md](specs/PROTOCOL.md) or [specs/RUNTIME.md](specs/RUNTIME.md), keeping the "rules for the rules" in PROTOCOL.md.
- Design decisions go in [specs/DESIGN.md](specs/DESIGN.md), using the terms in its "Words used here" section (player is the person; app is the software; realm is the technical word).
- Docs: plain language, no em or en dashes as punctuation, no hard-wrapped paragraphs, tables under 120 characters wide.
- Examples and demos are original work only (see "Original work only" in DESIGN.md).
