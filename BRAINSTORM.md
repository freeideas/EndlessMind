# EveryGame: brainstorm

Started 2026-09-24. Sources: Ace's chat notes of 2026-09-24, follow-up decisions in the same session, and the earlier "Sovereign Nodes Game" design document (summarized here, not copied).

## The idea in one paragraph

A massively multiplayer world where both the code and the running of that code are spread across the players. Players create realms and objects (a body, a weapon, a pet, a cloud of dust, anything). Their own AI coding agent writes the code. The code is public and anyone can run it, but only the holder of an object's private key can operate it or speak for it. An object can enter a realm if it implements what the realm requires (a sword-fighting realm might require a damage count and a `die` function; another realm might require `kiss` and `caress`). The server is a small program anyone can clone and run, so there is no single server to shut down. It is not one game but every game anyone can imagine.

## Decisions so far

- **Freedom almost always wins over safety.** Anything should be possible. The sandbox is the safety floor: foreign code only ever runs sandboxed (in a web page, or in a JavaScript or WebAssembly sandbox inside another app), where it cannot do much catastrophic harm to a player's machine, so the project adds few protections of its own.
- **The browser is the front door, not a requirement.** Every realm link opens in a browser with one click, but the app is an open protocol with a reference browser version, not the only way in. Other apps (an Unreal, Godot or Unity game, a native desktop app, the headless host runner) can join the same realms. See "Other apps and game engines".
- **There is only one kind of thing: the object.** An object is a key pair plus some code. Players can make as many as they like, and any object can contain any number of any other objects. Bodies, realms, and swords differ only in the code written for them. All limits are set by code, never by the platform.
- **Visuals come first**, or nearly first. Seeing it is a key part of the idea, so the first demo is visual, not text.
- **Realms enforce their own rules.** A realm verifies that its rules are followed inside it. Worst case, the realm decides an object is no longer inside.
- **Every realm and every object has its own public/private key pair.** That key pair is its identity.
- **"Body" is just one kind of object.** Players may create any number of objects.
- **All code is public, and anyone can run any object.** Objects are published on a torrent-like network (shared by whoever has a copy). This replaces the earlier idea of hidden server-side code that ran only on the owner's device; see "Objects, ownership, and code that changes hands".
- **Keys, not code, decide who operates an object.** An object's code obeys only commands signed by its key, and only results signed by its key (or by a host it authorized) are official. Running a copy without the key just makes a different object (a fork).
- **Secrets are optional encrypted parts.** An object may keep some code or data encrypted. Encrypted parts can run only where the key is, or on a host the owner trusts with them.
- **Ownership is proof of a private key.** The owner of an object is whoever can prove they hold its private key. Nothing else defines ownership.
- **No built-in "player".** The system knows only objects and devices. A player who wants to be recognized across devices can make a "self" object that claims their other objects, with each claim signed by the claimed object's key. Recognizing a player is a convention between objects, not a platform feature.
- **The private key marks the one real instance of an object.** Official results are signed with it, or by a host holding the owner's signed permission; unsigned or wrongly signed results are ignored.
- **A key pair lives on exactly one device.** Giving an object creates a new key pair on the receiver's device; private keys are never transferred.
- **No rarity.** Anyone can make any object.
- **A player can have any number of objects and any number of devices.** Each device is a separate server with its own keys. Moving an object between your own devices is just giving it to yourself.
- **Enforcement is each realm's choice.** Some realms run entirely on the honor system (every player's copy decides for itself); others have the key holder or an authorized host referee and sign the official state. What happens when no referee is online (freeze, carry on unchecked, or hand refereeing to a stand-in) is also up to the realm's code.
- **Everything a visitor needs to judge a realm is visible.** Visitors (in practice, their AI agents) can read all of a realm's code and see which parts are encrypted, so no separate declaration of enforcement style is needed. The only hidden part is what the encrypted parts do.
- **It works both ways.** A realm can read any visiting object's code and see which parts are encrypted, so it knows roughly how the object behaves before admitting it. Since code is identified by its hash, a realm can remember code it has already approved and admit it instantly next time.
- **No named contracts.** The platform enforces no shared vocabulary of functions. Every object can examine every other object's API (its callable functions and their code) and decide for itself. How shallow or deep that examination goes is up to the examining code.
- **Where code runs is not enforced either.** An object's author decides what is public, what is encrypted, and who may host it; the platform requires none of it.
- **The containing object has the final say** about what happens inside it. When a call involves several devices (my lent sword strikes a visitor in your realm), the realm's referee (its key holder or authorized host) decides the outcome.
- **The runtime keeps private keys on their device by default.** Browsers can create keys that a page can use but never export, so the one-device rule is true unless someone deliberately works around it.
- **The server is small enough to clone and run.** Many interchangeable servers, none in charge.
- **Growth over control.** The goal is for EveryGame to spread as fast as possible, even at the cost of Ace's own control. Once it is popular, no one, including Ace, should be able to shut it down. Code and rules are fully open; Ace earns from optional services (see "Growth and money").
- **One click to play.** Anyone can open a realm's link and start playing at once, with no install, no account and no AI agent. Each realm turns a visitor's character into an in-realm form and ships a renderer so this works (see "Joining with one click").
- **Every realm leads to more realms.** From inside any realm, a player can always find other realms.
- **License: MIT.** A copyleft license such as the GPL stops copying of the code but not rebuilding of the same features, so it protects little and slows growth. A permissive license spreads fastest.
- **Realm creators can charge money,** separately and independently, however they like. The platform takes no cut and plays no part.
- **Custom renderers and controls are a headline feature.** Anyone can write their own renderer (make plain state look fantastic, show a 2D game in 3D) and their own controls suited to a kind of play (custom keyboard actions, joysticks, brain-computer interfaces). Renderers are objects, traded like any other. See "How it fits together".
- **There is no cheating, only rules.** Players are free to do anything their own software can do. Whatever a realm's rules and referee allow is fair play; a realm that wants something prevented must design it so (see "Hidden information").
- **Unused things fade away.** Nothing is stored forever by default; data lives only while someone keeps a copy. See "Where things are saved".

## Rules by consensus, not by platform

- **Anything is possible.** The platform forbids nothing it does not have to.
- **Meta-rules hold by consensus.** A rule exists because the software people choose to run follows it, the way the web works because browsers and servers follow the same conventions. No one can force a rule on anyone else's device. Unlike Bitcoin, no global agreement is needed: two objects only need to agree with each other to interact.
- **The unavoidable minimum** is also consensus: the message format, key pairs, and how an object's API is published. Software that does not follow them simply cannot talk to the rest.
- **Defaults instead of requirements.** Things like a basic way to describe position and looks ship as defaults in the reference software. Anyone may ignore or replace them; they stay useful only as long as most people keep using them.

## Protecting yourself: allow lists of code

- **Lists are about code, not keys.** Keys cost nothing to make, so judging by key is pointless.
- **Every object is potentially a container, and every object keeps an allow list of known-good code hashes.** An object whose code hash is on the list is let in automatically. An object that cannot contain anything simply lets nothing in. So "realm" is not a separate kind of thing, only a way an object behaves.
- **Asking to be let in.** An object not on the list asks; the container runs its own admission code (and perhaps asks its owner or its owner's AI agent) to decide whether to add the hash. When an owner changes an object's code, its hash changes, so it asks again. An open container can allow everything.
- **Admission is normally decided by the container's referee** (its key holder or authorized host), because a copy running on the requester's own device could fake a yes. A container that does not care (honor system) can let each copy decide. Freedom first: the platform requires neither.
- **Players can do the same.** A player's app can keep its own allow list (plus a block list for convenience) and draw nothing else. Lists can be shared and subscribed to, like ad-blocker filter lists; none is official.
- **Limit:** the hash covers the public code and the API, not what an object's encrypted parts do.

## Containment and locality

- **Every object is inside a realm,** except each player's own top-level realms. A player can build their own realm, fill it with their own objects, and play alone if they like.
- **Unwanted objects stay home.** If no one admits your object into their realm, it can only live in one of your own realms. Rejection needs no platform enforcement: it is simply not being admitted.
- **Realms affect each other only through a shared container.** Two realms can interact only when both are inside the same containing realm, which referees that interaction. Like locality in physics: nothing acts at a distance.
- **Messages go anywhere.** Locality applies to effects, not messages. Any object can message any other object and ask to enter any realm directly, from anywhere.

## Finding any object

Goal: any object can be reached from anywhere. A single master list of every object would get too big (100 million players with 1,000 objects each is 100 billion entries, tens of terabytes), and it would be exactly the kind of central thing this project avoids. Options:

- **Address like email.** An object's address is its public key plus a few servers where it announces itself ("key at these servers"). No one holds everything, yet anything is reachable. Simplest; the recommended start.
- **Decided: only what wants to be found is listed.** Only objects that want to be found (public realms, players' "self" objects) announce themselves. Objects inside a realm are reached through that realm.
- **Devices announce; everything else is consolidation and indexing.** Each device announces the objects on it that want to be found, signed by each object's key. Servers keep what they are sent; directories gather and index it.
- **Directories anyone can run.** Search services can collect announcements from many servers, the way web search engines crawl the web. None is official.
- **Later: a shared lookup table spread across participants** (a distributed hash table, as BitTorrent uses), which scales to many millions of entries without any central list.


## Why now (the pitch)

- Writing a custom world used to cost months of skilled work. With an AI coding agent it costs a conversation.
- Two worlds that do not quite fit together used to stay apart. Now an agent can write the missing piece at the door, in seconds.
- So the old tradeoff (one central server for compatibility, or freedom and fragmentation) goes away. Compatibility is worked out per visit, by agents.

## Joining with one click: characters and in-realm forms

Most people have no AI coding agent, so playing must not need one. Agents are for making new things; playing needs only a link.

- **A player's character.** A player's browser keeps a character object for them (created on first visit, kept across visits). It is still an ordinary object, not a built-in "player".
- **Characters publish a general API** that any realm can read, not tied to any realm: name, look, a plain-language description ("a small fox knight who carries a lantern"), and what it has earned or carries. The reference software ships a default layout for this; anyone may extend or ignore it ("Defaults instead of requirements").
- **Each realm has its own API, and makes an in-realm form of each visitor.** The realm reads the character's general API and builds a form that fits the realm (a runner in a maze, a driver in a city). The realm owns that form and lends it to the visitor while they are inside, so the realm stays a fair referee.
- **The character itself is never changed by a realm.** No realm code is added to it, so a hostile realm cannot damage a visitor's character. Anything earned comes back out as statements signed by the realm, and the character's own code decides whether to keep them.
- **Mixing at the door happens at three levels:**
  1. **The realm's own code, automatically.** Entry code maps what it understands from the character's API (look, name) and ignores the rest. Instant and free, so it covers one-click players with no agent.
  2. **The player's own AI agent, for a better fit.** It writes a custom adapter for that realm ("make my lantern scare the chasers"). The realm checks the adapter like any visiting code and remembers its code hash once approved.
  3. **The realm's AI, optionally.** A realm owner can pay for AI translation of unusual characters at entry. Their choice and their cost.
- **Adapters spread by use.** Since code is identified by its hash, a realm can accept adapters written for other realms. Popular ones (a common way to walk, to take damage, to carry things) become shared habits without any platform standard, fitting "No named contracts".
- **Every realm ships a default renderer** that draws it (3D, flat 2D, text, anything). Players may replace it; see "How it fits together".
- **Finding more realms is built into the app.** The app's own menu, not the realm's code, always offers a way onward: realms this realm links to (doors and portals), realms friends visited, and directory search. A realm cannot trap a visitor or hide the way out.

## Growth and money

**What could make it spread:**

- **The "one sentence to a game" moment.** Someone describes a game, it appears, and a friend joins from their phone seconds later. Short videos of that moment are the main engine of growth; the first version should make that clip possible.
- **Every game is a link** that shows a preview picture when shared on social media or in chats. Every player is one tap away from making their own.
- **Remix everything.** All code is public, so every object and realm can offer "remix this": copy it and tell your agent what to change. The signed history credits the original maker.
- **Portals between creators.** Each world advertises others, and popular worlds send visitors to smaller ones. Each new world makes the network more worth visiting.
- **A built-in builder** for people without an AI agent: type what you want, get a realm or object.
- **Creators keep what they earn.** Tips or entry fees go straight to realm creators, with no platform cut. Earning creators promote the platform on their own.
- **A launch built for attention:** a handful of great original worlds, a post on Hacker News, a game jam with prizes, and early access for streamers who build live.

**How Ace earns, without controlling anything.** All of these are optional services anyone may compete with; the network never depends on them.

- **Always-on hosting** for realms that must stay up while their owner's device is off, by the owner's signed permission, including keeping copies of their data.
- **The built-in AI builder:** a free tier, then paid heavier use.
- **Fast relays** for players whose routers block direct connections: a free tier with limits.
- **The best-known app and directory,** under the name "EveryGame" (a trademark Ace keeps).

**Risks:**

- **Free services must have firm limits from day one.** If Ace runs the default free relays and it goes viral, costs grow as fast as users. The software should make it easy for others to share the load.
- **"Cannot be shut down" also means illegal content cannot be removed centrally,** so allow lists, block lists and takedown support are essential for ordinary people to feel safe running servers. Describe the design as "no single point of failure, like email", never as built to escape authorities.
- **The industry is more likely to ignore, copy or compete than to buy.** The open-code-plus-services path still pays in that case.

**Weak points to remove before launch:** the website serving the page (make it one file anyone can mirror or keep locally), the default server list (gather it from several sources), and the code host (mirror the repository elsewhere).

## Core model

**Object.** The only building block: a key pair (its identity) plus code (its behavior and state). A body, a sword, a house, a planet, a swarm, a universe are all just objects with different code. Anyone can run its public code; only its key holder can operate it.

**Containment.** Any object can contain any number of other objects, to any depth (a room inside a ship inside a galaxy; tiny creatures living in your coat). An object that contains others acts as their realm: it runs the rules and the shared space for what is inside it. "Realm" below just means "the containing object".

**Owner.** Whoever can prove they hold an object's private key. Since the key lives on one device, that device (or a host it authorizes) signs the object's official results and runs its encrypted parts.

**API.** What each object exposes to others: its public key, its callable functions and their code (with any encrypted parts marked), and its look. Anyone can read it.

**Entering.** An object asks to enter a realm. The realm examines the object's API and decides; the object may examine the realm's API first. If the realm says no, the visitor's AI agent can read why (or read the realm's code) and offer to add what is missing ("This realm wants objects that can take damage and die. Want me to add that? About 30 seconds.").

## Who decides what happened?

If I swing a sword at you, my code runs on my device and yours on yours, and anyone can lie. The answer:

1. **The realm is the referee inside the realm.** It runs the physics and the rules, and it checks that every object inside follows them. A sword-fighting realm keeps its own damage count for each visitor and calls `die` when the count runs out. If a visitor's code refuses to die, or reports things the realm's rules do not allow, the realm can simply declare that object no longer inside. The realm's authority ends at its border.
2. **What happens after leaving belongs to the object and its owner.** A realm can throw you out, or kill your presence inside it, but it cannot reach your device. Your object's own code (and perhaps the server, for bookkeeping) decides what leaving means: back home, a ghost, a scar, nothing at all.
3. **Things that cross realms carry signatures.** A realm's record ("this player won 12 fights here") is a statement signed by the realm. Another realm decides whether it trusts that statement. Value between worlds comes from trust between realms, not from a central ledger.

**Single-player games need no host.** All code is public, so a single-player game runs entirely in the player's browser once its files arrive (from mirrors, other players or storage nodes, none of which run game code). It even works offline. Without the realm's key, the player's copy cannot sign results, so scores are not trusted elsewhere unless the moves are sent to the realm's key holder or an authorized host to check and sign.

**Shared state in multiplayer: the official state wins.** Every browser predicts the state so play feels instant; when the official, signed state arrives, it wins and the browser corrects itself. The referee is whoever holds the realm's key or an authorized host (a creator's browser tab, a friend's always-on machine, a paid host). A realm picks one of two ways to share the work:

1. **The host keeps the full state** and sends updates. Simplest, and handles hidden information, but the host's connection carries everything (tens of players on a home connection).
2. **The host only puts moves in order** (lockstep). Every browser runs the same public realm code on the same ordered moves and reaches the same state, so the host's work is tiny. Everyone has the full state, so hidden information needs the tools below.

Slow, turn-based games (chess, cards between friends) can skip the host: players sign their own moves and each browser checks every move against the rules.

**Hidden information.** Anything sent to a player's browser counts as seen by that player, whatever renderer they use. Realms keep secrets with:

- **Sending each player only their share.** The host never sends what a player may not see (enemies behind walls), so no renderer can show it.
- **Encrypting a secret to its owner.** A card dealt to a player travels encrypted to their key, readable only by them, even in lockstep games.
- **Commit now, reveal later.** A player publishes a hash of a hidden choice, proving it is fixed without revealing it, and reveals it at the end for everyone to check. Works with no host at all.

A realm cannot enforce which renderer a player uses, since a browser can claim anything. That is fine: custom renderers and controls are a feature, and anything the rules and referee allow is fair play.

## Objects, ownership, and code that changes hands

No rarity. Any player can make any object they want, so "rare" is an odd idea here and the platform does not try to support it. What matters instead is **who can operate an object and speak for it**.

**Earlier idea, replaced (2026-09-27).** Objects used to be split into client-side code (run by callers, visible) and server-side code (run only on the owner's device, hidden). That made every object depend on its owner's device being online. The model below replaces it.

**Three layers of every object:**

- **Public code.** Anyone can fetch it from the torrent-like network, read it and run it. It gives speed (a sword swing looks instant), lets single-player games run with no host, and lets anyone remix it.
- **Signed commands and results.** An object's code obeys only commands signed with its key, and only results signed by its key (or an authorized host) are official. Anyone can run and watch my character; only I can steer it. This is the job of signatures, not encryption.
- **Encrypted parts (optional).** Secret rules, hidden answers, private notes. Code must be decrypted to run, and whoever runs it can see it, so encrypted parts run only on the key holder's device or a host they trust with them.

**Hosting by permission.** An owner signs a note: "this machine may host my object until December." A volunteer or paid host then runs the official instance, signing results under that permission, while the owner's device is off. No private key moves.

**When no official host is online.** The public code still runs everywhere, so an object degrades rather than vanishes: a lent sword still looks and swings like a sword, but anything needing its key (signed results, encrypted parts, special powers) waits until the owner or a host is back. The same holds for realms: visitors can still see and even play a realm's public code, but nothing is official until a referee returns.

**Meta-rule: a key pair lives on exactly one device.** A private key is created on a device and never leaves it, except as an encrypted backup the owner chooses to make (see "Where things are saved").

**The private key is what makes an instance "the real one".** Anyone can run a copy of any object, but without the private key its answers carry no valid signature, so no one treats it as that object. A copy can only become a new object with a new key (a fork, credited through the signed history).

**Lending.** I let you use my object. Its public code runs on your device; its official results and encrypted parts come from me or my host. If neither is online, those parts go quiet (or dormant, in the story).

**Giving.** When I give you an object:

1. Your device generates a brand-new key pair for it. No private key is ever transferred.
2. You already have the public code. The transfer sends you any encrypted parts, re-encrypted for your key.
3. From then on you operate the object. You can copy it, change it, or give it away.
4. My old key signs a note, "object X (my key) is now object Y (your key)", so anyone who cares can follow the object's history. Whether I keep or delete my copy is up to me.

**Your own devices.** A player can have any number of devices, each with its own keys, so moving an object from your laptop to your phone is simply giving it to yourself (or restoring it from a backup).

**Realm-owned objects** are the same choices made by a realm's code: a realm can lend weapons to visitors while they are inside, stop answering when they leave, or give one away outright.

**Safety of received code.** Running any object means running someone else's code. The sandbox it runs in (the browser's, or a JavaScript or WebAssembly sandbox in another app) keeps it away from the rest of the machine, and that is the main protection. The app runs each object in its own sealed-off sandbox so one object cannot interfere with another or read keys (see "Isolation needs care" below). A player's agent can read any code before running it.

## How it fits together (first priority)

Five pieces. Everything is an object except the app, which is the platform's own open software.

| Piece | What it is | Who owns it | Where it runs |
|---|---|---|---|
| **The app** | The page you open; runs everything else | Nobody (open software) | Your browser |
| **Character** | Your persistent identity, look and feel | You | Anywhere; you operate it |
| **Realm** | The game: rules, map, referee | Its creator | Anywhere; referee by key |
| **In-realm form** | What your character becomes in that realm | The realm, lent to you | Anywhere; realm referees |
| **Renderer** | Turns the realm's state into a picture | Its author; you pick it | Your browser |

**The app** holds your keys and saved data, keeps each piece of foreign code in its own sandbox, opens links, hands the realm your character's general API and receives your in-realm form, and owns the menu that is always there (find more realms, change renderer, edit character, leave). It is not called "player", since that word means the person.

**Renderers: state is separate from the picture.** A realm never draws anything itself; it publishes its state as plain data ("maze grid, walls here, runner at 4,7, score 120"). It ships a default renderer, and anyone can write another that reads the same data: a naturally 2D maze shown as glowing 3D corridors, plain state made to look fantastic. The game cannot tell the difference.

- **A renderer is an object,** with a code hash, so renderers can be shared, traded, remixed and put on allow lists, on the same torrent-like network as everything else. It is separate from the app page, which only runs whichever renderer the player picks.
- **A renderer is also a controller.** Besides drawing, it can offer its own controls: fancy keyboard layouts, combo actions, joystick and controller support, motion or gesture control, and any device the browser can reach (gamepads, USB and Bluetooth devices, MIDI instruments, and brain-computer interfaces through those or a small local bridge program). It turns whatever the player does into realm terms ("move left", "cast at cell 4,7") and hands that to the app, which sends it to the realm.
- **The realm still decides.** A renderer's actions are only requests; the realm's rules and referee judge them like any other move. A renderer that fires ten perfect moves a second is fair play unless the realm's rules say otherwise ("There is no cheating, only rules").
- **A renderer sees only what the player is sent,** so no renderer can reveal hidden information. That is what lets players trade renderers freely without realms needing to approve them.
- **Shared state layouts let one renderer draw many realms.** A renderer written for one realm's state works only there. Realms that describe their state in the default layout (positions plus the simple 3D look format below) can all be drawn by any renderer that understands it, so one fancy renderer can serve thousands of realms. A default, not a requirement.
- **The app helps people find renderers.** Its menu shows renderers others use with this realm and renderers that understand this realm's state, so switching is one tap.

**Input for any object, handed out by the app.** Mouse, keyboard, touch, controller, camera, microphone and other devices are available to any object that wants them, renderers included, which opens up custom controls suited to a kind of play, gesture-controlled creatures, voice spells and face-tracked looks. The app is the gatekeeper:

- Camera, microphone and special devices (USB, Bluetooth, brain-computer interfaces) are ask-first, per object ("The lantern wants to use your camera. Allow?").
- Keyboard and mouse go only to the objects the player is currently interacting with (normally the active renderer), so no object can record a passphrase typed elsewhere.

**One click, start to finish:**

1. Open the link; the app loads (from any mirror).
2. The app finds the player's character, or makes one in about a second (random name and look, editable later).
3. The app fetches the realm's code and default renderer and sandboxes them, then connects to the realm's referee if it has one.
4. The realm reads the character and lends the player an in-realm form.
5. The player presses keys, the realm updates its state, the renderer draws it.
6. On leaving, the character keeps whatever the realm signed for it, and the menu shows where to go next.

**Looks and platform:**

- A realm may restrict looks (in a realm of ghosts everyone is translucent), and a player's renderer may simplify anything (everyone as a colored shape).
- **Look format:** start with a tiny set of 3D primitives (boxes, spheres, cylinders, colors, grouped together), which an AI agent can write by hand in seconds. Allow standard 3D model files (glTF, the common web format for 3D models) later.
- **Platform:** the browser first (the front door; other apps may join too, see "Other apps and game engines"). It can draw 3D (with a library such as three.js), connect peers directly (WebRTC), and run received code in a sandbox, and anyone can join by opening a page. A player's realm and objects run in their own browser tab.

## Where things are saved

| What | Where |
|---|---|
| Character (keys, name, look, feel, its own code) | Player's browser; a character file and/or encrypted backup |
| What a character has earned | Signed statements, kept with the character |
| Realm state | The referee's device; encrypted copies on storage nodes |
| Code (realms, renderers, adapters, assets) | Found by hash, cached; any holder can serve it |
| Settings (renderer choice) | Player's browser |

**Saving a character, two ways:**

1. **Save as file** (always available). Encrypted, locked with a passphrase, holding everything unique to the character. A default character is a few KB (shared code such as the default character code is referenced by hash), small enough to email or turn into a QR code. A customized one, with its own code, models and sounds, can be tens of KB to several MB. The file can include shared code too, so restoring never depends on the network.
2. **Automatic backup** (optional convenience). Encrypted, unlocked with a passkey (the fingerprint or face login phones and computers already sync), stored on storage nodes. Restoring on a new device takes one tap, with no password or account. Aimed at players who never think about saving.

Both mean a key leaves its device as an encrypted backup, which freedom allows with a clear warning. A file is simpler and depends on no one; the backup exists because people lose files, files go stale, and passphrases get forgotten.

**Unused things fade away.** Data lives only while someone keeps a copy:

- Each device keeps its own objects plus a cache of recently used things, cleared when space runs low.
- Storage nodes keep data for a set period (for example 90 days) unless the owner's device renews it, with a size limit per key.
- Announcements expire unless renewed.
- Identical assets are stored once, since they are named by their hash.

**Keeping what matters:** owners keep their own things; fans, hosts or creators can pin (promise to keep) anything; anyone may run an archive that keeps everything; and objects carry their unique parts with them, pointing only to widely used shared ones. Forgotten worlds are truly lost unless someone cared to keep them, which fits "ruins and sealed doors".

## The game container: browser, with limits to design around

A browser tab can act as a referee for the objects it owns. Browsers cannot accept incoming connections, but they can connect directly to each other (WebRTC, as video calls use): both connect out to a small meeting server, learn their public addresses, swap them through it, and send to each other at the same moment so each home router treats the incoming packets as replies ("hole punching"). When that fails, traffic goes through a relay. Limits found so far:

- **Only alive while the tab is open.** Phones suspend background tabs almost at once; desktops slow down background timers but keep receiving messages. Anything meant to stay up (a public realm, a lent object used by many) needs an always-on host.
- **Direct connections sometimes fail.** Some home routers and most mobile carriers block direct peer connections, so traffic must be relayed through a server, which costs that server bandwidth.
- **A home connection can host only so many visitors.** Tens of visitors in a busy realm is realistic; hundreds is not, from one browser on home internet. This limit applies to any player-hosted design, not only the browser.
- **Storage can be wiped.** Clearing site data deletes the private keys, and with them ownership of every object on that device. Fixed by the character file and automatic backup in "Where things are saved".
- **Isolation needs care.** Code in ordinary workers shares the page's storage and could read its keys. Foreign code must run in sandboxed frames with their own blank origin (a browser security boundary) to be kept away from keys and other objects.

**Local files from a browser.**

- Every browser has a private file area per site (the Origin Private File System). It is fast and roomy, but hidden from the user and deleted when site data is cleared.
- Chrome and Edge on desktop can also read and write a real folder the player picks once (the File System Access API), and can remember that permission. Firefox and Safari do not support this.
- A page can ask the browser to mark its storage as "persistent" so it is not cleared automatically when space runs low.

**Storage and relay nodes, borrowing from torrents and similar networks.** Ideas worth copying:

- BitTorrent and WebTorrent (BitTorrent inside browsers): data is named by its hash (fingerprint), and anyone holding a piece can serve it.
- IPFS: "pinning" services that promise to keep particular data available.
- Nostr: independent relays that store signed messages, each with its own limits.
- Holepunch/Hypercore: peer-to-peer append-only logs that friends can keep copies of ("seeding").

Applied here: the same small server program could offer optional roles, each switched on by its operator: **finder** (announcements, who is online), **relay** (pass traffic for peers who cannot connect directly), and **storage** (keep signed, encrypted data blobs, with a size limit per key). An object's saved state is encrypted with its owner's key, so storage nodes cannot read it, and signed, so they cannot fake it. Objects keep copies on several storage nodes, like seeding. Encrypted character backups live there too (see "Where things are saved").

**Direction:** object code is plain JavaScript or WebAssembly that runs unchanged in the browser, in a headless runtime (Deno or Node) on any always-on machine, and inside other apps. The browser is where most players look and play; the headless runner is how an authorized host keeps an object or realm up while its owner sleeps.

## Other apps and game engines

Many builders will want to use game engines such as Unreal, Godot or Unity. The browser stays the front door, but nothing depends on it.

- **Object code must stay portable:** JavaScript or WebAssembly (compiled code that runs at near-native speed in browsers and elsewhere). C++, C#, Rust and others compile to WebAssembly, so builders are not limited to JavaScript. This is what keeps every realm playable from a browser link.
- **Renderers and clients may be native.** An Unreal, Godot or Unity app can join any realm and draw it with full engine graphics, since it speaks the same protocol. The realm cannot tell the difference, like any other renderer.
- **Native code is never passed around as an object.** A native client is installed deliberately by the player, like any app. Objects stay JavaScript or WebAssembly, so the sandbox remains the safety floor.
- **Each app does the browser's jobs too:** keeps private keys on the device (in the operating system's secure key store), runs each foreign object in its own sandbox, and asks first before giving any object camera, microphone or device access.
- **Shared engine players, plus programs of a realm's own.** Both exist side by side:
  - **Shared players (the default).** One well-known player app per engine (an EveryGame Unreal player, Godot player, Unity player). Installed once, it runs every realm built for it with no further installs, because realms ship only data (models, sounds, scene descriptions) and sandboxed JavaScript or WebAssembly. The engine supplies graphics, physics and audio; the realm's behavior is in its portable code.
  - **A realm's own program (allowed).** A builder who needs more than a shared player offers (for example Unreal's own C++ or Blueprints, its visual scripting) can ship a separate program for their realm. It runs outside any sandbox, so the app warns plainly before install: "This realm needs its own program, which can do anything on your computer."
- **The manifest says how a realm can be played** (in the browser, in a shared player, or only in its own program), so the app and directories can show it before anyone clicks.
- **Engine-made 3D models** come in as glTF files (the common web format for 3D models), which all these engines export.
- **Unreal in a browser:** Unreal no longer runs in web pages, but its Pixel Streaming can run it on a server and stream video to the page, at the realm owner's cost.

**Why this is easy in each engine.** Everything a native client needs already exists as an embeddable library with a C interface (usable from all three engines):

| Need | Library | Unreal (C++) | Godot | Unity (C#) |
|---|---|---|---|---|
| Talk to servers | WebSocket | Built in | Built in | Built in or package |
| Direct connections | WebRTC | libdatachannel | Plugin | Unity WebRTC |
| Signatures | libsodium | Yes | Plugin | Yes |
| Run JavaScript | QuickJS, V8 | PuerTS | GodotJS | PuerTS, Jint |
| Run WebAssembly | Wasmtime | Yes | godot-wasm | Wasmtime .NET |

The plan: write one small core library (protocol, signatures, sandbox) once, with a C interface, and wrap it thinly for each engine, so supporting a new engine is a thin wrapper rather than a rewrite. A native client can start with WebSocket only, through the server's relay, and add direct connections later.

## The server: a small program anyone can run

Goal: simple enough that anyone can clone this repository and run their own server with one command.

- **It does three things (each role optional, see storage and relay nodes above):** stores signed announcements (an object's API and how to reach it), tells who is online, and passes messages between two players who cannot connect directly (for example, because both are behind home routers).
- **It cannot cheat.** Everything it stores is signed by the key that wrote it, so a server cannot forge a realm, object, or transfer. It holds no game state and makes no rules. A bad or dead server is simply one you stop using.
- **Servers do not talk to each other.** A player lists a few servers they like; a realm announces itself on several. No syncing, no voting, no shared ledger.
- **It also serves the web page** that players open, so one server is all a group of friends needs.
- **Size target:** a few hundred lines. Growing past that is a sign game logic is leaking in.

## Offline, safety, and law

- A realm with no referee online loses its official state, though its public code still runs. Friends or paid hosts can host it by the owner's signed permission, and single-player realms need no host at all. Being online becomes part of the story: ruins, sealed doors, sleeping gods.
- Safety has no central moderator, so it lives on each person's side: your agent examines a realm's code and warns you, your client filters what you see, and you keep block lists and share them if you like.
- Law: like the web, the protocol cannot enforce law centrally. Each person is responsible for what their own objects and realms do. The project docs must say this honestly.

## Original work only

EveryGame is a tool for making original worlds. The project must never suggest, show or encourage copying anyone else's game, characters, names, art, music or other protected work, in its docs, examples, demos, code or promotion.

- **Examples are technical and original.** Example worlds use invented names and generic kinds of game (a large city, a world made of blocks, a maze chase). They explain how the system works, not how to recreate an existing product. See [EXAMPLE-CITY.md](EXAMPLE-CITY.md), [EXAMPLE-BLOCK-WORLD.md](EXAMPLE-BLOCK-WORLD.md) and [EXAMPLE-MAZE-CHASE.md](EXAMPLE-MAZE-CHASE.md).
- **The agent guide steers agents toward original work.** It tells AI agents to build original designs, and to decline to copy another product's names, characters, art, music, logos or level designs, suggesting an original alternative instead.
- **Each builder is responsible for what they build.** Realms and objects are made and hosted by their builders, on their own devices. The docs say plainly that builders must hold the rights to what they publish.
- **The reference server supports takedowns.** It has a contact field for rights complaints and can honor takedown lists, so each operator can handle complaints about what their server stores or lists.
- **The project runs no official network.** The project provides software. People who run servers and directories are responsible for operating them.
- **Get legal advice before a public launch,** especially on trademarks and on the duties of server operators.

## First version

1. **Server.** Announcements, online list, message passing, and serving the web page.
2. **The app.** Makes key pairs and characters, fetches and sandboxes object code, hands out input by permission, connects to peers, runs the chosen renderer, saves and restores characters.
3. **Protocol draft.** Object API format, examining an object, signed commands and results, encrypted parts, hosting permissions, entering and leaving, the realm's state updates, giving an object.
4. **Agent guide.** An instructions file that any AI coding agent reads to build realms and objects for its player. The most important deliverable: players will not read specs, their agents will. It includes the "Original work only" rules above.
5. **Demo content.** A sword-fighting arena (admits only objects that can take damage and die, lends swords to visitors while inside) and a calm garden (honor system). One fighter body and one wanderer body. Show a refused entry, an agent adding what was missing, a fight, an ejection for refusing to die, and a sword being given away.

Success test: two people on two machines, each with their own AI agent, each build something the other did not foresee, and they see each other meet.

## Open questions

- Should visitors be able to demand guarantees from a realm (for example "forget me after I leave"), or is "leave if you do not trust it" enough?
- Which multiplayer mode for the first demo: the host keeping full state, or lockstep?
- Server language: TypeScript (one language for the whole project) or Python with `uv` (your usual tooling)?
- Name: keep "EveryGame", or call it "Infinite Worlds Unlimited"?
