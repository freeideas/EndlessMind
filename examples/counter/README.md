# Shared Button

A tiny example game with a game server written in Rust and compiled to WebAssembly. Everyone presses one shared button and sees the count, which is kept across restarts. It shows `game.wasm` in place of `game.js`; the display is plain JavaScript as in any game.

| File          | What it is                                                                         |
| ------------- | ---------------------------------------------------------------------------------- |
| `game.wasm`   | The game server, built from `.source/` and kept here so that nobody needs Rust     |
| `index.html`  | The display                                                                        |
| `card.json`   | The realm card's words                                                             |
| `.source/`    | The Rust code (`src/lib.rs`); a folder starting with a dot is never served or packed |

Run it with `deno task counter` and open `http://localhost:8000/`. The surface a module may use is under "Game servers" in [specs/PROTOCOL.md](../../specs/PROTOCOL.md): it exports `memory`, `alloc` and `call`, imports only `host.ask`, and exchanges JSON.

**Building it.** You need Rust with the WebAssembly target, installed with `rustup` (`rustup target add wasm32-unknown-unknown`). Then:

```
cd examples/counter/.source
cargo build --release
cp target/wasm32-unknown-unknown/release/shared_button.wasm ../game.wasm
```

`.cargo/config.toml` there sets the target and the most memory the module may use (16 MB), which the host insists on. If another `rustc` comes first on your path than rustup's (a Homebrew one, say), the build fails to find the target: put rustup's first.
