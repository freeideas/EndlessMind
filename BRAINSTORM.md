# EveryGame: brainstorm

Started 2026-09-24. Sources: Ace's chat notes of 2026-09-24, follow-up decisions in the same session, and the earlier "Sovereign Nodes Game" design document (summarized here, not copied).

## The idea in one paragraph

A massively multiplayer world where both the code and the running of that code are spread across the players. Players create realms and objects (a body, a weapon, a pet, a cloud of dust, anything). Their own AI coding agent writes the code, and it runs on their own device. An object can enter a realm if it implements what the realm requires (a sword-fighting realm might require a damage count and a `die` function; another realm might require `kiss` and `caress`). The server is a small program anyone can clone and run, so there is no single server to shut down. It is not one game but every game anyone can imagine.

## Decisions so far

- **Freedom almost always wins over safety.** Anything should be possible. The browser is the safety floor: code running in a web page cannot do much catastrophic harm to a player's machine, so the project adds few protections of its own.
- **There is only one kind of thing: the object.** An object is a key pair plus some code. Players can make as many as they like, and any object can contain any number of any other objects. Bodies, realms, and swords differ only in the code written for them. All limits are set by code, never by the platform.
- **Visuals come first**, or nearly first. Seeing it is a key part of the idea, so the first demo is visual, not text.
- **Realms enforce their own rules.** A realm verifies that its rules are followed inside it. Worst case, the realm decides an object is no longer inside.
- **Every realm and every object has its own public/private key pair.** That key pair is its identity.
- **"Body" is just one kind of object.** Players may create any number of objects.
- **Every object has client-side code and server-side code.** Callers run the client side (and can inspect it); the owner's device runs the server side. Lending shares only the client side; giving also sends the server side.
- **Ownership is proof of a private key.** The owner of an object is whoever can prove they hold its private key. Nothing else defines ownership.
- **No built-in "player".** The system knows only objects and devices. A player who wants to be recognized across devices can make a "self" object that claims their other objects, with each claim signed by the claimed object's key. Recognizing a player is a convention between objects, not a platform feature.
- **The private key marks the one real server for an object.** Server-side results are signed with it; unsigned or wrongly signed results are ignored.
- **A key pair lives on exactly one device.** Giving an object creates a new key pair on the receiver's device; private keys are never transferred.
- **No rarity.** Anyone can make any object.
- **A player can have any number of objects and any number of devices.** Each device is a separate server with its own keys. Moving an object between your own devices is just giving it to yourself.
- **Enforcement is each realm's choice.** Some realms run entirely on the honor system (client-side rules only); others enforce their rules in server-side code. What happens when a realm's server side goes offline (freeze, carry on unchecked, or hand refereeing to a stand-in) is also up to the realm's code.
- **Everything a visitor needs to judge a realm is visible.** Visitors (in practice, their AI agents) can read all of a realm's client-side code and see which calls go to its server side, so no separate declaration of enforcement style is needed. The only hidden part is what the server-side calls do internally.
- **It works both ways.** A realm can read any visiting object's client-side code and see which of its calls go to the object's own device, so it knows roughly how the object behaves before admitting it. Since code is identified by its hash, a realm can remember code it has already approved and admit it instantly next time.
- **No named contracts.** The platform enforces no shared vocabulary of functions. Every object can examine every other object's API (its callable functions and their client-side code) and decide for itself. How shallow or deep that examination goes is up to the examining code.
- **Where code runs is not enforced either.** An object's author decides which functions run on the caller's device and which on the owner's; the platform requires neither.
- **The containing object has the final say** about what happens inside it. When a call involves several devices (my lent sword strikes a visitor in your realm), the realm's server-side code decides the outcome.
- **The runtime keeps private keys on their device by default.** Browsers can create keys that a page can use but never export, so the one-device rule is true unless someone deliberately works around it.
- **The server is small enough to clone and run.** Many interchangeable servers, none in charge.

## Rules by consensus, not by platform

- **Anything is possible.** The platform forbids nothing it does not have to.
- **Meta-rules hold by consensus.** A rule exists because the software people choose to run follows it, the way the web works because browsers and servers follow the same conventions. No one can force a rule on anyone else's device. Unlike Bitcoin, no global agreement is needed: two objects only need to agree with each other to interact.
- **The unavoidable minimum** is also consensus: the message format, key pairs, and how an object's API is published. Software that does not follow them simply cannot talk to the rest.
- **Defaults instead of requirements.** Things like a basic way to describe position and looks ship as defaults in the reference software. Anyone may ignore or replace them; they stay useful only as long as most people keep using them.

## Protecting yourself: allow lists of code

- **Lists are about code, not keys.** Keys cost nothing to make, so judging by key is pointless.
- **Each realm keeps an allow list of known-good code hashes.** An object whose code hash is on the list is admitted. When an owner changes an object's code, its hash changes, so the owner asks the realm to admit the new version; the realm (its code, its owner, or its owner's AI agent) examines it and decides whether to add the new hash. An open realm can simply allow everything.
- **Viewers can do the same.** A player's client can keep its own allow list (plus a block list for convenience) and draw nothing else. Lists can be shared and subscribed to, like ad-blocker filter lists; none is official.
- **Limit:** the hash covers the client-side code and the API, not the owner's hidden server-side code, which can change without notice.

## Containment and locality

- **Every object is inside a realm,** except each player's own top-level realms. A player can build their own realm, fill it with their own objects, and play alone if they like.
- **Unwanted objects stay home.** If no one admits your object into their realm, it can only live in one of your own realms. Rejection needs no platform enforcement: it is simply not being admitted.
- **Realms affect each other only through a shared container.** Two realms can interact only when both are inside the same containing realm, which referees that interaction. Like locality in physics: nothing acts at a distance.
- **Messages go anywhere.** Locality applies to effects, not messages. Any object can message any other object and ask to enter any realm directly, from anywhere.

## Finding any object

Goal: any object can be reached from anywhere. A single master list of every object would get too big (100 million players with 1,000 objects each is 100 billion entries, tens of terabytes), and it would be exactly the kind of central thing this project avoids. Options:

- **Address like email.** An object's address is its public key plus a few servers where it announces itself ("key at these servers"). No one holds everything, yet anything is reachable. Simplest; the recommended start.
- **Not everything is listed.** Only objects that want to be found (public realms, players' "self" objects) announce themselves. Objects inside a realm are reached through that realm.
- **Directories anyone can run.** Search services can collect announcements from many servers, the way web search engines crawl the web. None is official.
- **Later: a shared lookup table spread across participants** (a distributed hash table, as BitTorrent uses), which scales to many millions of entries without any central list.


## Why now (the pitch)

- Writing a custom world used to cost months of skilled work. With an AI coding agent it costs a conversation.
- Two worlds that do not quite fit together used to stay apart. Now an agent can write the missing piece at the door, in seconds.
- So the old tradeoff (one central server for compatibility, or freedom and fragmentation) goes away. Compatibility is worked out per visit, by agents.

## Core model

**Object.** The only building block: a key pair (its identity) plus code (its behavior and state). A body, a sword, a house, a planet, a swarm, a universe are all just objects with different code. It runs on the device of whoever owns it.

**Containment.** Any object can contain any number of other objects, to any depth (a room inside a ship inside a galaxy; tiny creatures living in your coat). An object that contains others acts as their realm: it runs the rules and the shared space for what is inside it. "Realm" below just means "the containing object".

**Owner.** Whoever can prove they hold an object's private key. Since the key lives on one device, that device runs the object's server-side code.


**API.** What each object exposes to others: its public key, its callable functions (each with client-side code, a server-side part, or both), and its look. Anyone can read it.

**Entering.** An object asks to enter a realm. The realm examines the object's API and decides; the object may examine the realm's API first. If the realm says no, the visitor's AI agent can read why (or read the realm's code) and offer to add what is missing ("This realm wants objects that can take damage and die. Want me to add that? About 30 seconds.").

## Who decides what happened?

If I swing a sword at you, my code runs on my device and yours on yours, and anyone can lie. The answer:

1. **The realm is the referee inside the realm.** It runs the physics and the rules, and it checks that every object inside follows them. A sword-fighting realm keeps its own damage count for each visitor and calls `die` when the count runs out. If a visitor's code refuses to die, or reports things the realm's rules do not allow, the realm can simply declare that object no longer inside. The realm's authority ends at its border.
2. **What happens after leaving belongs to the object and its owner.** A realm can throw you out, or kill your presence inside it, but it cannot reach your device. Your object's own code (and perhaps the server, for bookkeeping) decides what leaving means: back home, a ghost, a scar, nothing at all.
3. **Things that cross realms carry signatures.** A realm's record ("this player won 12 fights here") is a statement signed by the realm. Another realm decides whether it trusts that statement. Value between worlds comes from trust between realms, not from a central ledger.

## Objects, ownership, and code that changes hands

No rarity. Any player can make any object they want, so "rare" is an odd idea here and the platform does not try to support it. What matters instead is **who runs which part of an object's code**.

**Two halves of every object.** Each object has functions that other objects can call. Each function can have two parts:

- **Client-side code** runs on the device of the calling object. The caller receives this code and can inspect it before running it. It gives speed (a sword swing looks instant) and a local look and feel.
- **Server-side code** runs on the device of the object's owner. Each player's device is the "server" for the objects it owns. This is where secrets and anything the owner wants to control live. The caller never sees it, so it cannot be copied.

This is the familiar split between a web page's code and a website's server code, applied to every single object. Since the caller can change the client-side code it runs, anything that matters (a rule, a score, a secret) belongs on the server side.

**When the owner's device is off.** Client-side code keeps working on the callers' devices; only server-side code stops. An object therefore degrades rather than vanishes: a lent sword still looks and swings like a sword, but anything its owner's server decides (its secrets, its memory, its special powers) is unavailable until the owner is back. Each object's author chooses how much lives on each side, trading independence (client side) against control (server side). The same holds for realms: visitors may still see a realm's scene from its client-side code while its server side, the referee, is away.

**Meta-rule: a key pair lives on exactly one device.** A private key is created on a device and never leaves it. No two devices ever share a key pair.

**The private key is what makes server-side code "the real one".** Every result from an object's server-side code is signed with that object's private key, and callers accept only signed results. Someone who obtains a copy of the server-side code can run it, but without the private key their answers carry no valid signature, so no one treats them as that object. The copy can only become a new object with a new key. So the key, not secrecy of the code, is what stops one player from running another player's server side on their own device.

**Lending.** I let you use my object. You call its functions: the client-side parts run on your device, the server-side parts run on mine. If I go offline, the server side goes quiet (or dormant, in the story).

**Giving.** When I give you an object:

1. Your device generates a brand-new key pair for it. No private key is ever transferred.
2. You already have the client-side code (you received it when you first used or saw the object). The transfer sends you the server-side code.
3. From then on your device is the object's server. You can copy it, change it, or give it away.
4. My old key signs a note, "object X (my key) is now object Y (your key)", so anyone who cares can follow the object's history. Whether I keep or delete my copy is up to me.

**Your own devices.** A player can have any number of devices. Each is its own server with its own keys, so moving an object from your laptop to your phone is simply giving it to yourself.

**Realm-owned objects** are the same choices made by a realm's code: a realm can lend weapons to visitors while they are inside, stop answering when they leave, or give one away outright.

**Safety of received code.** Running client-side code, or received server-side code, means running someone else's code. The browser already keeps web page code away from the rest of the machine, and that is the main protection. Running each object in its own separate worker (a background thread in the page) also stops one object from interfering with another. A player's agent can read any code before running it.

## Seeing each other (first priority)

- Each viewer's own device draws the scene. The realm sends what is in the space and where; each object supplies its own look.
- A realm may restrict looks (in a realm of ghosts everyone is translucent), and a viewer may simplify anything (everyone as a colored shape).
- **Look format:** start with a tiny set of 3D primitives (boxes, spheres, cylinders, colors, grouped together), which an AI agent can write by hand in seconds. Allow standard 3D model files (glTF, the common web format for 3D models) later.
- **Platform:** the browser. It can draw 3D (with a library such as three.js), connect peers directly (WebRTC), and run received code in a sandbox, and anyone can join by opening a page. A player's realm and objects run in their own browser tab.

## The game container: browser, with limits to design around

A browser tab can act as the server for the objects it owns: peers reach it over direct browser-to-browser connections (WebRTC), set up with help from one of the small public servers. Limits found so far:

- **Only alive while the tab is open.** Phones suspend background tabs almost at once; desktops slow down background timers but keep receiving messages. Anything meant to stay up (a public realm, a lent object used by many) needs an always-on host.
- **Direct connections sometimes fail.** Some home routers and most mobile carriers block direct peer connections, so traffic must be relayed through a server, which costs that server bandwidth.
- **A home connection can host only so many visitors.** Tens of visitors in a busy realm is realistic; hundreds is not, from one browser on home internet. This limit applies to any player-hosted design, not only the browser.
- **Storage can be wiped.** Clearing site data deletes the private keys, and with them ownership of every object on that device. Backup (exporting keys) conflicts with the "key never leaves its device" default; freedom suggests allowing it with a clear warning.
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

Applied here: the same small server program could offer optional roles, each switched on by its operator: **finder** (announcements, who is online), **relay** (pass traffic for peers who cannot connect directly), and **storage** (keep signed, encrypted data blobs, with a size limit per key). An object's saved state is encrypted with its owner's key, so storage nodes cannot read it, and signed, so they cannot fake it. Objects keep copies on several storage nodes, like seeding. An encrypted key backup (unlocked by a passphrase) can live there too, which fixes the wiped-browser problem.

**Direction:** object code is plain JavaScript that runs unchanged in the browser and in a headless runtime (Deno or Node) on any always-on machine. The browser is where players look and play; the headless runner is how an object or realm stays up while its owner sleeps. A desktop app wrapper is possible later but not needed.

## The server: a small program anyone can run

Goal: simple enough that anyone can clone this repository and run their own server with one command.

- **It does three things (each role optional, see storage and relay nodes above):** stores signed announcements (an object's API and how to reach it), tells who is online, and passes messages between two players who cannot connect directly (for example, because both are behind home routers).
- **It cannot cheat.** Everything it stores is signed by the key that wrote it, so a server cannot forge a realm, object, or transfer. It holds no game state and makes no rules. A bad or dead server is simply one you stop using.
- **Servers do not talk to each other.** A player lists a few servers they like; a realm announces itself on several. No syncing, no voting, no shared ledger.
- **It also serves the web page** that players open, so one server is all a group of friends needs.
- **Size target:** a few hundred lines. Growing past that is a sign game logic is leaking in.

## Offline, safety, and law

- Offline realms freeze. Friends can agree to host copies. Being online becomes part of the story: ruins, sealed doors, sleeping gods.
- Safety has no central moderator, so it lives on each person's side: your agent examines a realm's code and warns you, your client filters what you see, and you keep block lists and share them if you like.
- Law: like the web, the protocol cannot enforce law centrally. Each person is responsible for what their own objects and realms do. The project docs must say this honestly.

## First version

1. **Server.** Announcements, online list, message passing, and serving the web page.
2. **Browser runtime.** Makes key pairs, loads the player's own realm and object code, connects to peers, draws the 3D scene.
3. **Protocol draft.** Object API format, examining an object, calling functions (client side and server side), entering and leaving, the realm's scene updates, giving an object.
4. **Agent guide.** An instructions file that any AI coding agent reads to build realms and objects for its player. The most important deliverable: players will not read specs, their agents will.
5. **Demo content.** A sword-fighting arena (admits only objects that can take damage and die, lends swords to visitors while inside) and a calm garden (honor system). One fighter body and one wanderer body. Show a refused entry, an agent adding what was missing, a fight, an ejection for refusing to die, and a sword being given away.

Success test: two people on two machines, each with their own AI agent, each build something the other did not foresee, and they see each other meet.

## Open questions


- Should visitors be able to demand guarantees from a realm (for example "forget me after I leave"), or is "leave if you do not trust it" enough?
- Fast action (sword fights) needs quick responses. Is the realm-as-referee delay acceptable for a first demo, or should the realm run small pieces of visitors' code locally in a sandbox?
- Server language: TypeScript (one language for the whole project) or Python with `uv` (your usual tooling)?
- Name: keep "EveryGame"?
