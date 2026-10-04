# Endless Mind: design

What Endless Mind is, the decisions behind it, and why. The protocol outline is in [PROTOCOL.md](PROTOCOL.md), a step-by-step story in [WALKTHROUGH.md](WALKTHROUGH.md), and worked examples in [examples/](examples/).

## The idea in one paragraph

A new web: a worldwide network of living, AI-made places and programs, where both the code and the running of that code are spread across the people using it. Players create realms and objects (a body, a weapon, a pet, a cloud of dust, a shop, anything), and their own AI coding agents write the code. The code is public and anyone can run it, but only the holder of an object's private key can operate it or speak for it. An object can enter a realm if it implements what the realm requires (a sword-fighting realm might require a damage count and a `die` function; another might require `kiss` and `caress`). Like BitTorrent for file sharing, it is a peer network with no central server: helper servers are small programs anyone can run, and none is required. Anyone can make anything, in any language or engine, and anyone can use it from a link. Games come first because they show the idea best, but it is for shops, tools, places and whole universes too.

## Words used here

- **Object:** the only building block, a key pair plus code. Everything below except the player, the app and servers is an object.
- **Realm:** an object acting as a container: it holds other objects and sets and referees the rules inside it. Not a separate kind of thing, only a way an object behaves. The design and protocol word.
- **Game:** an everyday word for something people play, usually with rules and goals. A game may be one realm or several nested or linked realms, and not every realm is a game (a calm garden, a chat room, a hub full of doors).
- **World:** a friendly word, used only in plain-language and pitch text, for a realm you can walk around in.
- **Player:** always the person.
- **App:** the software a player uses to reach realms. The reference app runs in the browser; anyone may write another, in any language or engine. A **shared app** runs many realms; a realm's **own app** runs only that realm.
- **Character:** the object that represents a player across realms. Its **in-realm form** is what the realm turns it into while inside.
- **Renderer:** an object that draws a realm's state and may offer controls.
- **Referee:** whoever signs a realm's official state: its key holder, or a host the key holder authorized.
- **Agent:** an AI coding agent that writes realms and objects for its player.
- **Server:** an optional helper program anyone can run (meeting, relaying, storage). Never in charge.

## Decisions

**What it is**

- **Not just games: a new web.** Games are the first and clearest use, but the network is for anything AI can make. AI-generated programs of any kind take the place of HTML pages.
- **Name: Endless Mind.** The project, the reference app and the protocol are all "Endless Mind". Links start with `emind:`, a technical prefix only, never a product name ("eMind" is crowded in AI software). It is presented as a platform, never as "a game", which also keeps it clear of an existing small game called *Endless mind*. The main address is endlessmind.com. The name is claimed through public use (Endless Mind™) and protected only against impostors, never against compatible software; see [TRADEMARK.md](../TRADEMARK.md).
- **The protocol is the network.** The Endless Mind protocol is a set of conventions (keys, signed messages, code found by hash), not an app or a server. Any program that follows them is a full peer: the reference browser app, a program written from scratch in JavaScript or Rust, or one built with an engine such as Unreal, Godot or Unity. See [PROTOCOL.md](PROTOCOL.md).
- **The browser is the front door, not a requirement.** Every realm link opens in a browser with one click, but other apps (built with a game engine, a native desktop app, the headless host runner) can join the same realms. See "Other apps, languages and game engines".
- **Freedom almost always wins over safety.** Anything should be possible. The sandbox is the safety floor: foreign code only ever runs sandboxed (in a web page, or in a JavaScript or WebAssembly sandbox inside another app), where it cannot do much harm to a player's machine, so the project adds few protections of its own.
- **Growth over control.** The goal is for Endless Mind to spread as fast as possible, even at the cost of the founder's control. Once it is popular, no one, including the founder, should be able to shut it down. Code and rules are fully open.

**Objects and keys**

- **There is only one kind of thing: the object.** An object is a key pair (its identity) plus code. Players can make as many as they like, and any object can contain any number of other objects. Bodies, realms and swords differ only in their code. All limits are set by code, never by the platform.
- **Keys, not code, decide who operates an object.** All code is public and anyone can run any object, but its code obeys only commands signed by its key, and only results signed by its key (or by a host it authorized) are official. Ownership is simply proof of holding the private key. Running a copy without the key makes a different object (a fork).
- **A key pair lives on exactly one device.** Browsers can create keys that a page can use but never export, so this holds unless someone deliberately works around it. Giving an object creates a new key pair on the receiver's device. A player can have any number of devices; moving an object between them is giving it to yourself.
- **Secrets are optional encrypted parts.** An object may keep some code or data encrypted. Encrypted parts run only where the key is, or on a host the owner trusts with them.
- **No built-in "player".** The system knows only objects and devices. A player who wants to be recognized across devices can make a "self" object that claims their other objects, each claim signed by the claimed object's key.
- **No rarity.** Anyone can make any object.

**Realms and rules**

- **Realms enforce their own rules.** The containing object has the final say about what happens inside it, and its referee decides outcomes that involve several devices (my lent sword strikes a visitor in your realm). Worst case, a realm decides an object is no longer inside.
- **Enforcement is each realm's choice.** Some realms run on the honor system (every player's copy decides for itself); others have a referee sign the official state. What happens when no referee is online (freeze, carry on unchecked, or hand refereeing to a stand-in) is up to the realm's code.
- **Everything needed to judge is visible, both ways.** Visitors (in practice, their agents) can read all of a realm's code and see which parts are encrypted; a realm can do the same with any visiting object. Since code is identified by its hash, approved code is admitted instantly next time.
- **No named contracts.** The platform enforces no shared vocabulary of functions. Every object can examine every other object's API (its callable functions and their code) and decide for itself, as shallowly or deeply as it likes. Where code runs (public, encrypted, hosted by whom) is likewise the author's choice.
- **There is no cheating, only rules.** Players may do anything their own software can do. Whatever a realm's rules and referee allow is fair play; a realm that wants something prevented must design it so (see "Hidden information").

**Using it**

- **One click to play.** For any realm that offers a browser version (most will), anyone can open its link and start playing at once, with no install, no account and no AI agent.
- **Every realm leads to more realms.** From inside any realm, a player can always find other realms (see "Finding realms").
- **Links are neutral.** A realm's link is its key, like a BitTorrent magnet link, so any app can open any realm and no website or company owns the link. The canonical form is `emind:<address>`; the form people share is `https://<any server>/#emind:<address>`. See "Version 0 formats" in [PROTOCOL.md](PROTOCOL.md).
- **Custom renderers and controls are a headline feature.** Anyone can write a renderer (make plain state look fantastic, show a 2D game in 3D) and controls suited to a kind of play (custom keys, joysticks, brain-computer interfaces). Renderers are objects, traded like any other.
- **Unused things fade away.** Nothing is stored forever by default; data lives only while someone keeps a copy. See "Where things are saved".
- **Realm creators can charge money,** separately and however they like. The platform takes no cut and plays no part.

**The project**

- **License: MIT or Apache 2.0, the user's choice; the specs in the public domain (CC0).** A copyleft license stops copying of the code but not rebuilding of the same features, so it protects little and slows growth. The Apache option adds an explicit patent grant from contributors, which matters for a protocol meant to be implemented everywhere. Contributions come in under the same terms (with a Developer Certificate of Origin sign-off), so no one, including the founder, holds extra rights.
- **Code: plain JavaScript, no build step.** The reference app, server and example realms are plain JavaScript with type notes in comments (JSDoc), checked and run by Deno. The same shared code (keys, hashes, signed messages, realm rules) runs unchanged in browsers and in Deno, and the app stays a few plain files anyone can copy or mirror.
- **Spending stays minimal.** The project earns nothing directly, so it relies on public, dated use to establish its name rather than paid registrations or lawyers.

## Rules by consensus, not by platform

- **Anything is possible.** The platform forbids nothing it does not have to.
- **Rules hold by consensus.** A rule exists because the software people choose to run follows it, the way the web works because browsers and servers follow the same conventions. No one can force a rule on anyone else's device. Unlike Bitcoin, no global agreement is needed: two objects only need to agree with each other to interact.
- **The unavoidable minimum** is also consensus: the message format, key pairs, and how an object's API is published. Software that does not follow them simply cannot talk to the rest. [PROTOCOL.md](PROTOCOL.md) describes it, including how the protocol gets new versions.
- **Defaults instead of requirements.** Things like a basic way to describe position and looks ship as defaults in the reference software. Anyone may ignore or replace them; they stay useful only while most people keep using them.

## Core model

- **Object.** A key pair (its identity) plus code (its behavior and state). A body, a sword, a house, a planet, a swarm, a universe are all objects with different code.
- **Containment.** Any object can contain other objects, to any depth (a room inside a ship inside a galaxy; tiny creatures living in your coat). An object that contains others acts as their realm: it runs the rules and the shared space for what is inside it.
- **Owner.** Whoever can prove they hold an object's private key. That device (or a host it authorizes) signs the object's official results and runs its encrypted parts.
- **API.** What each object exposes to others: its public key, its callable functions and their code (with any encrypted parts marked), and its look. Anyone can read it.
- **Entering.** An object asks to enter a realm. The realm examines the object's API and decides; the object may examine the realm's API first. If the realm says no, the visitor's agent can read why (or read the realm's code) and offer to add what is missing ("This realm wants objects that can take damage and die. Want me to add that? About 30 seconds.").

## Containment and locality

- **Every object is inside a realm,** except each player's own top-level realms. A player can build their own realm, fill it with their own objects, and play alone.
- **Unwanted objects stay home.** If no one admits your object, it can only live in one of your own realms. Rejection needs no platform enforcement: it is simply not being admitted.
- **Realms affect each other only through a shared container.** Two realms interact only when both are inside the same containing realm, which referees that interaction. Like locality in physics: nothing acts at a distance.
- **Messages go anywhere.** Locality applies to effects, not messages. Any object can message any other object and ask to enter any realm directly.

## Protecting yourself: allow lists of code

- **Lists are about code, not keys.** Keys cost nothing to make, so judging by key is pointless.
- **Every container keeps an allow list of known-good code hashes.** An object whose code hash is on the list is let in automatically. An object not on the list asks; the container runs its own admission code (and perhaps asks its owner or its owner's agent) to decide whether to add the hash. When an owner changes an object's code, its hash changes, so it asks again. An open container can allow everything.
- **Admission is normally decided by the container's referee,** because a copy running on the requester's own device could fake a yes. A container that does not care (honor system) can let each copy decide.
- **Players can do the same.** A player's app can keep its own allow list (plus a block list) and draw nothing else. Lists can be shared and subscribed to, like ad-blocker filter lists; none is official.
- **Limit:** the hash covers the public code and the API, not what an object's encrypted parts do.

## Who decides what happened?

If I swing a sword at you, my code runs on my device and yours on yours, and anyone can lie. The answer:

1. **The realm is the referee inside the realm.** It runs the physics and the rules, and checks that every object inside follows them. A sword-fighting realm keeps its own damage count for each visitor and calls `die` when the count runs out. If a visitor's code refuses to die, or reports things the rules do not allow, the realm can declare that object no longer inside. The realm's authority ends at its border.
2. **What happens after leaving belongs to the object and its owner.** A realm can throw you out, but it cannot reach your device. Your object's own code decides what leaving means: back home, a ghost, a scar, nothing at all.
3. **Things that cross realms carry signatures.** A realm's record ("this player won 12 fights here") is a statement signed by the realm. Another realm decides whether it trusts that statement. Value between realms comes from trust between realms, not from a central ledger.

**Single-player games need no host.** All code is public, so a single-player game runs entirely in the player's app once its files arrive, even offline. Without the realm's key, the player's copy cannot sign results, so scores are not trusted elsewhere unless the moves are sent to the realm's referee to check and sign.

**Shared state in multiplayer: the official state wins.** Every player's app can predict the state so play feels instant; when the official, signed state arrives, it wins and the app corrects itself. The referee is whoever holds the realm's key or an authorized host (a creator's browser tab, a friend's always-on machine, a paid host). A realm picks one of two ways to share the work:

1. **The host keeps the full state** and sends updates. Simplest, and handles hidden information, but the host's connection carries everything (tens of players on a home connection). The reference app uses this today.
2. **The host only puts moves in order** (lockstep). Every app runs the same public realm code on the same ordered moves and reaches the same state, so the host's work is tiny. Everyone has the full state, so hidden information needs the tools below.

Slow, turn-based games (chess, cards between friends) can skip the host: players sign their own moves and each app checks every move against the rules.

**Hidden information.** Anything sent to a player's app counts as seen by that player, whatever renderer they use. Realms keep secrets by:

- **Sending each player only their share.** The host never sends what a player may not see (enemies behind walls), so no renderer can show it.
- **Encrypting a secret to its owner.** A card dealt to a player travels encrypted to their key, even in lockstep games.
- **Commit now, reveal later.** A player publishes a hash of a hidden choice, proving it is fixed without revealing it, and reveals it at the end for everyone to check. Works with no host at all.

A realm cannot enforce which renderer a player uses, since an app can claim anything. That is fine: anything the rules and referee allow is fair play.

## Objects, ownership, and code that changes hands

What matters is not rarity but **who can operate an object and speak for it**.

**Three layers of every object:**

- **Public code.** Anyone can fetch it, read it and run it. It gives speed (a sword swing looks instant), lets single-player games run with no host, and lets anyone remix it.
- **Signed commands and results.** An object's code obeys only commands signed with its key, and only results signed by its key (or an authorized host) are official. Anyone can run and watch my character; only I can steer it.
- **Encrypted parts (optional).** Secret rules, hidden answers, private notes. Whoever runs code can see it, so encrypted parts run only on the key holder's device or a host they trust with them.

**Hosting by permission.** An owner signs a note: "this machine may host my object until December." A volunteer or paid host then runs the official instance, signing results under that permission, while the owner's device is off. No private key moves.

**When no official host is online,** the public code still runs everywhere, so an object degrades rather than vanishes: a lent sword still looks and swings like a sword, but anything needing its key (signed results, encrypted parts, special powers) waits until the owner or a host is back. Likewise, visitors can still see and even play a realm's public code, but nothing is official until a referee returns.

**The private key is what makes an instance "the real one".** Without it, a copy's answers carry no valid signature, so no one treats it as that object. A copy can only become a new object with a new key (a fork, credited through the signed history). A key leaves its device only as an encrypted backup the owner chooses to make (see "Where things are saved").

**Lending.** I let you use my object. Its public code runs on your device; its official results and encrypted parts come from me or my host.

**Giving.** When I give you an object:

1. Your device generates a brand-new key pair for it. No private key is ever transferred.
2. The transfer sends you any encrypted parts, re-encrypted for your key (you already have the public code).
3. From then on you operate the object. You can copy it, change it, or give it away.
4. My old key signs a note, "object X (my key) is now object Y (your key)", so anyone can follow the object's history.

**Realm-owned objects** follow the same rules, decided by the realm's code: a realm can lend weapons to visitors while they are inside, or give one away outright.

**Safety of received code.** Running any object means running someone else's code. The sandbox it runs in keeps it away from the rest of the machine, and each object gets its own sandbox so it cannot interfere with another or read keys (see "Running in the browser"). A player's agent can read any code before running it.

## How it fits together

Five pieces. Everything is an object except the app, which is any program that speaks the protocol.

| Piece             | What it is                             | Who owns it             | Where it runs            |
| ----------------- | -------------------------------------- | ----------------------- | ------------------------ |
| **The app**       | Opens links; runs everything else      | Its author              | Browser or any device    |
| **Character**     | Your identity, look and feel           | You                     | Anywhere; you operate it |
| **Realm**         | A place or game: rules, map, referee   | Its creator             | Anywhere; referee by key |
| **In-realm form** | Your character as that realm shows it  | The realm, lent to you  | Anywhere; realm referees |
| **Renderer**      | Turns the realm's state into a picture | Its author; you pick it | Your app, sandboxed      |

**The app** holds your keys and saved data, keeps each piece of foreign code in its own sandbox, opens links, hands the realm your character's general API and receives your in-realm form, and owns the menu that is always there (find more realms, change renderer, edit character, leave).

**Renderers: state is separate from the picture.** A realm never draws anything itself; it publishes its state as plain data ("maze grid, walls here, runner at 4,7, score 120"). It ships a default renderer, and anyone can write another that reads the same data. The realm cannot tell the difference.

- **A renderer is an object** with a code hash, so renderers can be shared, traded, remixed and put on allow lists.
- **A renderer is also a controller.** It can offer its own controls (keyboard layouts, combo actions, gamepads, motion or gesture control, MIDI instruments, brain-computer interfaces through a small local bridge program) and turns whatever the player does into realm terms ("move left", "cast at cell 4,7").
- **The realm still decides.** A renderer's actions are only requests, judged by the realm's rules like any other move.
- **A renderer sees only what the player is sent,** so no renderer can reveal hidden information. That is what lets players trade renderers freely without realms approving them.
- **Shared state layouts let one renderer draw many realms.** Realms that describe their state in the default layout (positions plus the simple look format below) can all be drawn by any renderer that understands it. A default, not a requirement.
- **The app helps people find renderers:** those others use with this realm, and those that understand its state.

**Input is handed out by the app.** Mouse, keyboard, touch, controller, camera, microphone and other devices are available to any object that wants them, renderers included. The app is the gatekeeper:

- Camera, microphone and special devices are ask-first, per object ("The lantern wants to use your camera. Allow?").
- Keyboard and mouse go only to the object the player is interacting with (normally the active renderer), so no object can record a passphrase typed elsewhere.

**Looks.** A realm may restrict looks (in a realm of ghosts everyone is translucent), and a player's renderer may simplify anything (everyone as a colored shape). The default look format is a tiny set of 3D primitives (boxes, spheres, cylinders, colors, grouped together), which an agent can write by hand in seconds, plus standard 3D model files (glTF, the common web format for 3D models).

## Joining with one click: characters and in-realm forms

Most people have no AI agent, so using a realm must not need one. Agents are for making new things; playing needs only a link.

1. Open the link; the app loads (from any mirror).
2. The app finds the player's character, or makes one in about a second (random name and look, editable later). It is an ordinary object, not a built-in "player".
3. The app fetches the realm's code and default renderer, sandboxes them, and connects to the realm's referee if it has one.
4. The realm reads the character and lends the player an in-realm form.
5. The player acts, the realm updates its state, the renderer draws it.
6. On leaving, the character keeps whatever the realm signed for it, and the menu shows where to go next.

- **Characters publish a general API** that any realm can read: name, look, a plain-language description ("a small fox knight who carries a lantern"), and what it has earned or carries. The reference app ships a default layout for this; anyone may extend or ignore it.
- **Each realm makes an in-realm form of each visitor** from that general API (a runner in a maze, a driver in a city). The realm owns the form and lends it while the visitor is inside, so the realm stays a fair referee.
- **The character itself is never changed by a realm.** No realm code is added to it, so a hostile realm cannot damage it. Anything earned comes back out as statements signed by the realm, and the character's own code decides whether to keep them.
- **Mixing at the door happens at three levels:**
  1. **The realm's own code, automatically.** Entry code maps what it understands from the character (look, name) and ignores the rest. Instant and free, so it covers one-click players with no agent.
  2. **The player's own agent, for a better fit.** It writes a custom adapter for that realm ("make my lantern scare the chasers"). The realm checks the adapter like any visiting code and remembers its hash once approved.
  3. **The realm's AI, optionally.** A realm owner can pay for AI translation of unusual characters at entry.
- **Adapters spread by use.** Since code is identified by its hash, a realm can accept adapters written for other realms. Popular ones (a common way to walk, to take damage, to carry things) become shared habits without any platform standard.

## Finding things

**Finding any object.** A single master list of every object would be huge (100 million players with 1,000 objects each is 100 billion entries) and exactly the kind of central thing this project avoids. Instead:

- **Only what wants to be found is listed.** Public realms and players' "self" objects announce themselves; objects inside a realm are reached through that realm.
- **Addresses work like email.** An object is found by its public key plus the servers where it announces itself. Each device announces its findable objects, signed by each object's key; servers keep what they are sent; directories gather and index it. No one holds everything, yet anything findable is reachable.
- **For scale, a shared lookup table spread across participants** (a distributed hash table, as BitTorrent uses) can hold many millions of entries without any central list. Native apps can join it directly; browsers cannot, so a browser searches through a helper server or a connected peer.

**Finding realms: three ways.**

1. **Inside a realm.** Doors, portals and links the realm's designer chose (a door that opens only after you win, a portal to a friend's realm). Entirely up to the realm.
2. **The player's app.** Its own menu, always there and outside any realm's control: realms friends visited, realms busy right now among connected peers, and searches by tag. A realm cannot trap a visitor or hide the way out.
3. **Outside directories and published lists.** Search services, curated lists, and hub realms (a place you walk around in, with doors to recommended realms). The project does not run these; others build them, the way torrent search sites appeared. None is official.

The project provides only what makes 2 and 3 possible:

- **Signed announcements with tags.** A torrent-style lookup table finds things by exact key, not by keyword, so a tag's key is the hash of the tag ("maze"), and realms announce under it. Ranking and full-text search come from directories and lists.
- **A simple standard format for published lists,** so any app or directory can read and subscribe to them.
- **Default subscriptions in the reference app.** A brand-new player has no friends and no directory, so the app ships with a few default lists and directories the player can change or remove, as BitTorrent apps ship default servers.

Anyone can announce anything, so raw tag results will be noisy; curated lists, allow lists and directories are how players filter, and with no single ranking, no one controls what gets seen.

## Walled gardens

Businesses with many realms will likely make their own apps that try to keep people inside. Freedom allows this: such an app may show only its own realms, admit only characters made in it, and leave out any way onward. The defense is not forbidding gardens but keeping leaving cheap and the open side bigger, which is how the open web beat AOL:

- **Neutral links.** Any realm link opens in any app, so a friend's link always works outside a company's app. The most important defense.
- **Characters belong to the person.** Keys and the character file live on their device. A company app might refuse to export them, so the open app makes export easy and visible, and people learn to expect it.
- **The open app is the front door.** Every realm that offers a browser version opens with nothing installed, so a company app is always optional.
- **Other people's doors.** A company controls its own realms, not anyone else's, and creators who want visitors link widely.
- **Outside directories and lists** reach people before and outside any company's app.

**The limit:** a company with great realms could still become dominant. A protocol cannot prevent that; it can only make leaving easy. Email is the model: one provider can be huge, yet anyone can still leave or run their own.

## Where things are saved

| What                                             | Where                                                   |
| ------------------------------------------------ | ------------------------------------------------------- |
| Character (keys, name, look, feel, its own code) | Player's app; a character file and/or encrypted backup  |
| What a character has earned                      | Signed statements, kept with the character              |
| Realm state                                      | The referee's device; encrypted copies on storage nodes |
| Code (realms, renderers, adapters, assets)       | Found by hash, cached; any holder can serve it          |
| Settings (renderer choice)                       | Player's app                                            |

**Saving a character, two ways:**

1. **Save as file** (always available). Encrypted, locked with a passphrase, holding everything unique to the character. A default character is a few KB (shared code is referenced by hash), small enough to email or turn into a QR code; a customized one can be several MB. The file can include shared code too, so restoring never depends on the network.
2. **Automatic backup** (optional convenience). Encrypted, unlocked with a passkey (the fingerprint or face login phones and computers already sync), stored on storage nodes. Restoring on a new device takes one tap.

Both let a key leave its device as an encrypted backup, which freedom allows with a clear warning. The backup exists because people lose files and forget passphrases.

**Unused things fade away.** Data lives only while someone keeps a copy:

- Each device keeps its own objects plus a cache of recently used things, cleared when space runs low.
- Storage nodes keep data for a set period (for example 90 days) unless the owner renews it, with a size limit per key.
- Announcements expire unless renewed.
- Identical assets are stored once, since they are named by their hash.

Owners keep their own things; fans, hosts or creators can pin (promise to keep) anything; anyone may run an archive. Forgotten realms are lost unless someone cared to keep them, which fits "ruins and sealed doors".

## Running in the browser: limits to design around

A browser tab can act as a referee for the objects it owns. Browsers cannot accept incoming connections, but they can connect directly to each other (WebRTC, as video calls use) after meeting through a small server; when that fails, traffic goes through a relay. Limits:

- **Only alive while the tab is open.** Phones suspend background tabs almost at once; desktops slow down background timers. Anything meant to stay up (a public realm, a lent object used by many) needs an always-on host: the same object code run by Deno, the reference headless runtime, on a machine holding the owner's hosting permission.
- **Direct connections sometimes fail.** Some home routers and most mobile carriers block them, so traffic must be relayed through a server, which costs that server bandwidth.
- **A home connection can host only so many visitors.** Tens in a busy realm is realistic; hundreds is not. This applies to any player-hosted design.
- **Storage can be wiped.** Clearing site data deletes the private keys, and with them ownership of every object on that device. The character file and automatic backup in "Where things are saved" address this. A page can ask the browser to mark its storage "persistent" so it is not cleared automatically when space runs low.
- **Isolation needs care.** Code in ordinary workers shares the page's storage and could read its keys. Foreign code must run in sandboxed frames with their own blank origin (a browser security boundary).

## Other apps, languages and game engines

People will make realms every way there is: from scratch in JavaScript or Rust, with engines such as Unreal, Godot or Unity, or with tools that do not exist yet. The browser stays the front door, but nothing depends on it.

- **Object code must stay portable:** JavaScript or WebAssembly (compiled code that runs at near-native speed in browsers and elsewhere). C++, C#, Rust and others compile to WebAssembly. This is what keeps every realm usable from a browser link.
- **Renderers and apps may be native.** An Unreal, Godot or Unity app can join any realm and draw it with full engine graphics, since it speaks the same protocol.
- **Native code is never passed around as an object.** A native app is installed deliberately by the player, like any app. Objects stay JavaScript or WebAssembly, so the sandbox remains the safety floor.
- **Each app does the browser's jobs too:** keeps private keys on the device (in the operating system's secure key store), runs each foreign object in its own sandbox, and asks first before giving any object camera, microphone or device access.
- **Shared apps, plus apps of a realm's own.** Both exist side by side:
  - **Shared apps (the default).** Apps that run many realms, for example one built with Unreal, one with Godot, one written from scratch in Rust. Anyone can write one; none is official. Installed once, it runs every realm built for it, because realms ship only data (models, sounds, scene descriptions) and sandboxed JavaScript or WebAssembly. The engine supplies graphics, physics and audio; the realm's behavior is in its portable code.
  - **A realm's own app (allowed).** A builder who needs more than a shared app offers (for example Unreal's own C++ or Blueprints, its visual scripting) can ship a separate app for their realm. It runs outside any sandbox, so the app warns plainly before install: "This realm needs its own app, which can do anything on your computer."
- **The manifest says how a realm can be played** (in the browser, in a shared app, or only in its own app), so apps and directories can show it before anyone clicks.
- **Engine-made 3D models** come in as glTF files, which all these engines export.
- **Unreal in a browser:** Unreal no longer runs in web pages, but its Pixel Streaming can run it on a server and stream video to the page, at the realm owner's cost.

**Why this is easy in each engine.** Everything a native app needs exists as an embeddable library with a C interface, so one small core library (protocol, signatures, sandbox) can be written once and wrapped thinly for each engine. A native app can start with WebSocket only, through a server's relay.

| Need               | Library     | Unreal (C++)   | Godot      | Unity (C#)          |
| ------------------ | ----------- | -------------- | ---------- | ------------------- |
| Talk to servers    | WebSocket   | Built in       | Built in   | Built in or package |
| Direct connections | WebRTC      | libdatachannel | Plugin     | Unity WebRTC        |
| Signatures         | libsodium   | Yes            | Plugin     | Yes                 |
| Run JavaScript     | QuickJS, V8 | PuerTS         | GodotJS    | PuerTS, Jint        |
| Run WebAssembly    | Wasmtime    | Yes            | godot-wasm | Wasmtime .NET       |

## The server: a small program anyone can run

Simple enough that anyone can clone this repository and run their own server with one command.

- **Helpers, not a center.** Servers help peers meet, relay for peers who cannot connect directly, and store copies, like trackers and seeders in BitTorrent. Realm traffic goes peer to peer whenever it can. Browsers need at least one reachable helper to meet; native apps can also find each other through the shared lookup table. A realm may run its own server, but the network never needs one.
- **Optional roles, each switched on by its operator:** **finder** (signed announcements, who is online), **relay** (pass messages between peers who cannot connect directly), and **storage** (keep files by hash and signed, encrypted data, with a size limit per key). Saved state is encrypted with its owner's key, so storage nodes cannot read it, and signed, so they cannot fake it.
- **It cannot cheat.** Everything it stores is signed by the key that wrote it or named by its hash, so a server cannot forge a realm, object or transfer. It holds no realm state and makes no rules. A bad or dead server is one you stop using.
- **Servers do not talk to each other.** A player lists a few servers they like; a realm announces itself on several. No syncing, no voting, no shared ledger.
- **It also serves the web page** players open, so one server is all a group of friends needs.
- **Size target:** a few hundred lines. Growing past that is a sign realm rules are leaking in.

## Growth and money

**What makes it spread:**

- **The "one sentence to a world" moment.** Someone describes a game, it appears, and a friend joins from their phone seconds later. Short videos of that moment are the main engine of growth.
- **Every realm is a link** that shows a preview picture when shared. Every player is one tap away from making their own.
- **Remix everything.** All code is public, so every object and realm can offer "remix this": copy it and tell your agent what to change. The signed history credits the original maker.
- **Portals between creators.** Popular realms send visitors to smaller ones, so each new realm makes the network more worth visiting.
- **A built-in builder** for people without an AI agent: type what you want, get a realm or object.
- **Creators keep what they earn.** Tips or entry fees go straight to creators, with no platform cut.

**Optional services,** which anyone may offer and the network never depends on: always-on hosting by the owner's signed permission, an AI builder, fast relays, and well-known apps and directories.

**Risks:**

- **Walled gardens** (see above).
- **Free services need firm limits from day one.** If a popular default server is free, costs grow as fast as users. The software makes it easy for others to share the load.
- **"Cannot be shut down" also means illegal content cannot be removed centrally,** so allow lists, block lists and takedown support are essential for ordinary people to feel safe running servers. The design is "no single point of failure, like email", never "built to escape authorities".
- **Single points of failure to avoid:** the website serving the app (a few plain files anyone can mirror or keep locally), the default server list (gathered from several sources), and the code host (mirror the repository elsewhere).

## Offline, safety, and law

- A realm with no referee online loses its official state, though its public code still runs. Friends or paid hosts can host it by the owner's signed permission, and single-player realms need no host at all. Being offline can be part of the story: ruins, sealed doors, sleeping gods.
- Safety has no central moderator, so it lives on each person's side: your agent examines a realm's code and warns you, your app filters what you see, and you keep and share block lists.
- Like the web, the protocol cannot enforce law centrally. Each person is responsible for what their own objects and realms do, and each server operator for what their server stores and lists.

## Original work only

Endless Mind is a tool for making original things. The project never suggests, shows or encourages copying anyone else's game, characters, names, art, music or other protected work, in its docs, examples, demos, code or promotion.

- **Examples are technical and original.** They use invented names and generic kinds of realm ([a large city](examples/city.md), [a world made of blocks](examples/block-world.md), [a maze chase](examples/maze-chase.md)) to explain how the system works, not how to recreate an existing product.
- **The agent guide steers agents toward original work.** It tells agents to build original designs and to decline to copy another product's names, characters, art, music, logos or level designs, suggesting an original alternative instead.
- **Each builder is responsible for what they build** and must hold the rights to what they publish.
- **The reference server must support takedowns:** a contact field for complaints and takedown lists, so each operator can handle complaints about what their server stores or lists.
- **The project runs no official network.** It provides software; people who run servers and directories are responsible for operating them.

## First version

Two people on two devices use the [maze chase](examples/maze-chase.md) through one small server. The publisher's browser tab is the referee and keeps the full state; traffic goes through the server's relay over WebSocket. Code: `app/` (the browser app), `shared/` (code that runs in browsers and Deno: keys, hashes, signed messages), `server/` (the helper server), `examples/maze-chase/` (the realm's files) and `tests/`. How to run it is in [RUNNING.md](RUNNING.md); the calls realm code can make are in [RUNTIME.md](RUNTIME.md); the guide agents read is [AGENT-GUIDE.md](AGENT-GUIDE.md).

**Working now:** the server (announcements with tag search and who is online, files by hash, relay with proof of key, serving the app); the app (non-exportable keys, a character, publishing a realm from files or the example, hosting it in the publishing tab, joining by link, version links, sandboxed rules and renderer, "Find realms"); runtime interface version 0; the agent guide; the maze chase; unit tests and a two-browser test in Chrome, Firefox and WebKit.

**Not built yet** (described above as design): direct connections (WebRTC), character files and backups, publishing a new version of an existing realm, hosting permissions and the headless runner, saved realm state, server limits and takedown support, input permissions beyond the active renderer, giving and lending objects, encrypted parts, storage expiry, adapters, and object APIs beyond realms.

**Needed before a public launch:** always-on hosting (the headless runner), saving and restoring keys, publishing new versions under the same key, server limits and takedown support, a decision on the privacy default (see "Open questions"), a test of the agent guide by an agent with nothing else to go on, and an always-on server.

**Success test:** two people on two machines, each with their own AI agent, each build something the other did not foresee, and they see each other meet.

## Open questions

- **Privacy default.** A character uses one key in every realm, so its activity is linkable across realms. Should apps default to a separate identity per realm, linked only when the player chooses?
- Should visitors be able to demand guarantees from a realm (for example "forget me after I leave"), or is "leave if you do not trust it" enough?
- When to add the lockstep multiplayer mode alongside "the host keeps the full state".
