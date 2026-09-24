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
- **A key pair lives on exactly one device.** Giving an object creates a new key pair on the receiver's device; private keys are never transferred.
- **No rarity.** Anyone can make any object.
- **The server is small enough to clone and run.** Many interchangeable servers, none in charge.

## Why now (the pitch)

- Writing a custom world used to cost months of skilled work. With an AI coding agent it costs a conversation.
- Two worlds that do not quite fit together used to stay apart. Now an agent can write the missing piece at the door, in seconds.
- So the old tradeoff (one central server for compatibility, or freedom and fragmentation) goes away. Compatibility is worked out per visit, by agents.

## Core model

**Object.** The only building block: a key pair (its identity) plus code (its behavior and state). A body, a sword, a house, a planet, a swarm, a universe are all just objects with different code. It runs on the device of whoever owns it.

**Containment.** Any object can contain any number of other objects, to any depth (a room inside a ship inside a galaxy; tiny creatures living in your coat). An object that contains others acts as their realm: it runs the rules and the shared space for what is inside it. "Realm" below just means "the containing object".

**Owner.** The player whose device runs an object's code. Owning means "I run it, I hold its private key, I answer for it."

**Contract.** A named, versioned description of messages and what they mean, readable by both humans and AI agents. For example `swordfight/1` might define `strike`, `damage`, `die`. A contract is identified by the hash (a fingerprint) of its text, so no one needs to run a registry. Popular contracts become standards by being popular, the way file formats do.

**Manifest.** What each object publishes: its public key, which contracts it requires, offers, and refuses, how to draw it, and its house rules.

**Entering.** An object asks to enter a realm. Both sides compare manifests. If the object lacks a required contract, its owner's agent can offer to write it right then ("This realm needs `swordfight/1`. Want me to add it? About 30 seconds.").

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

**Meta-rule: a key pair lives on exactly one device.** A private key is created on a device and never leaves it. No two devices ever share a key pair.

**Lending.** I let you use my object. You call its functions: the client-side parts run on your device, the server-side parts run on mine. If I go offline, the server side goes quiet (or dormant, in the story).

**Giving.** When I give you an object:

1. Your device generates a brand-new key pair for it. No private key is ever transferred.
2. You already have the client-side code (you received it when you first used or saw the object). The transfer sends you the server-side code.
3. From then on your device is the object's server. You can copy it, change it, or give it away.
4. My old key signs a note, "object X (my key) is now object Y (your key)", so anyone who cares can follow the object's history. Whether I keep or delete my copy is up to me.

**Realm-owned objects** are the same choices made by a realm's code: a realm can lend weapons to visitors while they are inside, stop answering when they leave, or give one away outright.

**Safety of received code.** Running client-side code, or received server-side code, means running someone else's code. The browser already keeps web page code away from the rest of the machine, and that is the main protection. Running each object in its own separate worker (a background thread in the page) also stops one object from interfering with another. A player's agent can read any code before running it.

## Seeing each other (first priority)

- Each viewer's own device draws the scene. The realm sends what is in the space and where; each object supplies its own look.
- A realm may restrict looks (in a realm of ghosts everyone is translucent), and a viewer may simplify anything (everyone as a colored shape).
- **Look format:** start with a tiny set of 3D primitives (boxes, spheres, cylinders, colors, grouped together), which an AI agent can write by hand in seconds. Allow standard 3D model files (glTF, the common web format for 3D models) later.
- **Platform:** the browser. It can draw 3D (with a library such as three.js), connect peers directly (WebRTC), and run received code in a sandbox, and anyone can join by opening a page. A player's realm and objects run in their own browser tab.

## The server: a small program anyone can run

Goal: simple enough that anyone can clone this repository and run their own server with one command.

- **It does three things:** stores signed announcements (an object's or realm's manifest and how to reach it), tells who is online, and passes messages between two players who cannot connect directly (for example, because both are behind home routers).
- **It cannot cheat.** Everything it stores is signed by the key that wrote it, so a server cannot forge a realm, object, or transfer. It holds no game state and makes no rules. A bad or dead server is simply one you stop using.
- **Servers do not talk to each other.** A player lists a few servers they like; a realm announces itself on several. No syncing, no voting, no shared ledger.
- **It also serves the web page** that players open, so one server is all a group of friends needs.
- **Size target:** a few hundred lines. Growing past that is a sign game logic is leaking in.

## Offline, safety, and law

- Offline realms freeze. Friends can agree to host copies. Being online becomes part of the story: ruins, sealed doors, sleeping gods.
- Safety has no central moderator, so it lives on each person's side: your agent reads a realm's manifest and warns you, your client filters what you see, and you keep block lists and share them if you like.
- Law: like the web, the protocol cannot enforce law centrally. Each person is responsible for what their own objects and realms do. The project docs must say this honestly.

## First version

1. **Server.** Announcements, online list, message passing, and serving the web page.
2. **Browser runtime.** Makes key pairs, loads the player's own realm and object code, connects to peers, draws the 3D scene.
3. **Protocol draft.** Manifest, contract format, entering and leaving, the realm's scene updates, object intentions, transfer notes.
4. **Agent guide.** An instructions file that any AI coding agent reads to build realms and objects for its player. The most important deliverable: players will not read specs, their agents will.
5. **Demo content.** A sword-fighting arena (requires `swordfight/1`, keeps realm-bound swords, lets a champion's sword leave with them) and a calm garden. One fighter body and one wanderer body. Show a refused entry, an agent adding the missing contract, a fight, an ejection for refusing to die, and a sword changing owners.

Success test: two people on two machines, each with their own AI agent, each build something the other did not foresee, and they see each other meet.

## Open questions

- Should visitors be able to demand guarantees from a realm (for example "forget me after I leave"), or is "leave if you do not trust it" enough?
- Is a small set of built-in contracts (being somewhere, moving, having a look) acceptable, or must even those be optional?
- Fast action (sword fights) needs quick responses. Is the realm-as-referee delay acceptable for a first demo, or should the realm run small pieces of visitors' code locally in a sandbox?
- Server language: TypeScript (one language for the whole project) or Python with `uv` (your usual tooling)?
- Name: keep "EveryGame"?
