# Runtime interface, version 0 (draft)

What a realm's code and a renderer's code look like, and what they can and cannot do inside their sandboxes. This is an optional reference runtime alongside the core in [PROTOCOL.md](PROTOCOL.md). Other engines can speak the session extension below without implementing these JavaScript callbacks. Version 0 is a draft and may change. It supports one self-contained module each for rules and renderer, plus optional realm-local storage.

The reference implementation is [app/sandbox.js](../app/sandbox.js) and [app/session.js](../app/session.js) in the browser, [shared/referee.js](../shared/referee.js) (the referee loop) and [host/host.js](../host/host.js) (the host program, which referees without a browser). The examples are [examples/maze-chase/](../examples/maze-chase/) (public rules) and [examples/listening-well/](../examples/listening-well/) (private rules that ask an AI model).

## A realm's files

A realm is published from a folder of files:

| File          | What it is                                                                          |
| ------------- | ----------------------------------------------------------------------------------- |
| `realm.json`  | Name, description, tags, and which file is the rules and which the renderer         |
| rules file    | The realm's rules: one self-contained JavaScript module (named in `main`)           |
| renderer file | The default browser renderer: one self-contained JavaScript module (in `renderer`)  |

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

- `main` is required. With `"privateRules": true` the rules file is never uploaded and the manifest leaves `main` out, so only the host program can referee the realm; the browser app refuses to publish it.
- `renderer` may be left out when `app` is given.
- `app`, `{ "name": "...", "url": "https://..." }`, names the realm's own app, a program players install (see "Apps beyond the browser" in [DESIGN.md](DESIGN.md)).
- `files` lists other public files the host program uploads with the realm. The browser app uploads every file chosen.
- `needs` lists permissions the realm asks the player's app for. None exist in version 0, so leave it empty or out.

Publishing makes a new key pair and saves the original files locally before uploading each public file under its hash (at most 2 MB per file), signs a manifest listing the files by hash, and announces it. The realm's address is its public key, and its link is `https://<trusted-app>/#emind:<address>?via=<encoded-server-origin>` (see "Version 0 formats" in [PROTOCOL.md](PROTOCOL.md)). The host program does the same from the realm's folder, keeping the key in a key file, so starting it again publishes the folder's current version under the same address (see [RUNNING.md](RUNNING.md)).

**Version 0 limit:** each module must be self-contained, with no `import` of other files. Inline anything you need (including libraries) into the file itself.

## The rules module

The rules run on the referee: in a hidden sandbox when a browser tab holding the realm's key referees, or directly under the host program. The referee keeps the state and calls these functions; all are optional except `init` and `view`.

```js
export default {
  ticksPerSecond: 10,                 // how often tick() runs, 1 to 60

  init({ seed, storage }) { return state; },   // make the starting state; seed is a random integer
  enter(state, player, character) {   // a player asks to come in
    return true;                      // true lets them in; a string refuses, giving the reason
  },
  act(state, player, action) {},      // a player's move, exactly as their renderer sent it
  leave(state, player) {},            // a player left or stopped answering (after 20 seconds)
  tick(state) {},                     // time passes
  view(state, player) { return {}; }, // what this player is sent after each tick
};
```

- **`player`** is the address the player uses in this realm (a string such as `ed25519-...`). A returning player always has the same address here, so you can key state by it; in every other realm the same player has a different one.
- **`character`** is the character's general description, sent by the visitor's app. The default layout is `{ name, color, description }`, but any field may be missing or strange. Treat it as untrusted input: use what you understand, clean it up, ignore the rest.
- **`action`** comes from the player's renderer, which may be any renderer, not just yours. Check it; ignore what your rules do not allow ("there is no cheating, only rules").
- **`view`** decides what each player can see. Anything you put in a player's view counts as seen by that player, whatever renderer they use, so leave out what they must not know (cards in other hands, enemies behind walls). Keep views small: they are signed and sent to every player on every tick. A view is copied as plain JSON at the moment `view` returns it, so later changes to the state never leak into a view already made. A message over 256 KB cannot be carried: it is not sent, and the referee logs an error naming its size.
- **State** lives in the referee process. Rules choose what to preserve using `storage.get(key)` and `storage.put(key, value)`, both asynchronous. Keys are strings, values are JSON data, and a missing key reads as `undefined`. Only this realm's rules receive its storage; renderers do not. A completed write replaces one value atomically. Browser storage uses IndexedDB transactions; host storage replaces a JSON file beside its key file. This is not a multi-key transaction or an automatic snapshot of the running state. Rules own save timing, schema changes, and correctness. Full backups include committed storage; clearing site data can still erase browser storage.
- **Waiting, and the outside world.** `init`, `enter`, `act` and `tick` may return promises in both hosting modes. The host program has no sandbox, so rules there can also use the network, files or an AI model. A move is then a call: the rules work on it while play goes on, and the answer reaches players in later views. While `tick` waits, no new views go out. Actions and entry may overlap other work; the runtime does not serialize state mutations or manage transactions. Rules are responsible for that. Browser rules can await their provided storage but still have no general network access. Startup and entry errors reject their pending calls. Closing a visit cancels pending calls and removes its frame; the runtime imposes no execution deadline on realm code and does not interrupt endless loops. Rules under the host program can do anything the program can, so host only realms you wrote or trust.

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

In the browser app, renderers and public rules run in frames with their own blank origin and a strict content security policy:

- No network: no `fetch`, WebSocket or loading scripts, images or fonts from elsewhere. Embed assets as `data:` URLs or draw them.
- No direct access to the app's storage, keys or other frames. Rules receive only the realm-local storage interface described above.
- No navigating the page, and no navigating its own frame to a web address: the app page's content security policy (`frame-src 'none'`) forbids it, since that would give the code the network. Known limit: browsers offer no dependable way to switch off WebRTC (direct connections) inside a frame, so code may still be able to send data out that way.

This is the safety floor: players can open any realm without trusting its author. Known limit: code stuck in an endless loop can freeze the page in some browsers; nothing meters or stops it yet.

## Messages between visitors and the referee

These are the "entering and leaving" extension (prefix `emind.`), carried in signed envelopes (see [PROTOCOL.md](PROTOCOL.md)). The app handles them; realm code never sees them.

- `emind.enter`, visitor to realm: `{ request, release, character }`. The visitor chooses a random request ID (16 to 64 characters), repeating it while waiting. A new visit or reconnection after silence chooses a fresh one. `release` is the expected manifest-body hash.
- `emind.welcome`, realm to visitor: `{ request, session, instance, release, name }`. The referee creates a random instance ID on startup and a fresh session ID for this visitor's new request. Welcome must echo the expected request and release. Once accepted, a different session or instance cannot replace it without a fresh handshake.
- `emind.refused`, realm to visitor: `{ request, reason }`. Ends that visit attempt. A release mismatch is refused.
- `emind.act`, visitor to realm: `{ session, seq, action }`. Sequence numbers are positive safe integers that increase within this session; older or repeated actions are dropped. An app sends its messages in the order they were made and handles arriving ones in the order they came, so moves reach the rules in the order the player made them.
- `emind.state`, realm to visitor: `{ session, seq, view }`. An independently increasing positive sequence number orders views. Only the accepted session's newer views are displayed.
- `emind.ping`, visitor to realm: `{ session }`, every five seconds.
- `emind.leave`, visitor to realm: `{ session }`, ending this session.

Every message is signed and checked against the expected sender and receiver. Referees ignore messages for other sessions. Repeated entry requests do not run a pending `enter` twice. Visitors receiving no view for 15 seconds begin a fresh handshake; referees remove visitors unheard from for 20 seconds. The owner joins through this same path. Navigation cancels unfinished startup and disposes the visitor's frame, connection, timers and listeners; hosting is a separate lifetime.

Messages are signed but not encrypted to the receiver. Session IDs distinguish running copies; they do not establish a worldwide winner between two holders of the same realm key. This draft session extension replaces the earlier unscoped messages. Update both visitors and referees together; keys and source modules remain usable.

## Saving data

For example, rules can restore a counter during initialization and save it after an action. The realm chooses how overlapping actions are handled:

```js
let storage;
export default {
  async init(options) {
    storage = options.storage;
    return { count: await storage.get("count") ?? 0 };
  },
  act(state) {
    state.count++;
    storage.put("count", state.count).catch(console.error);
  },
  view(state) { return { count: state.count }; },
};
```
