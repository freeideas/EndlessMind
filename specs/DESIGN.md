# Endless Mind: design

What Endless Mind is, the decisions behind it, and why. The protocol outline is in [PROTOCOL.md](PROTOCOL.md), a step-by-step story in [WALKTHROUGH.md](WALKTHROUGH.md), and worked examples in [examples/](examples/).

## The idea in one paragraph

A new web: a worldwide network of living, AI-made places and programs, where both the code and the running of that code are spread across the people using it. Players describe realms (a game, a garden, a shop, a tool) and their own AI coding agents write the code. Code that runs on players' devices is public and sandboxed. A realm's rules run with whoever holds its private key, who alone can referee it or speak for it; the rules are usually public too, but may be kept private. Each realm's own code decides who may enter and what happens inside. Like BitTorrent for file sharing, there is no central server: helper servers are small programs anyone can run, and none is in charge. Anyone can make anything, and anyone can use it from a link. Games come first because they show the idea best.

## Words used here

- **Object:** anything with its own key: a character or a realm. The key is its identity, and whoever holds it speaks for it.
- **Realm:** an object with rules: a place, game or tool that visitors enter. Its referee runs the rules, which decide what happens inside. The design and protocol word.
- **Game:** an everyday word for something people play, usually with rules and goals. A game may be one realm or several linked realms, and not every realm is a game (a calm garden, a chat room, a hub full of doors).
- **World:** a friendly word, used only in plain-language and pitch text, for a realm you can walk around in.
- **Player:** always the person.
- **App:** the software a player uses to reach realms. The reference app runs in the browser; anyone may write another, in any language or engine.
- **Character:** the object that represents a player across realms: one secret plus a description (name, look). In each realm it acts under a separate key made from that secret. Its **in-realm form** is what the realm turns it into while inside.
- **Renderer:** code that draws a realm's views on a player's device and turns the player's input into moves. A file, found by its hash.
- **Referee:** whoever holds a realm's key and runs its rules, signing its official state.
- **Agent:** an AI coding agent that writes realms for its player.
- **Server:** an optional helper program anyone can run (finding realms, relaying messages, serving files and the app). Never in charge.

## Decisions

**What it is**

- **Not just games: a new web.** Games are the first and clearest use, but the network is for anything AI can make. AI-generated programs take the place of HTML pages.
- **Name: Endless Mind.** The project, the reference app and the protocol are all "Endless Mind". Links start with `emind:`, a technical prefix only, never a product name ("eMind" is crowded in AI software). It is presented as a platform, never as "a game", which also keeps it clear of an existing small game called *Endless mind*. The main address is endlessmind.com. The name is claimed through public use (Endless Mind™) and protected only against impostors, never against compatible software; see [TRADEMARK.md](../TRADEMARK.md).
- **The protocol is the network.** The Endless Mind protocol is a set of conventions (keys, signed messages, code found by hash), not an app or a server. Any program that follows them is a full peer. See [PROTOCOL.md](PROTOCOL.md).
- **The browser is the front door, not a requirement.** A realm with a browser renderer opens in a browser with one click, with no install, no account and no AI agent. Other apps, including ones built with game engines, may join the same realms by speaking the protocol (see "Apps beyond the browser"). Renderers are portable JavaScript (later also WebAssembly) so that any app can run them in a sandbox.
- **Freedom almost always wins over safety.** Anything should be possible. The sandbox is the safety floor: foreign code only ever runs sandboxed on a player's device, where it cannot do much harm, so the project adds few protections of its own.
- **Growth over control.** The goal is for Endless Mind to spread as fast as possible, even at the cost of the founder's control. Once it is popular, no one, including the founder, should be able to shut it down. The project's code and the protocol are fully open.

**Objects and keys**

- **Anything with a key is an object.** A character is a secret plus a description, with a key for each realm it enters; a realm is a key plus rules and files. The protocol treats both alike: an address and signed messages. All limits are set by realms' rules, never by the platform.
- **Keys, not code, decide who operates an object.** Anyone can run a copy of an object's public code, but only messages and results signed by its key are official. Running a copy without the key makes a different object (a fork).
- **The key is the object, wherever it is.** A private key is a 32-byte secret. Its holder can save it and carry it to any device, or to any server's copy of the app, at any time. Domain names and servers come and go, and people who dislike a realm can attack them; if the key alone can move an object anywhere, there is much less to attack.
- **Whoever holds a copy of the key is the object.** A copied key cannot be un-copied or revoked, so a key is guarded like a password. Backing up is saving the key; hosting on an always-on machine is putting the key there, with the host program.
- **A separate key in every realm.** The app makes the key a character uses in a realm from the character's one secret and that realm's address. A realm always sees the same address for a returning player, and no two realms see the same one, so realms cannot compare notes about a player by address. Known limits: a realm still sees whatever name and description the player sends, and a server can tell which addresses share one connection.
- **Ownership that matters is recorded by realms.** With no shared ledger, nothing can be handed over for everyone (a giver who copies a key still has it). Who has which sword, coin or score is realm state, signed by the realm and trusted by whoever trusts that realm. In-realm forms are realm state the same way, lent to visitors while they are inside.

**Realms and rules**

- **Realms enforce their own rules.** A realm's rules have the final say about what happens inside it. Worst case, a realm decides a visitor is no longer inside.
- **The referee runs all code that matters.** A remote device can claim to run any code, so code proves something only where the one who relies on it runs it. A realm's rules run on its referee; a renderer runs on a player's own device for that player alone. Visitors send only moves and receive views, so they never need the rules' code. A referee is a peer behind the message protocol: what it runs, and where, is its own business.
- **Code on a player's device is public; rules may be private.** Renderers are public, found by hash and sandboxed, so anyone can open any realm without trusting its author. With public rules (named as `main` in the manifest), anyone, in practice their agent, can read them before entering, and a browser tab holding the key can referee. With private rules the rules file is never uploaded, only the maker's host program referees, and visitors trust the realm the way they trust a website's server; the app tells a visitor when a realm's rules are private. Even public rules are a statement, not a proof: no visitor can check what a referee really runs. Private rules are a deliberate exception to openness, needed so a realm can use things that cannot be public or sandboxed, the main example being an AI model answering players.
- **A move can be a call.** A visitor's move (`emind.act`) can ask the rules for anything, and the answer comes back in the views. Rules run by the host program are not sandboxed, so they may take their time and use the network, files or an AI model, as [the listening well](examples/listening-well.md) does. Sandboxed rules answer at once, with no network.
- **There is no cheating, only rules.** Players may do anything their own software can do. Whatever a realm's rules allow is fair play; a realm that wants something prevented must design it so (see "Hidden information").
- **Every realm leads to more realms.** The app's own menu, outside any realm's control, always offers a way to find other realms, so no realm can trap a visitor.

**The project**

- **License: MIT or Apache 2.0, the user's choice; the specs in the public domain (CC0).** A copyleft license stops copying of the code but not rebuilding of the same features, so it protects little and slows growth. The Apache option adds an explicit patent grant from contributors, which matters for a protocol meant to be implemented everywhere. Contributions come in under the same terms (with a Developer Certificate of Origin sign-off), so no one, including the founder, holds extra rights.
- **Code: plain JavaScript, no build step.** The reference app, server, host program and example realms are plain JavaScript with type notes in comments (JSDoc), checked and run by Deno. The same shared code (keys, hashes, signed messages) runs unchanged in browsers and in Deno, and the app stays a few plain files anyone can copy or mirror.
- **Spending stays minimal.** The project earns nothing directly, so it relies on public, dated use to establish its name rather than paid registrations or lawyers. Realm creators can charge money separately, however they like; the platform takes no cut and plays no part.

## Rules by consensus, not by platform

- **Rules hold by consensus.** A rule exists because the software people choose to run follows it, the way the web works because browsers and servers follow the same conventions. No one can force a rule on anyone else's device, and no global agreement is needed: two peers only need to agree with each other.
- **The unavoidable minimum** is also consensus: key pairs, the message format, files named by hash, and the runtime interface realm code is written against. [PROTOCOL.md](PROTOCOL.md) describes it, including how the protocol gets new versions.
- **Defaults instead of requirements.** Things like the character description layout ship as defaults in the reference software. Anyone may ignore or replace them.

## Who decides what happened

If my character swings a sword and the sword's code runs on my device, I can lie about what it did. So:

1. **The realm is the referee inside the realm.** Its rules run on the referee's device. A sword-fighting realm keeps its own damage count for each visitor; visitors send only moves, which the rules judge. The realm's authority ends at its border.
2. **What happens after leaving belongs to the player.** A realm can throw you out, but it cannot reach your device or change your character.
3. **Things that cross realms carry signatures.** A realm's record ("this player won 12 fights here") is a statement signed by the realm. Another realm decides whether it trusts that statement. Value between realms comes from trust between realms, not from a central ledger.

**The official state wins.** The referee keeps the full state and sends each player their view after each tick. The referee is wherever the realm's key is: a creator's browser tab, or the host program on any machine. Its connection carries everything, so a home connection handles tens of players, not hundreds.

**Hidden information.** Anything sent to a player's app counts as seen by that player, whatever renderer they use. The referee sends each player only their share (no enemies behind walls, no other hands of cards), so no renderer can show it. Known limit: messages through a relay are signed but not encrypted to the receiver, so a relay's operator can read each player's view, hidden cards included. Encrypting sessions to the receiver would lift this.

## Keys in practice

- **Saving.** The key is the thing to keep. The reference app's "Save my keys" writes the character's and owned realms' keys into one JSON file, together with those realms' files, and "Load keys" brings them into any copy of the app. Known limit: the file is not locked with a passphrase, so anyone who gets it is those objects.
- **Moving a realm.** Load its key into the app on another device or another server, or give the key file to the host program, and referee it from there. The link stays the same apart from its server hint.
- **Two holders online at once.** If two connections prove the same key to one server, the most recent wins and the older one is told to stop. A referee that leaves gives its address up, so the realm shows as offline. Visitors who receive nothing for 15 seconds ask to enter again, so play resumes when a referee restarts or moves.
- **When no referee is online,** the realm's public files still exist, but nothing official happens until a key holder returns.
- **Moving to a stronger algorithm.** A key signs a note naming its successor key.

## How it fits together

| Piece             | What it is                             | Who owns it                | Where it runs            |
| ----------------- | -------------------------------------- | -------------------------- | ------------------------ |
| **The app**       | Opens links; runs everything else      | Its author                 | Browser or any device    |
| **Character**     | Your name, look and description        | Whoever holds its secret   | Wherever its secret is   |
| **Realm**         | A place or game: rules and referee     | Whoever holds its key      | Rules on the referee     |
| **In-realm form** | Your character as that realm shows it  | The realm, lent to you     | Realm state              |
| **Renderer**      | Turns the realm's state into a picture | Its author; you pick it    | Your app, sandboxed      |

**The app** holds your keys, keeps each piece of foreign code in its own sandbox, opens links, sends realms your character's description, and owns the menu that is always there. A server that serves the app page could take the keys that page holds, not just use them, so players should get the app from a server they trust or keep a local copy.

**State is separate from the picture.** A realm never draws anything itself; its rules produce each player's view as plain data ("maze grid, walls here, runner at 4,7, score 120"). It ships a default renderer, and anyone can write another that reads the same data; the realm cannot tell the difference. A renderer is also a controller: it turns whatever the player does into moves ("move left"), which the rules judge like any other move. A renderer sees only what its player is sent, so it cannot reveal hidden information, and players can swap renderers freely.

## Joining with one click

Playing needs only a link; agents are for making things.

1. Open the link; the app loads from the server in the link (or from a copy the player keeps).
2. The app finds the player's character, or makes one in about a second (random name and look, editable later).
3. If the realm is not announced on that server, the app offers to open it on a server named in the link's hints.
4. The app fetches the realm's files by hash, checks them, runs the renderer in a sandbox, and asks the referee to let the character in.
5. The realm's rules read the character's description (name, color, a sentence such as "a small fox knight who carries a lantern"), use what they understand, and make an in-realm form.
6. The player acts, the referee updates the state, the renderer draws each new view.

No realm code is ever added to the character, so a hostile realm cannot damage it.

## Finding realms

- **Realms announce themselves on servers,** signed by the realm's key, with tags ("maze"). Each server keeps what it is sent. Servers do not talk to each other and there is no shared lookup table, so an address alone does not say where a realm is: links carry the servers where it is announced as hints.
- **The app's "More realms" menu** searches the current server by tag and shows which realms are online.
- **Anything else is built by others:** doors and portals inside realms, directories, curated lists. None is official.

## Running in the browser: limits to design around

A browser tab can referee realms whose keys it holds. Browsers cannot accept incoming connections, so all traffic goes through a server's relay over WebSocket.

- **Only alive while the tab is open.** Phones suspend background tabs almost at once; desktops slow down background timers. To stay up, a realm runs under the host program on an always-on machine instead (see [RUNNING.md](RUNNING.md)).
- **Storage can be wiped.** Clearing site data deletes the keys, and with them every object in that browser, unless they were saved with "Save my keys".
- **Isolation.** Code in ordinary workers shares the page's storage and could read its keys, so foreign code runs in sandboxed frames with their own blank origin (a browser security boundary). The app page's content security policy forbids frames from loading web addresses (`frame-src 'none'`), so sandboxed code cannot navigate its own frame somewhere and gain the network. Known limit: browsers offer no dependable way to switch off WebRTC (direct connections) inside a frame, so sandboxed code may still be able to send data out that way.
- **Known limit: runaway code.** Realm code stuck in an endless loop can freeze the page in some browsers. Metering and stopping it is not built.

## Apps beyond the browser

The browser app is one app among any number. A realm's referee and its visitors are peers behind the message protocol, so any program, in any language or engine (Unreal, Godot and others), can take either part by speaking it.

- **What a peer must speak:** keys and addresses, canonical JSON, signed envelopes, the relay over WebSocket, the server's HTTP routes, and the enter, act and state messages ([PROTOCOL.md](PROTOCOL.md), [RUNTIME.md](RUNTIME.md)). [test-vectors.json](test-vectors.json) lets an implementation in any language check itself.
- **It works without a browser:** the host program is a working referee and `tests/host_test.js` a working visitor, neither using a browser. No game engine plugin exists in this repository.
- **What the manifest offers:** `renderer` is optional, and `app` names the realm's own app (a name and an https address where players get it). Opening a realm with no browser renderer, the browser app says it cannot be played in a browser and shows the app's name and link, warning that an installed program runs outside any sandbox.
- **A typical engine realm:** a server built with the engine holds the realm's key and referees, its rules private and in the engine's own language, and the engine-built app is the visitor.
- **Known limit: speed.** Every message passes through a relay and carries its own signature, which is too slow for fast action games. The message format allows an engine realm to use the enter and welcome messages for identity and entry, then carry its own fast traffic itself: the welcome message's body can hold whatever its app needs, such as where to connect.

## The server: a small program anyone can run

Simple enough that anyone can clone this repository and run their own server with one command.

- **What it does:** keeps signed announcements and answers tag searches, says who is online, stores files by hash, relays signed messages between connections that have proved their keys, and serves the app page. One server is all a group of friends needs.
- **What it cannot do:** forge anything it stores or relays, since everything is signed by the key that wrote it or named by its hash. It holds no realm state and makes no rules. A bad or dead server is one you stop using.
- **What it can do:** read what passes through its relay (messages are signed, not encrypted to the receiver), and, if it serves the app page, take the keys that page holds. The server that serves the app is trusted like any software you run.
- **Size target:** a few hundred lines. Growing past that is a sign realm rules are leaking in.

## Safety and law

- Safety has no central moderator, so it lives on each person's side: their agent can read a realm's public code and warn them, and their app decides what it runs.
- Like the web, the protocol cannot enforce law centrally. Each person is responsible for what their own realms do, and each server operator for what their server stores and lists. "No single point of failure, like email", never "built to escape authorities".

## Original work only

Endless Mind is a tool for making original things. The project never suggests, shows or encourages copying anyone else's game, characters, names, art, music or other protected work, in its docs, examples, demos, code or promotion.

- **Examples are technical and original.** They use invented names and generic kinds of realm ([a large city](examples/city.md), [a world made of blocks](examples/block-world.md), [a maze chase](examples/maze-chase.md), [a well that answers](examples/listening-well.md)) to explain how the system works, not how to recreate an existing product.
- **The agent guide steers agents toward original work.** It tells agents to build original designs and to decline to copy another product's names, characters, art, music, logos or level designs, suggesting an original alternative instead.
- **Each builder is responsible for what they build** and must hold the rights to what they publish.
- **The project runs no official network.** It provides software; people who run servers are responsible for operating them.

## Current state

Two people on two devices play the [maze chase](examples/maze-chase.md) through one small server. The host program referees realms with no browser, including the [listening well](examples/listening-well.md), whose private rules ask an AI model. Code: `app/` (the browser app), `shared/` (keys, hashes, signed messages, the relay client and the referee loop), `server/` (the helper server), `host/` (the host program), `examples/` (realm files) and `tests/`. How to run it is in [RUNNING.md](RUNNING.md); the calls realm code can make are in [RUNTIME.md](RUNTIME.md); the guide agents read is [AGENT-GUIDE.md](AGENT-GUIDE.md).

**Needed before a public launch:** locking the key file with a passphrase, publishing new versions of a realm under the same key from the browser app (the host program does this), server limits and takedown support (a contact field and takedown lists), a test of the agent guide by an agent with nothing else to go on, and an always-on server.

**Success test:** two people on two machines, each with their own AI agent, each build something the other did not foresee, and they see each other meet.
