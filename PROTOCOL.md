# EveryGame protocol: an outline

Draft, started 2026-10-04. This is the shape of the protocol, not the protocol itself; the details come later as numbered proposals. The design behind it is in [BRAINSTORM.md](BRAINSTORM.md), and the words used here are defined there under "Words used here".

## What it is for

EveryGame is meant to be a worldwide network, like the World Wide Web. The web works because a few small rules let anything connect: addresses (URLs), a way to ask for things (HTTP), and a page format (HTML). None of them says what a website may be. The EveryGame protocol aims for the same: a shared way to connect, so that any realm, object or app made by anyone, in any language or engine, can meet any other.

## Rules for the rules

1. **Rules describe how to connect, never what may be built.** A rule that limits what someone can create does not belong in the protocol.
2. **The core stays tiny.** It holds only what two strangers' software must share to talk at all.
3. **Everything else is an optional extension.** Anyone can write one without asking permission or registering it anywhere. Extensions are named so names cannot collide, for example by the hash of their description or by their author's key.
4. **Ignore what you do not understand; never reject it.** Unknown fields, message kinds and extensions are skipped, so new ideas never break old software.
5. **Versions are added, never forced.** A new version may change how things are encoded or sent, but apps agree on a version each time they connect, and an older version keeps working as long as people still run it (see "Versions").
6. **Nothing needs a central authority.** No registry, no gatekeeper, no official server. If this project disappeared, the protocol would still work.

## The core

| Part | What it defines |
|---|---|
| Identity | Key pairs; an address is a public key; the neutral link format |
| Content | Files named by their hash; a signed manifest listing an object's files |
| Messages | One signed envelope (from, to, kind, body, time) that works over any connection |
| Announcements | Signed "here I am" notes: key, tags, how to reach me, expiry |
| Object description | How an object lists its callable functions, their code, and its encrypted parts |
| Runtime interface | The few calls sandboxed object code can make, such as send, receive and save state |

- **Identity.** Every object is a key pair, and its address is its public key. A realm's link is that key, so no website or company owns it, and any app can open it.
- **Content.** Every file is named by its hash, so anyone holding a copy can serve it and anyone receiving it can check it. A manifest lists an object's files by hash and is signed by the object's key.
- **Messages.** One envelope for everything: who sent it, to whom, what kind of message, the body, the time, and the sender's signature. It does not care how it travels (WebSocket, WebRTC, a relay, or anything later).
- **Announcements.** How an object that wants to be found says so: its key, its tags, where to reach it, and when the note expires. Servers and directories keep and index them; peers can pass them along.
- **Object description.** How an object publishes what others may call and the code behind it, with any encrypted parts marked, so any other object can examine it before trusting it.
- **Runtime interface.** The small, fixed set of calls that object code (JavaScript or WebAssembly) may use from inside its sandbox. This is what lets the same realm code run unchanged in the browser app, an app written from scratch in Rust, or an app built with Unreal, Godot or Unity. It plays the role WASI plays for WebAssembly: a standard set of calls that works in any host program.

## Shared habits: optional extensions

These are not rules. They are published as optional extensions, and they matter only as long as people find them useful. The reference app ships with them as defaults; anyone may ignore or replace them.

- Entering and leaving a realm, and lending an in-realm form
- Signed commands and official results; hosting permissions
- Giving an object to another key, with its signed transfer note
- Realm state updates, and the shared state layout that lets one renderer draw many realms
- The simple 3D look format, and glTF models
- The character's general API (name, look, description, what it carries)
- Signed statements a realm gives a character ("won 12 fights here")
- Tag search, published lists, and the realm manifest's "how it can be played"
- Character files and encrypted backups

## Versions

HTTP has gone through versions (1.0, 1.1, 2, 3) as technology matured: each sent the same requests and pages in a better way, and old and new software kept working together. The EveryGame protocol is expected to grow the same way.

- **Meaning is separate from encoding.** The meaning of the core (keys, addresses, signed statements, files named by hash) changes rarely. How messages are encoded and carried can change much more freely, as HTTP/2 and HTTP/3 changed how requests travel without changing what a request is.
- **Apps agree on a version when they connect.** Each side says which versions it speaks, and they use the newest one both understand. Announcements list the versions a peer speaks.
- **Old versions fade, they are not shut off.** An old version stays usable as long as people run software that speaks it. No one can switch it off for everyone, only stop using it.
- **Algorithms carry labels.** Every key, hash and signature says which method made it (for example `ed25519:` or `sha256:`), so a stronger method can be added later, such as one that resists future quantum computers, without changing the meaning of anything else.
- **Addresses and signed history survive every version.** A key made under an early version is still the same address later, a file's hash still names the same file, and an old signature still checks. Moving to a new algorithm is done the same way as giving an object: the old key signs a note naming the new one.
- **Extensions have versions of their own,** chosen and changed by their authors, independent of the core.

## How the protocol changes

- **Numbered proposals, in the open,** like the internet's RFCs (its numbered public design documents). Anyone can write one, for the core or for an extension.
- **A proposal counts when independent apps implement it,** not when someone approves it. "Rough consensus and running code," as the people who built the internet put it.
- **The core changes only by new versions,** following "Rules for the rules". Extensions change whenever their authors and users like.
- **This repository holds the reference documents and the reference app,** but it is a convenience, not an authority. Anyone may copy the documents and carry on.
