# Walkthrough: from launch to a friend playing

Written 2026-09-27. A concrete, step-by-step picture of how EveryGame works in practice, using the [maze chase example](EXAMPLE-MAZE-CHASE.md). The design behind it is in [BRAINSTORM.md](BRAINSTORM.md). This is also an outline of what the first version has to build.

## 1. Launching the platform

There is no company system to switch on. Launching means making three things available:

1. **The code:** this repository, public under the MIT license. It contains the server, the app and the agent guide.
2. **At least one server:** a small always-on machine (around $5 a month) with a web address such as `everygame.example`, running one command (something like `deno run server.ts`). It serves the app page, introduces browsers to each other, relays traffic when direct connections fail, and stores encrypted files.
3. **The agent guide:** a file any AI coding agent reads to learn how to build realms and objects.

There is no user database and no accounts. On day one, "the network" is one server plus whoever opens it. It grows as other people run servers too.

## 2. Making a realm

The creator opens their AI agent in an empty folder and says: "Make a top-down maze where lantern spirits chase players who collect glowing seeds." The agent reads the guide and writes a few ordinary JavaScript files:

| File | What it is |
|---|---|
| `maze.js` | The realm's rules: entry, moves, the chasers, scoring, what each player sees |
| `maze-renderer.js` | The default renderer: draws the state as a flat 2D maze |
| `lantern-spirit.js` | The chasers' behavior |
| `looks.json` | Shapes and colors |

**Objects in the realm come in three kinds:**

- **Plain data:** walls and seeds are entries in the realm's state.
- **Realm-run objects:** the lantern spirits. The realm creates them and its referee runs them, so they belong to the realm.
- **Independent objects:** a fountain the creator made separately, with its own key. It enters the maze like any visitor, and the realm admits it by its code hash.

**Publishing** is one command, or one button in the app:

1. A new key pair is created on the creator's device. That key is the realm's identity.
2. Each file gets its hash (fingerprint).
3. The realm's key signs a manifest (a list of contents): name, tags, the file hashes, and who referees.
4. The files are uploaded to storage nodes, and the realm is announced on the server.
5. The creator gets a link: `everygame.example/#realm=<realm key>`. The key, not the server, names the realm, so the same link works from any mirror and in any app.

**Refereeing:** a multiplayer realm needs a referee. Either the creator keeps a browser tab open in "host" mode, or gives a server signed permission to host the realm around the clock with the headless runner. A single-player realm needs neither.

## 3. A friend plays, with a character the creator designed

The friend taps the link on their phone.

1. **The app loads** from the server: one web page, no install.
2. **They get a character.** A key must be created on the friend's own phone, since keys never move, so no one can hand over a finished character. The creator can instead publish a **character design** (code, look, a description such as "a small fox knight with a lantern"), and the link can include it (`...&start=<design hash>`). The friend's app creates a brand-new key and builds their character from that design, so it is theirs from the first second. Without a design, the app makes a default character with a random name and look.
3. **The app fetches the realm's files** by hash (from storage nodes, the server, or other players who have them), checks each hash, and runs each file in its own sandbox.
4. **The app connects to the referee** (the creator's tab or the hosting server), directly over WebRTC when possible, otherwise through the relay.
5. **The realm reads the character** (fox knight, orange, carries a lantern) and lends the friend an in-realm form: an orange runner with a little lantern.
6. **They play.** Swipes go from the app to the referee. The referee updates the state and sends each player their share. The phone draws it with the realm's default renderer. If the friend later finds a 3D renderer someone else wrote, they switch in the app's menu, and the realm cannot tell the difference.
7. **They leave.** The character keeps its signed high score, and the app's menu offers "More realms", starting with realms the maze links to.

## 4. Moving on to a realm made with a game engine

The friend, still in the browser with nothing installed, finds a realm made with Unreal.

1. **Finding it** works like any realm: a portal, the app's "More realms" menu, a friend's link, or a directory. The realm's manifest says how it can be played, and the app shows that as a badge: "Plays in browser", "Plays in browser · better in an Unreal-based app", or "Needs an Unreal-based app (1.2 GB)".
2. **If it has a browser renderer** (most will), they start playing at once with simpler graphics, and a button offers "Play in full Unreal graphics".
3. **Installing.** The browser shows a landing card (preview video, size, supported systems) and an install button that uses a store or package manager. If the realm owner pays for streaming, "Play now (streamed)" also appears.
4. **Handoff.** The installed app opens from a link such as `everygame://realm/<key>`, the way meeting links open a meeting app.
5. **Bringing the character.** Keys never move, so the browser gives the character to the installed app: the app makes a new key and the browser signs the transfer note. One tap.
6. **Playing.** The app fetches the realm's files by hash (portable code, models, scene description), connects to the referee and draws it with the engine. Every other realm built for that app now runs with no further installs.

A realm that ships its own app instead follows the same steps, except step 3 installs that app, after a plain warning that it runs outside any sandbox.

## Where things live afterward

- **The friend's character:** in their phone's browser, plus a character file or passkey backup if they chose one.
- **The realm's code:** on storage nodes and in every visitor's cache, found by hash.
- **The realm's official state:** with whoever referees (the creator's device or an authorized host), with encrypted copies on storage nodes.
