# Working on this repository

Instructions for AI agents (and people) changing Endless Mind itself. The project is being redesigned: identity is settled, and finding realms, hosting and making them are still open (see "Not decided yet" in [specs/DESIGN.md](specs/DESIGN.md)).

## Layout

| Path        | What it is                                                                          |
| ----------- | ----------------------------------------------------------------------------------- |
| `README.md` | For end users: people who play and people who create                                |
| `specs/`    | The design and the protocol                                                         |
| `shared/`   | Code run unchanged in browsers and Deno: secret phrases, keys, signed JSON          |
| `tests/`    | Deno unit tests                                                                     |
| `site/`     | The endlessmind.com website: one subfolder per page; still describes the old design |
| `deploy/`   | How endlessmind.com is published                                                    |

## Conventions

- Plain JavaScript ES modules with JSDoc type comments; no build step, no bundler, no npm dependencies in browser or shared code. Browsers must be able to load every file as it is.
- `deno task check` and `deno task test` must pass before committing.
- Protocol changes (formats, signing, the phrase-to-key recipe, rules for login pages) must be reflected in [specs/PROTOCOL.md](specs/PROTOCOL.md). The phrase-to-key recipe must keep matching the published BIP39 and SLIP-0010 test vectors in `tests/keys_test.js`.
- Design decisions go in [specs/DESIGN.md](specs/DESIGN.md), using the terms in its "Words used here" section (realm, player, ID, secret phrase, proof, login page, record).
- Player-facing text uses plain words: secret phrase, player ID, proof, login page, record. Never key, signature or address of a key.
- Docs: plain language, no em or en dashes as punctuation, no hard-wrapped paragraphs, tables under 120 characters wide.
- Examples and demos are original work only (see "Original work only" in DESIGN.md).
