# EveryGame: brainstorm

Started 2026-09-24. Sources: Ace's chat notes of 2026-09-24 and the earlier "Sovereign Nodes Game" design document (summarized here, not copied).

## The idea in one paragraph

A massively multiplayer world where both the code and the running of that code are spread across the players. Every player has a body and a realm. Their own AI coding agent writes the code for both, and it runs on their own device. A body can visit a realm if it implements what the realm requires (a realm might require `strike` and `take_damage`; another might require `kiss` and `caress`). There is no central server to shut down: like Bitcoin, the "server" is a protocol that anyone can run. It is not one game but every game anyone can imagine.

## What changed from the earlier design document

- The earlier document kept one thin central service. The new idea keeps the service thin but makes it a program anyone can clone and run, so there are many interchangeable servers and none is in charge. Identity becomes a key pair, so no server owns your account.
- The earlier document treated the AI as background. The new idea puts it at the center: "your own AI coder understands all this and writes it." That is the reason this is possible in 2026 and was not before. Until now, every participant in a world like this would have had to be a programmer.
- Kept from the earlier document: bodies and realms are the same basic thing in different roles; realms can nest; dangerous actions are proposals the target decides on; entry depends on computed compatibility; offline means frozen.

## Why now (the pitch)

- Writing a custom world used to cost months of skilled work. With an AI coding agent it costs a conversation.
- Two worlds that do not quite fit together used to stay apart. Now an agent can write the adapter at the door, in seconds.
- So the old tradeoff (central server for compatibility, or freedom and fragmentation) goes away. Compatibility can be negotiated per visit by agents.

## Core model

**Node.** One running program on one player's device. A body and a realm are both nodes. A body is tuned for moving and acting; a realm is tuned for holding and hosting. Your body can also be a realm (tiny creatures living in your coat).

**Contract.** A named, versioned description of a set of messages and what they mean, written for both humans and AI agents to read: for example `combat/1` defines `strike`, `take_damage`, `health`. A contract is identified by the hash of its text, so no one needs to own a registry. Popular contracts become standards by being popular, the way file formats do.

**Manifest.** What each node publishes: who it is (public key), which contracts it requires, which it offers, which it refuses, how to draw it, and its house rules.

**Visit.** A body asks to enter a realm. Both sides compare manifests. If the body lacks a required contract, its agent can offer to write it right then ("This realm needs `trade/2`. Want me to add it? About 30 seconds.").

## The hardest problem: who decides what happened?

If I swing a sword at you, my code runs on my device and yours on yours. Who decides whether you were hit? Everyone can lie, since everyone runs their own code. Proposed answer, in three rules:

1. **The realm is the referee inside the realm.** The realm owner runs the physics and the rules. Visitors send intentions ("I swing, this direction, this strength") and receive what they see. This is how ordinary online games already work, with the realm owner's device playing the role of the game server. If you do not trust a realm's refereeing, leave.
2. **Your body is yours outside the realm.** While you visit, the realm keeps a local copy of you (health, position, what you hold there). Your permanent self (identity, memories, possessions you care about) stays on your device. When you leave, you choose what to carry out. A realm can kill your local copy; it cannot touch the real you. Like a passport versus a hotel room.
3. **Things that cross realms carry signatures.** A sword won in realm A is a statement signed by A: "I gave this to player X." Realm B decides whether it trusts A's word. Value across worlds comes from trust between realms, not from a central ledger.

This removes most cheating incentives without any central authority: inside a realm the owner decides, and between realms trust is explicit.

## Contracts and code: what actually runs where

- By default nodes only exchange messages; no one runs anyone else's code. This is the safest starting point.
- Low latency (fast action games) may later need the realm to run a small piece of the visitor's code locally. That code would run in a sealed sandbox (WebAssembly, a portable format for running untrusted code safely), with only the powers the realm grants it.
- A contract is a text document plus a machine-readable message schema. The AI agent reads the text; the software checks the schema.

## The "central server" is a program anyone can run

Goal (Ace, 2026-09-24): the server code is simple enough that anyone can clone this repository and start running their own server. There is not one central server but many interchangeable copies, like Bitcoin nodes or Nostr relays.

- **What a server does.** Only three things: store signed announcements (a node's manifest and where to reach it), tell who is online, and pass messages between two peers that cannot connect directly (for example, because both are behind home routers).
- **What a server cannot do.** Everything it stores is signed by the player who wrote it, so a server cannot forge a player, a realm, or an item. It holds no game state and makes no rules. A bad or dead server is simply one you stop using.
- **Servers do not need to talk to each other.** A player lists a few servers they like; a realm announces itself on several. No syncing between servers, no voting, no shared ledger. This is the design choice that keeps the server small. (Servers copying each other's announcements could come later as an option.)
- **Identity:** a public key. No sign-up anywhere, so switching servers loses nothing.
- **Size target:** one small program with few dependencies that runs with one command on any cheap machine. If it grows past a few hundred lines, that is a warning sign that game logic is leaking into it.
- Later option: a shared lookup table spread across players (a "distributed hash table", as BitTorrent uses) could remove the need for servers for finding realms, but it is not needed for the first version.

## Seeing each other

- Each viewer's own device draws the scene. The realm sends a scene description; each visiting body supplies its own look.
- A realm may restrict looks (a realm of ghosts renders everyone translucent), and a viewer may simplify anything (show everyone as a colored dot).
- Start simpler than 3D. Text first (see below), then 2D, then 3D.

## Offline, safety, and law

- Offline realms freeze. Friends can agree to host copies. Being online becomes part of the story: ruins, sealed doors, sleeping gods.
- Safety has no central moderator, so it lives on each person's side: your own agent reads a realm's manifest and warns you, your client filters what you see, and you keep block lists and share them with friends if you like.
- Law: like the web or BitTorrent, the protocol cannot enforce law centrally. Each person is responsible for what their own nodes do. This needs honest treatment in the project docs, not hand-waving.

## A first version that proves the idea

Recommendation: begin as a text world (like the old multi-user dungeons, "MUDs"), because it isolates the new part (sovereign nodes, contracts, agents writing code) from the separately hard part (3D graphics and fast networking).

1. **Protocol draft.** A short spec: manifest, contract format, visit handshake, intention and observation messages, leave.
2. **Reference node runtime.** A small program that hosts one node, speaks the protocol, and loads the player's own code for their body and realm.
3. **Agent guide.** An instructions file that any AI coding agent can read to build a body or realm for its player. This is the most important deliverable, since players will not read specs; their agents will.
4. **Two realms, two bodies, one pair of contracts.** For example a sword-fighting arena and a tea house; one fighter body and one gentle body. Show a failed entry, an agent writing the missing contract on the spot, and a successful visit.
5. **Networking.** Local network first, then across the internet with peer-to-peer connection tools.

Success test: two people on two machines, each with their own AI agent, each build something the other did not foresee, and they meet.

## Open questions for Ace

- Text first, or is seeing it in 2D/3D essential from the very first demo?
- Language and platform for the runtime: Python (fast to build, fits your tooling) versus TypeScript in the browser (anyone can join by opening a page, and it grows into 3D naturally).
- Should realm owners be absolute referees, or should visitors be able to demand some guarantees (for example "you may not keep my copy after I leave")?
- Is a small set of built-in contracts (moving, speaking, seeing) acceptable, or must even those be optional?
- Name: "EveryGame" is the folder name. Keep it?
