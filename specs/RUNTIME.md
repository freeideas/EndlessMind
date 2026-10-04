# Runtime interface, version 0 (draft)

What a realm's code and a renderer's code look like, and what they can and cannot do inside their sandboxes. This is an optional reference runtime alongside the core in [PROTOCOL.md](PROTOCOL.md). Other engines can speak the session extension below without implementing these JavaScript callbacks. Version 0 is a draft and may change. It supports one self-contained module each for rules and renderer, plus optional realm-local storage.

The reference implementation is [player/sandbox.js](../player/sandbox.js) and [player/session.js](../player/session.js) in the browser, [shared/referee.js](../shared/referee.js) (the referee loop) and [host/host.js](../host/host.js) (the host program, which referees without a browser). The examples are [examples/maze-chase/](../examples/maze-chase/) (public rules) and [examples/listening-well/](../examples/listening-well/) (private rules that ask an AI model).

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

- `main` is required. With `"privateRules": true` the rules file is never uploaded and the manifest leaves `main` out, so only the host program can referee the realm; the browser player refuses to publish it.
- `renderer` may be left out when `player` is given.
- `player`, `{ "name": "...", "url": "https://..." }`, names the realm's own player, a program actors install (see "Players beyond the browser" in [DESIGN.md](DESIGN.md)).
- `files` lists other public files the host program uploads with the realm. The browser player uploads every file chosen.
- `needs` lists permissions the realm asks the actor's player for. None exist in version 0, so leave it empty or out.

Publishing makes a new key pair and saves the original files locally before uploading each public file under its hash (at most 2 MB per file), signs a manifest listing the files by hash, and announces it. The realm's address is its public key, and its link is `https://<trusted-player>/#emind:<address>?via=<encoded-server-origin>` (see "Version 0 formats" in [PROTOCOL.md](PROTOCOL.md)). The host program does the same from the realm's folder, keeping the key in a key file, so starting it again publishes the folder's current version under the same address (see [RUNNING.md](RUNNING.md)).

**Version 0 limit:** each module must be self-contained, with no `import` of other files. Inline anything you need (including libraries) into the file itself.

## The rules module

The rules run on the referee: in a hidden sandbox when a browser tab holding the realm's key referees, or directly under the host program. Both use the same driver (`directRules` in [shared/referee.js](../shared/referee.js)), so rules behave the same in either place. In the browser the rules run in a worker (a background thread) inside the sandbox, so rules stuck in an endless loop do not freeze the page and stop when hosting stops. The referee keeps the state and calls these functions; all are optional except `init` and `view`.

```js
export default {
  ticksPerSecond: 10,                 // how often tick() runs, 1 to 60
  repeatable: false,                  // true lets every actor's player check the referee (see below)

  init({ seed, storage, remove, claim }) { return state; }, // make the starting state; seed is a random integer
  enter(state, actor, character, claims) { // an actor asks to come in
    return true;                      // true lets them in; a string refuses, giving the reason
  },
  act(state, actor, action) {},      // an actor's move, exactly as their renderer sent it
  leave(state, actor) {},            // an actor left or stopped answering (after 20 seconds)
  tick(state) {},                     // time passes
  view(state, actor) { return {}; }, // what this actor is sent after each tick; undefined sends nothing
};
```

- **`actor`** is the address the actor is known by (a string such as `ed25519-...`). A returning actor always has the same address, so you can key state by it. It is usually the character's lasting address, the same in every realm; an actor who entered privately has an address used only here.
- **`character`** is the character's general description, sent by the visitor's player. The default layout is `{ name, color, description }`, but any field may be missing or strange. Treat it as untrusted input: use what you understand, clean it up, ignore the rest.
- **`action`** comes from the actor's renderer, which may be any renderer, not just yours. Check it; ignore what your rules do not allow ("there is no cheating, only rules").
- **`view`** decides what each actor can see. Anything you put in an actor's view counts as seen by that actor, whatever renderer they use, so leave out what they must not know (cards in other hands, enemies behind walls). Keep views small: they are signed and sent to every actor on every tick. A view is copied as plain JSON at the moment `view` returns it, so later changes to the state never leak into a view already made. A message over 256 KB cannot be carried: it is not sent, and the referee logs an error naming its size.
- **`remove(actor, reason)`**, given to `init`, ends an actor's visit: the actor is told the reason, gets no more views, and their moves are ignored. `leave` is not called for an actor the rules removed. They may ask to enter again, and `enter` decides. Use it for an idle limit, a full realm, or someone the rules no longer want inside.
- **`claim(actor, says, days)`**, given to `init`, has the referee sign a claim about an actor: `says` is any short JSON (at most 1,024 characters), and `days` is how long it counts, left out for something that simply happened. The actor's player receives it if the actor is inside or on the way in. The call returns a promise of the signed claim, which the rules may keep (but not in the state of repeatable rules, whose copies on actors' devices get nothing back and would then differ). See "Signed claims" below.
- **`seen(state, actor, both)`**, an optional function beside `enter` and `act`, is called when an actor's player signs a claim in return: `both` is `{ claim, seen }`, a claim signed by both parties, which the rules may keep. (Repeatable rules should not change their state here, for the same reason.)
- **`claims`**, the fourth argument of `enter`, lists the claims the visitor chose to show, already checked by the referee: each is `{ issuer, about, says, time, expires, signed }`, where `issuer` is the address of the realm that signed it and `signed` the signed original (left out for repeatable rules). It is an empty list when nothing was shown. Decide for yourself which issuers you trust.
- **State** lives in the referee process. Rules choose what to preserve using `storage.get(key)` and `storage.put(key, value)`, both asynchronous. Keys are strings, values are JSON data, and a missing key reads as `undefined`. Only this realm's rules receive its storage; renderers do not. A completed write replaces one value atomically. Browser storage uses IndexedDB transactions; host storage replaces a JSON file beside its key file. This is not a multi-key transaction or an automatic snapshot of the running state. Rules own save timing, schema changes, and correctness. Full backups include committed storage; clearing site data can still erase browser storage.
- **Waiting, and the outside world.** `init`, `enter`, `act` and `tick` may return promises in both hosting modes. The host program has no sandbox, so rules there can also use the network, files or an AI model. A move is then a call: the rules work on it while play goes on, and the answer reaches actors in later views. While `tick` waits, no new views go out. Actions and entry may overlap other work; the runtime does not serialize state mutations or manage transactions. Rules are responsible for that. Browser rules can await their provided storage but still have no general network access. Startup and entry errors reject their pending calls. Closing a visit cancels pending calls and removes its frame; the runtime imposes no execution deadline on realm code and does not interrupt endless loops. Rules under the host program can do anything the program can, so host only realms you wrote or trust.

## Three ways the same rules run

Rules that are public can be run in three ways, and the rules cannot tell which (see "Three kinds of realm" in [DESIGN.md](DESIGN.md)):

- **Alone.** An actor opens the release link (`emind:sha256-...`) and their player runs the rules for one actor. `storage` is kept in that actor's browser, under the release hash. Rules should make sense with a single actor inside.
- **In a room.** An actor chooses **Play with others** and their tab referees under a key made on the spot. A room's `storage` lasts only as long as the room.
- **As a lasting realm.** The maker's key referees, in a tab or under the host program, and `storage` lasts.

Rules kept private run only the third way.

## Checking the referee

Public rules are normally a statement, not a proof: nobody can see what a referee really runs. Rules that set `repeatable: true` change that. They promise three things:

- **The same moves in the same order always give the same state.** No `Math.random()`, no clock, no network, no `storage`, nothing kept outside `state`. Random numbers come from the `seed` given to `init`, kept in the state (the maze example does this).
- **Every function is plain, not `async`**, and the state is plain JSON.
- **Nothing in the state is secret**, because every actor's player receives all of it.

The referee then sends each actor, with every view, the moves it applied since the last one (and, at the start of a session, a full copy of the state). The actor's player runs its own copy of the public rules in a sandbox, applies the same moves, and compares the view its copy gives with the view the referee sent. A referee that strays from the rules in any way the actor can see, or makes a move in the actor's name, is caught at once, and the player warns the actor. This holds in a room and in a lasting realm alike: the host still decides the order of moves and who gets in, but cannot bend the rules while an actor is following.

Known limits. A copy has to begin somewhere, and it begins from the referee's own account of the state at the start of each session, so a referee can misstate things to an actor who has only just arrived, or after a break long enough that the player had to start a fresh session (at least 15 seconds of silence, or a lost message). The player tells the actor each time checking starts over. A starting point sent to a copy that is already following is not taken on trust: it must match the copy's own state exactly. A state too large to send (about 180,000 characters as JSON) cannot be checked, and the player says so. Because every move is passed on to every actor, a move larger than 4,096 characters as JSON is not applied in a repeatable realm, an entry whose character description and shown claims together pass 32,768 is refused, and so is anything beyond 65,536 characters in one tick.

Leave `repeatable` out for rules that hide information (cards in a hand), use the outside world, or save data. Those are trusted the old way.

## The renderer module

The renderer runs on each actor's device, in a visible sandbox that fills the realm area.

```js
export default {
  start(root, game) {
    // root:            the sandbox's <body>; draw into it however you like (canvas, WebGL, DOM, SVG)
    // game.me:         this actor's address (matches `actor` in the rules)
    // game.character:  this actor's character description
    // game.onView(fn): fn(view) is called with each new view from the realm
    // game.act(action): send a move to the realm; any JSON value
  },
};
```

Input (keyboard, mouse, touch, gamepad) arrives inside the sandbox as usual once the actor clicks or taps it. Views arrive about `ticksPerSecond` times a second; smooth movement between them in the renderer if you like.

## What sandboxed code cannot do

In the browser player, renderers and public rules run in frames with their own blank origin and a strict content security policy:

- No network: no `fetch`, WebSocket or loading scripts, images or fonts from elsewhere. Embed assets as `data:` URLs or draw them.
- No direct access to the player's storage, keys or other frames. Rules receive only the realm-local storage interface described above.
- No navigating the page, and no navigating its own frame to a web address: the player page's content security policy (`frame-src 'none'`) forbids it, since that would give the code the network. Known limit: browsers offer no dependable way to switch off WebRTC (direct connections) inside a frame, so code may still be able to send data out that way.

This is the safety floor: actors can open any realm without trusting its author. Known limit: a renderer stuck in an endless loop can freeze the page in some browsers, and nothing meters or stops it. The player notes which realm it is entering and clears the note on leaving, so after a freeze and a reload it asks before opening that realm again. A realm hosted in the same tab pauses while the page is frozen.

## Messages between visitors and the referee

These are the "entering and leaving" extension (prefix `emind.`), carried in signed envelopes (see [PROTOCOL.md](PROTOCOL.md)). The player handles them; realm code never sees them.

- `emind.enter`, visitor to realm: `{ request, release, character }`, with `shown` added when the actor shows claims: a list of at most 16 `{ claim, proof }` (see "Claims" in [PROTOCOL.md](PROTOCOL.md)). The visitor chooses a random request ID (16 to 64 characters), repeating it while waiting. A new visit or reconnection after silence chooses a fresh one. `release` is the expected manifest-body hash.
- `emind.welcome`, realm to visitor: `{ request, session, instance, release, name }`. The referee creates a random instance ID on startup and a fresh session ID for this visitor's new request. Welcome must echo the expected request and release. Once accepted, a different session or instance cannot replace it without a fresh handshake.
- `emind.refused`, realm to visitor: `{ request, reason }`. Ends that visit, whether it arrives in answer to `emind.enter` or later, when the rules remove an actor. A release mismatch is refused.
- `emind.act`, visitor to realm: `{ session, seq, action }`. Sequence numbers are positive safe integers that increase within this session; older or repeated actions are dropped. A player sends its messages in the order they were made and handles arriving ones in the order they came, so moves reach the rules in the order the actor made them.
- `emind.state`, realm to visitor: `{ session, seq, view }`. An independently increasing positive sequence number orders views. Only the accepted session's newer views are displayed. `claims`, when present, lists claims the realm has signed for this visitor; in a private session it travels inside the box. A referee of repeatable rules adds `check`, and then sends a message on every tick even when there is no `view`: `{ start, inputs }` for the first message of a session, where `start` is a JSON text of `{ state, actors }` after the moves in `inputs`, or `{ unchecked: reason }` when the state is too large to send; and after that `{ inputs }`, the moves applied since the last message, in order, each one of `["enter", actor, character, claims]`, `["act", actor, action]`, `["leave", actor]` or `["tick"]`. Moves are passed on as the plain JSON the rules were given. A visitor that finds a gap in `seq` (the first message of a session is number 1) begins a fresh handshake, since its copy has missed moves. In a private session `check` travels inside the box with `view`.
- `emind.ping`, visitor to realm: `{ session }`, every five seconds, with `seen` added after claims arrive: for each claim the visitor keeps, `{ sig, seen }`, where `seen` is the visitor's own signature on it (see "Claims" in [PROTOCOL.md](PROTOCOL.md)). The referee sends a claim once in each session until it comes back signed, so one lost on the way arrives in the next session. The referee answers `emind.pong`, `{ session }`, so a visitor can tell a realm with nothing to show from a referee that is gone.
- `emind.leave`, visitor to realm: `{ session }`, ending this session.

Every message is signed and checked against the expected sender and receiver. Referees ignore messages for other sessions. Repeated entry requests do not run a pending `enter` twice. Visitors hearing neither a view nor a pong for 15 seconds begin a fresh handshake, on the realm's next server if it has several; referees remove visitors unheard from for 20 seconds. The owner joins through this same path. Navigation cancels unfinished startup and disposes the visitor's frame, connection, timers and listeners; hosting is a separate lifetime.

**Private sessions.** `emind.enter` may carry `key`, the visitor's one-visit X25519 public key written as `x25519-` and 52 base32 characters. A referee that understands it answers with its own one-visit `key` in `emind.welcome`. Both sides then derive the same secret (X25519, then HKDF-SHA-256 with salt `emind-session` and info the referee's address, the visitor's address and the session ID, one per line) and use it as an AES-256-GCM key. From then on `emind.act` carries `box` in place of `action`, and `emind.state` carries `box` in place of `view`: the JSON text of an object holding the fields that would otherwise sit in the clear (`{ action }` or `{ view }`), locked, as base64. A referee sends nothing in a session before its welcome. The 12-byte number used once for each box is one byte for the direction (1 toward the realm, 2 toward the visitor), three zero bytes, then `seq` as 8 bytes, most significant first. In a private session only boxes count; a clear `action` or `view` is ignored. Because the two keys travel inside signed messages, a relay cannot swap them. Without `key` on either side the session is in the clear, as before.

**A private way in.** Who the visitor is and what they show should not be read by a relay either. An announcement may carry `key`, the referee's own X25519 public key for as long as it runs. A visitor that has it derives a key from its one-visit key and the referee's (same steps, with info `enter`, the referee's address, the visitor's address and the request ID, one per line) and sends `emind.enter` as `{ request, release, key, box }`, where `box` holds `{ character, shown }` locked with direction 3 and number 0. A referee that cannot open the box, because it has restarted since the announcement the visitor read, answers `emind.key`, `{ request, key }`, with its current key, and the visitor asks again. Session IDs distinguish running copies; they do not establish a worldwide winner between two holders of the same realm key. This draft session extension replaces the earlier unscoped messages. Update both visitors and referees together; keys and source modules remain usable.

## Signed claims

A realm can sign what an actor did in it, and another realm can ask to see it. This is how a good name earned in one realm counts in another (see "Reputation is earned" in [DESIGN.md](DESIGN.md)).

```js
// A guild: signs claims for its actors.
let claim, remove;
export default {
  init(options) { ({ claim, remove } = options); return { removed: [] }; },
  enter(state, actor) {
    claim(actor, "entered the guild hall");        // something that happened: it lasts
    claim(actor, { standing: "good" }, 30);        // how things stand: counts for 30 days, so renew it
    return true;
  },
  async act(state, actor, action) {
    if (action.sword) claim(actor, "pulled the sword from the stone");
    if (action.grief) {
      state.removed.push(await claim(actor, { removed: "griefing" }));  // the realm's own signed note
      remove(actor, "Removed for griefing.");
    }
  },
  view() { return {}; },
};
```

```js
// A club: lets in actors who show good standing in the guild. Its realm.json has
// "asks": ["ed25519-...the guild's address..."], so actors' players know what to offer.
const GUILD = "ed25519-...the guild's address...";
export default {
  init() { return {}; },
  enter(state, actor, character, claims) {
    const good = claims.find((e) => e.issuer === GUILD && e.says?.standing === "good");
    if (!good) return "Members of the guild only.";
    // One guild member, one actor here: a member who entered the guild privately could sign for a friend.
    state[good.about] ??= actor;
    return state[good.about] === actor ? true : "That guild member is already here as someone else.";
  },
  view() { return {}; },
};
```

- **The referee has already checked** each claim in the list: its issuer signed it, it is in date, it is about this visitor (or about a private address that signed for this visitor), and none is listed twice. Rules only decide what it is worth.
- **Count each holder once.** Usually `about` is the visitor's own address, and nothing more need be said. A claim earned under a private address is shown with that address's signature for this visitor, and such a signature could be made for a friend. `about` is the same every time, so rules can allow one visitor for each, as the club does.
- **Trust issuers by address.** Anyone can make a realm that signs anything, so name the realms whose word you accept.
- **A returning address is the same character.** Because a character has one address everywhere, the guild's actor and the club's visitor are recognizably the same.
- **An actor decides what to show.** The player asks once for each realm that asks, and an actor may hold nothing from the realms you name. Leave a way in for newcomers if you want any.
- **A note about a removal is yours to keep.** The actor will not carry it. Its effect is that you stop renewing their standing.
- **Only a lasting realm's word counts.** Played alone there is no key to sign with, and a room's key is thrown away. Under a referee pass, a claim ends when the pass does.

## Standing, bans and invitations

Anyone can make a new key, so banning an address stops only actors who have something to lose by starting over. Give them something: let standing grow with time, and let what an actor may do depend on it (see "Reputation is earned" in [DESIGN.md](DESIGN.md)). The `actor` address is the same each time an actor returns, and nobody else can use it, so it is safe to key records by it.

```js
let storage, remove;
export default {
  async init(options) {
    ({ storage, remove } = options);
    return { known: await storage.get("known") ?? {}, here: {}, saved: 0 };  // known: address -> { ticks, banned }
  },
  enter(state, actor, character) {
    const record = state.known[actor] ??= { ticks: 0, banned: false };
    if (record.banned) return "You are not welcome here.";
    state.here[actor] = true;
    return true;
  },
  act(state, actor, action) {
    const trusted = state.known[actor].ticks > 600;        // a minute at 10 ticks a second
    if (action.build && !trusted) return;                   // newcomers may look and move, not yet build
    // ... the realm's own moves; on serious trouble:
    // state.known[actor].banned = true; remove(actor, "Banned for griefing.");
  },
  leave(state, actor) { delete state.here[actor]; },
  tick(state) {
    for (const actor in state.here) state.known[actor].ticks++;
    if (++state.saved % 300 === 0) storage.put("known", state.known).catch(console.error);
  },
  view(state, actor) { return { canBuild: state.known[actor].ticks > 600 }; },
};
```

- **Invitations** work the same way: a trusted actor's move asks for a code, the rules keep it in the state with that actor's address, and `enter` lets a newcomer in only with an unused code (sent in the character description). The rules then know who vouched for whom.
- **Standing needs a lasting realm.** Played alone or in a room, saved data does not last, and each room starts fresh. Rules that set `repeatable` cannot use `storage`; such a realm keeps standing only for as long as its referee runs.

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
