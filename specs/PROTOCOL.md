# The Endless Mind protocol

**Status: draft, version 0.** The core parts and the version 0 formats below are implemented by the reference code in this repository. Object descriptions and most extensions are outlined here but not yet specified in detail. Links start with `emind:`. The design behind the protocol is in [DESIGN.md](DESIGN.md), and the words used here are defined there under "Words used here".

## What it is for

Endless Mind is meant to be a worldwide network, like the World Wide Web. The web works because a few small rules let anything connect: addresses (URLs), a way to ask for things (HTTP), and a page format (HTML). None of them says what a website may be. The Endless Mind protocol aims for the same: a shared way to connect, so that any realm, object or app made by anyone, in any language or engine, can meet any other.

## Rules for the rules

1. **Rules describe how to connect, never what may be built.** A rule that limits what someone can create does not belong in the protocol.
2. **The core stays tiny.** It holds only what two strangers' software must share to talk at all.
3. **Everything else is an optional extension.** Anyone can write one without asking permission or registering it anywhere. Extensions are named so names cannot collide: a dotted name starting with something the author controls, such as a domain name they own written in reverse (`com.example.chess`) or their key. Names without a dot belong to the core.
4. **Ignore what you do not understand; never reject it.** Unknown fields, message kinds and extensions are skipped, so new ideas never break old software.
5. **Versions are added, never forced.** A new version may change how things are encoded or sent, but apps agree on a version each time they connect, and an older version keeps working as long as people still run it (see "Versions").
6. **Nothing needs a central authority.** No registry, no gatekeeper, no official server. If this project disappeared, the protocol would still work.

## The core

| Part               | What it defines                                                                    |
| ------------------ | ---------------------------------------------------------------------------------- |
| Identity           | Key pairs; an address is a public key; the neutral link format                     |
| Content            | Files named by their hash; a signed manifest listing an object's files             |
| Messages           | One signed envelope (from, to, kind, body, time) that works over any connection    |
| Announcements      | Signed "here I am" notes: key, tags, how to reach me, expiry                       |
| Object description | How an object lists its callable functions, their code, and its encrypted parts    |
| Runtime interface  | The few calls sandboxed object code can make, such as send, receive and save state |

- **Identity.** Every object is a key pair, and its address is its public key. A realm's link is that key, so no website or company owns it, and any app can open it.
- **Content.** Every file is named by its hash, so anyone holding a copy can serve it and anyone receiving it can check it. A manifest lists an object's files by hash and is signed by the object's key.
- **Messages.** One envelope for everything: who sent it, to whom, what kind of message, the body, the time, and the sender's signature. It does not care how it travels (WebSocket, WebRTC, a relay, or anything later).
- **Announcements.** How an object that wants to be found says so: its key, its tags, where to reach it, and when the note expires. Servers and directories keep and index them; peers can pass them along.
- **Object description.** How an object publishes what others may call and the code behind it, with any encrypted parts marked, so any other object can examine it before trusting it.
- **Runtime interface.** The small, fixed set of calls that object code (JavaScript or WebAssembly) may use from inside its sandbox. This is what lets the same realm code run unchanged in the browser app, an app written from scratch in Rust, or an app built with Unreal, Godot or Unity. It plays the role WASI plays for WebAssembly: a standard set of calls that works in any host program. Version 0 is in [RUNTIME.md](RUNTIME.md).

## Version 0 formats

The exact shapes used by the reference code ([shared/](../shared/)). These are the hardest things to change once in use.

- **Addresses:** `ed25519-` followed by the 32-byte public key in lowercase base32 (RFC 4648 alphabet, no padding): 60 characters, only lowercase letters, digits and one hyphen. Lowercase base32 survives case-insensitive systems, fits in one host-name label (so it can be part of a web address such as `<address>.example.org`), and selects with a double-click.
- **Hashes:** `sha256-` followed by the 32-byte SHA-256 digest in lowercase base32. A file's hash covers its raw bytes exactly as stored, with no other processing.
- **Allowed methods:** version 0 accepts only `ed25519` keys and signatures and `sha256` hashes. Anything else is rejected, never guessed at; later versions add methods explicitly, so no one can force a weaker one.
- **Text rules:** base32 uses the RFC 4648 alphabet in lowercase with no padding; uppercase or padded forms are rejected, not converted, so each value has exactly one written form.
- **Signatures:** `ed25519-` followed by the 64-byte signature in lowercase base32.
- **Links:** the canonical form is `emind:<address>`, which means the realm as it is now (its owner can publish new versions). `emind:<address>?release=<release hash>` pins one exact version: an app opening it must refuse to run any other version, and should offer the current one instead, so a player can look at an update before trusting it. A release hash is the hash of the canonical JSON of the realm's signed manifest envelope. Links work like `mailto:` or `magnet:` (no `//`, since an address is a key, not a host computer). Because chat apps and web pages make only `https` links clickable, the form people share is `https://<any server>/#emind:<address>`. The part after `#` is never sent to the server, and any server works, since the key names the realm. Browser apps may register as handlers for `web+emind:` links (browsers only let web pages handle link types starting with `web+`); installed apps may handle `emind:` directly.
- **Envelope:** a JSON object with `v` (protocol version, `"emind/0"`), `id` (random, at least 16 characters), `from`, `to` (an address, or `null` for a public statement), `kind`, `body`, `time` (milliseconds since 1970) and `sig`. Senders may add more fields.
- **What is signed:** every field of the envelope except `sig`, including fields the receiver does not know, so later additions stay signed and are passed on intact. The fields are written as canonical JSON as defined by RFC 8785 (JSON Canonicalization Scheme), so any language can reproduce the exact text.
- **Purpose labels:** every signature covers the text `emind-<purpose>`, a line break, then the signed content: `emind-envelope` for envelopes, `emind-claim` for proving a key to a server. A claim signs the server's name as the client reached it (for example `example.org:8000`), a line break, then the server's random challenge, so a dishonest server cannot pass the signature on to pose as the player elsewhere. A signature made for one purpose can never be passed off as another.
- **Replays:** a receiver ignores an envelope whose `from` and `id` it has already seen, or whose `time` is more than 10 minutes from its own clock, so a recorded message cannot be sent again later.
- **Limits:** a received message may be at most 256 KB of text and nested at most 32 levels deep, and an object may not repeat a field name (different languages' parsers disagree about repeats, which would let one message mean two things). Messages breaking these limits are dropped.
- **Manifests** carry a `needs` list naming the permissions the realm asks the player's app for (storage, network, camera, and so on). Version 0 defines none, so the list is empty; an app must refuse to run a realm that needs something it does not know.
- **Test vectors:** [test-vectors.json](test-vectors.json) gives fixed inputs and the exact outputs (base32, canonical JSON, hashes, an address, a signature, an envelope, a release hash) that every implementation must reproduce.
- **Message kinds:** core kinds have no dot (`manifest`, `announce`). Extension kinds are dotted, following rule 3; the extensions written alongside these documents use the prefix `emind.` (for example `emind.enter`, listed in [RUNTIME.md](RUNTIME.md)).

## Shared habits: optional extensions

These are not rules. They are optional extensions, and they matter only as long as people find them useful. The reference app uses them by default; anyone may ignore or replace them. Entering and leaving a realm, and tag search, are implemented (see [RUNTIME.md](RUNTIME.md)); the others are outlined in [DESIGN.md](DESIGN.md).

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

HTTP has gone through versions (1.0, 1.1, 2, 3) as technology matured: each sent the same requests and pages in a better way, and old and new software kept working together. The Endless Mind protocol is expected to grow the same way.

- **Meaning is separate from encoding.** The meaning of the core (keys, addresses, signed statements, files named by hash) changes rarely. How messages are encoded and carried can change much more freely, as HTTP/2 and HTTP/3 changed how requests travel without changing what a request is.
- **Apps agree on a version when they connect.** Each side says which versions it speaks, and they use the newest one both understand. Announcements list the versions a peer speaks.
- **Old versions fade, they are not shut off.** An old version stays usable as long as people run software that speaks it. No one can switch it off for everyone, only stop using it.
- **Algorithms carry labels.** Every key, hash and signature says which method made it (for example `ed25519-` or `sha256-`), so a stronger method can be added later, such as one that resists future quantum computers, without changing the meaning of anything else.
- **Addresses and signed history survive every version.** A key made under an early version is still the same address later, a file's hash still names the same file, and an old signature still checks. Moving to a new algorithm is done the same way as giving an object: the old key signs a note naming the new one.
- **Extensions have versions of their own,** chosen and changed by their authors, independent of the core.

## How the protocol changes

- **Numbered proposals, in the open,** like the internet's RFCs (its numbered public design documents). Anyone can write one, for the core or for an extension.
- **A proposal counts when independent apps implement it,** not when someone approves it. "Rough consensus and running code," as the people who built the internet put it.
- **The core changes only by new versions,** following "Rules for the rules". Extensions change whenever their authors and users like.
- **This repository holds the reference documents and the reference app,** but it is a convenience, not an authority. Anyone may copy the documents and carry on.
