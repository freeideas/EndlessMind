# EveryGame: brainstorm

Started 2026-09-24. Sources: Ace's chat notes of 2026-09-24, follow-up decisions in the same session, and the earlier "Sovereign Nodes Game" design document (summarized here, not copied).

## The idea in one paragraph

A massively multiplayer world where both the code and the running of that code are spread across the players. Players create realms and objects (a body, a weapon, a pet, a cloud of dust, anything). Their own AI coding agent writes the code, and it runs on their own device. An object can enter a realm if it implements what the realm requires (a sword-fighting realm might require a damage count and a `die` function; another realm might require `kiss` and `caress`). The server is a small program anyone can clone and run, so there is no single server to shut down. It is not one game but every game anyone can imagine.

## Decisions so far

- **Visuals come first**, or nearly first. Seeing it is a key part of the idea, so the first demo is visual, not text.
- **Realms enforce their own rules.** A realm verifies that its rules are followed inside it. Worst case, the realm decides an object is no longer inside.
- **Every realm and every object has its own public/private key pair.** That key pair is its identity.
- **"Body" is just one kind of object.** Players may create any number of objects.
- **Whoever owns an object runs its code.** Ownership can be given away; the new owner then runs the code.
- **The server is small enough to clone and run.** Many interchangeable servers, none in charge.

## Why now (the pitch)

- Writing a custom world used to cost months of skilled work. With an AI coding agent it costs a conversation.
- Two worlds that do not quite fit together used to stay apart. Now an agent can write the missing piece at the door, in seconds.
- So the old tradeoff (one central server for compatibility, or freedom and fragmentation) goes away. Compatibility is worked out per visit, by agents.

## Core model

**Object.** Anything a player creates: a body, a sword, a house, a planet, a swarm. It has a key pair, code, state, and a look. It runs on the device of whoever owns it.

**Realm.** An object that other objects can be inside. It runs the rules and the shared space for whatever is inside it. Realms can nest (a room inside a ship inside a galaxy), and any object can also be a realm (tiny creatures living in your coat).

**Owner.** The player whose device runs an object's code. Owning means "I run it, I hold its private key, I answer for it."

**Contract.** A named, versioned description of messages and what they mean, readable by both humans and AI agents. For example `swordfight/1` might define `strike`, `damage`, `die`. A contract is identified by the hash (a fingerprint) of its text, so no one needs to run a registry. Popular contracts become standards by being popular, the way file formats do.

**Manifest.** What each object publishes: its public key, which contracts it requires, offers, and refuses, how to draw it, and its house rules.

**Entering.** An object asks to enter a realm. Both sides compare manifests. If the object lacks a required contract, its owner's agent can offer to write it right then ("This realm needs `swordfight/1`. Want me to add it? About 30 seconds.").

## Who decides what happened?

If I swing a sword at you, my code runs on my device and yours on yours, and anyone can lie. The answer:

1. **The realm is the referee inside the realm.** It runs the physics and the rules, and it checks that every object inside follows them. A sword-fighting realm keeps its own damage count for each visitor and calls `die` when the count runs out. If a visitor's code refuses to die, or reports things the realm's rules do not allow, the realm can simply declare that object no longer inside. The realm's authority ends at its border.
2. **What happens after leaving belongs to the object and its owner.** A realm can throw you out, or kill your presence inside it, but it cannot reach your device. Your object's own code (and perhaps the server, for bookkeeping) decides what leaving means: back home, a ghost, a scar, nothing at all.
3. **Things that cross realms carry signatures.** A realm's record ("this sword killed 12 opponents here") is a statement signed by the realm. Another realm decides whether it trusts that statement. Value between worlds comes from trust between realms, not from a central ledger.

## Objects, ownership, and code that changes hands

This is the newest and most interesting part.

- **Realm-bound objects.** A realm can keep weapons (or anything) that never leave it. The realm owns and runs them. Visitors can use them only inside.
- **Objects that leave with a player.** A realm can let an object go with a visitor, but that costs the realm: the object is no longer the realm's. Ownership moves to the player, and from then on the player's device runs the object's code.
- **Gifts between players.** One player can fully give an object to another. The receiver takes on running its code.
- **Receiving code means running someone else's code.** So every received object runs in a sealed sandbox (in a browser, a separate worker with no access to anything except the messages the runtime passes it). The receiver's agent can read the code before accepting, like customs inspecting a package.
- **The key goes with the object.** Giving an object means handing over its private key and a signed transfer note ("A gives object X to B"). The chain of transfer notes is the object's ownership history.
- **Open problem: copies.** The giver could keep a copy of the key and the code, and so could "give" the same sword twice. Without a shared ledger this cannot be prevented, only detected: two conflicting transfer notes prove cheating. Realms that care about rare items can check the history and refuse objects with conflicting notes. Realms that do not care (most of them) can ignore it. This is the same problem Bitcoin's blockchain exists to solve; the bet here is that most worlds will not need that much machinery.

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
