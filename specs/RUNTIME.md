# Runtime interface, version 0 (draft)

What a realm's code and a renderer's code look like, and what they can and cannot do inside their sandboxes. This is the "runtime interface" part of the core in [PROTOCOL.md](PROTOCOL.md). Version 0 is a draft: it will change, and later versions will add to it (WebAssembly, more files per realm, saved state).

The reference implementation is [app/sandbox.js](../app/sandbox.js) and [app/session.js](../app/session.js); the example is [examples/maze-chase/](../examples/maze-chase/).

## A realm's files

A realm is published from a folder of files:

| File          | What it is                                                                       |
| ------------- | -------------------------------------------------------------------------------- |
| `realm.json`  | Name, description, tags, and which file is the rules and which the renderer      |
| rules file    | The realm's rules: one self-contained JavaScript module (named in `main`)        |
| renderer file | The default renderer: one self-contained JavaScript module (named in `renderer`) |

```json
{
  "name": "Lantern Maze",
  "description": "Collect glowing seeds while lantern spirits chase you.",
  "tags": ["maze", "chase", "multiplayer"],
  "main": "rules.js",
  "renderer": "renderer.js",
  "needs": []
}
```

`needs` lists permissions the realm asks the player's app for. None exist in version 0, so leave it empty or out.

Publishing makes a new key pair for the realm on the publishing device, uploads each file under its hash (at most 2 MB per file), signs a manifest listing the files by hash, and announces it. The realm's address is its public key, and its link is `https://<any server>/#emind:<address>` (see "Version 0 formats" in [PROTOCOL.md](PROTOCOL.md)).

**Version 0 limit:** each module must be self-contained, with no `import` of other files. Inline anything you need (including libraries) into the file itself.

## The rules module

The rules run on the referee's device (the device holding the realm's key), in a hidden sandbox. The app keeps the state inside the sandbox and calls these functions; all are optional except `init` and `view`.

```js
export default {
  ticksPerSecond: 10,                 // how often tick() runs, 1 to 60

  init({ seed }) { return state; },   // make the starting state; seed is a random integer
  enter(state, player, character) {   // a player asks to come in
    return true;                      // true lets them in; a string refuses, giving the reason
  },
  act(state, player, action) {},      // a player's move, exactly as their renderer sent it
  leave(state, player) {},            // a player left or stopped answering (after 20 seconds)
  tick(state) {},                     // time passes
  view(state, player) { return {}; }, // what this player is sent after each tick
};
```

- **`player`** is the player's character address (a string such as `ed25519-...`). It is stable, so you can key state by it.
- **`character`** is the character's general description, sent by the visitor's app. The default layout is `{ name, color, description }`, but any field may be missing or strange. Treat it as untrusted input: use what you understand, clean it up, ignore the rest.
- **`action`** comes from the player's renderer, which may be any renderer, not just yours. Check it; ignore what your rules do not allow ("there is no cheating, only rules").
- **`view`** decides what each player can see. Anything you put in a player's view counts as seen by that player, whatever renderer they use, so leave out what they must not know (cards in other hands, enemies behind walls). Keep views small: they are signed and sent to every player on every tick.
- **State** must be plain data (objects, arrays, strings, numbers, booleans) if you want it to survive future versions that save and move state.

## The renderer module

The renderer runs on each player's device, in a visible sandbox that fills the realm area.

```js
export default {
  start(root, game) {
    // root:            the sandbox's <body>; draw into it however you like (canvas, WebGL, DOM, SVG)
    // game.me:         this player's address (matches `player` in the rules)
    // game.character:  this player's character description
    // game.onView(fn): fn(view) is called with each new view from the realm
    // game.act(action): send a move to the realm; any JSON value
  },
};
```

Input (keyboard, mouse, touch, gamepad) arrives inside the sandbox as usual once the player clicks or taps it. Views arrive about `ticksPerSecond` times a second; smooth movement between them in the renderer if you like.

## What sandboxed code cannot do

Both modules run in frames with their own blank origin and a strict content security policy:

- No network: no `fetch`, WebSocket or loading scripts, images or fonts from elsewhere. Embed assets as `data:` URLs or draw them.
- No access to the app's storage, keys or other frames.
- No navigating the page.

This is the safety floor: players can open any realm without trusting its author.

## Messages between visitors and the referee

These are the "entering and leaving" extension (prefix `emind.`), carried in signed envelopes (see [PROTOCOL.md](PROTOCOL.md)). The app handles them; realm code never sees them.

| Kind          | From → to       | Body            | Meaning                      |
| ------------- | --------------- | --------------- | ---------------------------- |
| `emind.enter`   | visitor → realm | `{ character }` | Please let me in             |
| `emind.welcome` | realm → visitor | `{ name }`      | You are in                   |
| `emind.refused` | realm → visitor | `{ reason }`    | You are not let in           |
| `emind.act`     | visitor → realm | `{ action }`    | A move                       |
| `emind.state`   | realm → visitor | `{ view }`      | What you can see now         |
| `emind.ping`    | visitor → realm | `{}`            | Still here (every 5 seconds) |
| `emind.leave`   | visitor → realm | `{}`            | Goodbye                      |

Every message is signed by its sender, and each side checks the signature and that it came from the expected address before acting on it.
