# Walkthrough: from launch to a friend playing

A concrete, step-by-step picture of how Endless Mind works in practice, using the [maze chase example](examples/maze-chase.md). The design behind it is in [DESIGN.md](DESIGN.md).

## 1. Launching the platform

There is no company system to switch on. Launching means making three things available:

1. **The code:** this repository, public under the MIT or Apache 2.0 license (the user's choice), with the documents in the public domain. It contains the server, the app and the agent guide.
2. **At least one server:** a small always-on machine (around $5 a month) with a web address such as `endlessmind.example`, running one command (`deno task start`); for a group of friends, any computer they already have will do. It serves the app page, keeps announcements and realm files, and relays messages between players.
3. **The agent guide:** a file any AI coding agent reads to learn how to build realms.

There is no user database and no accounts. On day one, "the network" is one server plus whoever opens it. It grows as other people run servers too.

## 2. Making a realm

The creator opens their AI agent in an empty folder and says: "Make a top-down maze where lantern spirits chase players who collect glowing seeds." The agent reads the [agent guide](AGENT-GUIDE.md) and writes three files:

| File          | What it is                                                                      |
| ------------- | ------------------------------------------------------------------------------- |
| `realm.json`  | Name, description, tags, and which file is the rules and which the renderer     |
| `rules.js`    | The realm's rules: entry, moves, the chasers, scoring, what each player sees    |
| `renderer.js` | The default renderer: draws a flat 2D maze and turns keys and swipes into moves |

A working version lives in this repository under `examples/maze-chase/`. Walls, seeds and the lantern spirits are all data in the realm's state, run by its rules.

**Publishing** is one button in the app ("Publish from files"):

1. A new key pair is created in the creator's browser. That key is the realm's identity.
2. Each file gets its hash (fingerprint).
3. The realm's key signs a manifest (a list of contents): name, tags and the file hashes.
4. The key, manifest and original file bytes are saved locally. Copies of the files are uploaded by hash, and the realm is announced on the chosen helper server.
5. The creator gets a link: `https://endlessmind.example/#emind:<realm address>?via=endlessmind.example`. The key names the realm; the `via` part says which server it is announced on.

**Refereeing:** the creator chooses **Start hosting** under **Your realms**, then opens its link to visit through the same session path as everyone else. Hosting continues while the creator browses other realms inside the tab. **Save full backup** carries the key, original files and committed realm data to another trusted app; loading it does not automatically publish or host. To keep it up with no browser at all, the creator gives the key file, or the realm's folder, to the host program (`deno task host`) on an always-on machine. A realm whose rules are private is always refereed this way (see [RUNNING.md](RUNNING.md)).

## 3. A friend plays

The friend taps the link on their phone.

1. **The trusted app opens the link:** one web page, no install. A player with an existing app can paste the link into **Open here**. Its server hint changes the connection, without moving the character secret.
2. **They get a character.** The app makes one with a random name and look, which the friend can change.
3. **The app fetches the realm's files** by hash from the server, checks each hash, and runs the renderer in a sandbox.
4. **The app asks the referee to let them in,** through the server's relay.
5. **The realm reads the character** (name, color, description) and makes an in-realm form: a runner in the friend's color.
6. **They play.** Swipes go from the app to the referee. The referee updates the state and sends each player their view. The phone draws it with the realm's default renderer. Any other renderer could draw the same views differently, and the realm could not tell the difference.
7. **They leave.** The app's "More realms" menu shows where to go next.

## Where things live afterward

- **The friend's character:** its secret is in their phone's browser, or in a key file if they saved one.
- **The realm's code:** original bytes in the creator's app, with public copies on the helper server, found by hash. (A realm with private rules uploads only its renderer.)
- **The realm's official state:** with whoever holds the realm's key and is refereeing (here, the creator's open tab, or a host program).
