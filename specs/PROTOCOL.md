# The Endless Mind protocol

**Status: draft, version 0.** The core parts and the version 0 formats below are implemented by the reference code in this repository. Links start with `emind:`. The design behind the protocol is in [DESIGN.md](DESIGN.md), and the words used here are defined there under "Words used here".

## What it is for

Endless Mind is meant to be a worldwide network, like the World Wide Web. The web works because a few small rules let anything connect: addresses (URLs), a way to ask for things (HTTP), and a page format (HTML). None of them says what a website may be. The Endless Mind protocol aims for the same: a shared way to connect, so that any realm, object or app made by anyone, in any language or engine, can meet any other.

## Rules for the rules

1. **Rules describe how to connect, never what may be built.** A rule that limits what someone can create does not belong in the protocol.
2. **The core stays tiny.** It holds only what two strangers' software must share to talk at all.
3. **Everything else is an optional extension.** Anyone can write one without asking permission or registering it anywhere. Extensions are named so names cannot collide: a dotted name starting with something the author controls, such as a domain name they own written in reverse (`com.example.chess`) or their key. Names without a dot belong to the core.
4. **Ignore what you do not understand; never reject it.** Unknown fields, message kinds and extensions are skipped, so new ideas never break old software.
5. **Versions are added, never forced.** A new version may change how things are encoded or sent, but an older version keeps working as long as people still run it (see "Versions").
6. **Nothing needs a central authority.** No registry, no gatekeeper, no official server. If this project disappeared, the protocol would still work.

## The core

| Part               | What it defines                                                                    |
| ------------------ | ---------------------------------------------------------------------------------- |
| Identity           | Key pairs; an address is a public key; the neutral link format                     |
| Content            | Files named by their hash; a signed manifest listing a realm's files               |
| Messages           | One signed envelope (from, to, kind, body, time) that works over any connection    |
| Announcements      | Signed "here I am" notes kept by servers: key, name, tags, manifest, expiry        |

- **Identity.** Every object is a key pair, and its address is its public key. A realm's link is that key plus hints saying which servers it is announced on, so no website or company owns it, and any app can open it.
- **Content.** Every file is named by its hash, so anyone holding a copy can serve it and anyone receiving it can check it. A manifest lists a realm's public files by hash and is signed by the realm's key.
- **Messages.** One envelope for everything: who sent it, to whom, what kind of message, the body, the time, and the sender's signature. It does not care how it travels (today, a server's relay over WebSocket).
- **Announcements.** How a realm that wants to be found says so: its key, name, tags, manifest, and when the note expires. A server keeps the announcements sent to it and answers searches by tag. Where a realm is announced is carried in its links, as hints.
- **Reference runtime.** The JavaScript callbacks, storage interface, hosting controls and backup format are reference-software conventions. They are not requirements for another engine. The optional session extension lets different runtimes exchange actions and views; see [RUNTIME.md](RUNTIME.md).

## Version 0 formats

The exact shapes used by the reference code ([shared/](../shared/)). These are the hardest things to change once in use.

- **Addresses:** `ed25519-` followed by the 32-byte public key in lowercase base32 (RFC 4648 alphabet, no padding): 60 characters, only lowercase letters, digits and one hyphen. Lowercase base32 survives case-insensitive systems, fits in one host-name label (so it can be part of a web address such as `<address>.example.org`), and selects with a double-click.
- **Hashes:** `sha256-` followed by the 32-byte SHA-256 digest in lowercase base32. A file's hash covers its raw bytes exactly as stored, with no other processing.
- **Allowed methods:** version 0 accepts only `ed25519` keys and signatures and `sha256` hashes. Anything else is rejected, never guessed at; later versions add methods explicitly, so no one can force a weaker one.
- **Text rules:** base32 uses the RFC 4648 alphabet in lowercase with no padding; uppercase or padded forms are rejected, not converted, so each value has exactly one written form.
- **Signatures:** `ed25519-` followed by the 64-byte signature in lowercase base32.
- **Links:** the canonical form is `emind:<address>?via=<encoded-origin>[,<encoded-origin>...]`, optionally followed by `&release=<release hash>`. The address names the realm; `via` lists URL-encoded http or https server origins (older host-only hints remain accepted) where the realm is announced and refereed. An address alone says nothing about where to find the realm, since servers do not talk to each other and there is no shared lookup table, so a link works on the servers it names. The trusted app contacts the first hinted server directly, without navigating to its app or copying any private key. If opening fails, it offers the remaining hints. Because the key names the realm, a realm can move to other servers and old links stay valid; only the hints go stale. Without `release`, a link means the realm as it is now. `release` pins one exact version: an app opening it must refuse to run any other version and say the version changed, so a player can look at an update before trusting it. A release hash is SHA-256 of the canonical JSON of the manifest body. Signing or announcing unchanged content does not change its release. This draft revision replaces the former envelope hash; old pinned links need to be copied again. Apps ignore query parameters they do not know. Links work like `mailto:` or `magnet:` (no `//`, since an address is a key, not a host computer). Because chat apps and web pages make only `https` links clickable, the form people share is `https://<trusted-app>/#emind:<address>?via=<encoded-origin>`; the part after `#` is never sent to the server. Browser apps may register as handlers for `web+emind:` links (browsers only let web pages handle link types starting with `web+`); installed apps may handle `emind:` directly.
- **Envelope:** a JSON object with `v` (protocol version, `"emind/0"`), `id` (random, at least 16 characters), `from`, `to` (an address, or `null` for a public statement), `kind`, `body`, `time` (milliseconds since 1970) and `sig`. Senders may add more fields. A receiver reads only envelopes whose `v` it speaks and ignores the rest.
- **What is signed:** every field of the envelope except `sig`, including fields the receiver does not know, so later additions stay signed and are passed on intact. The fields are written as canonical JSON as defined by RFC 8785 (JSON Canonicalization Scheme), so any language can reproduce the exact text.
- **Purpose labels:** every signature covers the text `emind-<purpose>`, a line break, then the signed content: `emind-envelope` for envelopes, `emind-claim` for proving a key to a server. A claim signs the server's name as the client reached it (for example `example.org:8000`), a line break, then the server's random challenge, so a dishonest server cannot pass the signature on to pose as the player elsewhere. For that to hold, a server must know its own names and refuse a claim made under any other; it cannot take its name from the request. A signature made for one purpose can never be passed off as another.
- **Relay:** a WebSocket connection to a server proves which addresses it holds before messages for them are delivered to it. The server's first message is `{type:"welcome", versions, time}`, where `time` is its clock, so a client can tell when its own clock is off. The client sends `{type:"claim", address}`; the server answers `{type:"challenge", address, nonce}`; the client sends `{type:"prove", address, sig}`, signing under purpose `emind-claim`; the server answers `{type:"claimed", address}`. Then `{type:"send", envelope}` relays an envelope from a claimed address, delivered as `{type:"deliver", envelope}`. If the receiver is absent or cannot keep up, the message is dropped and the sender gets `{type:"undeliverable", to}`; a sender over the server's traffic limit gets `{type:"error", error}` and its message is dropped. A server never disconnects a receiver for being flooded. When a later connection proves the same address, the server sends the earlier one `{type:"replaced", address}` and stops delivering to it, so the most recent connection wins on that server. The replaced connection also loses permission to send. Different servers make independent choices; no global hosting election is implied. `{type:"release", address}` gives an address up (a referee leaving its realm), so the realm shows as offline. Messages are signed but not encrypted to the receiver, so the server can read them.
- **Replays:** a receiver ignores an envelope whose `from` and `id` it has already seen, or whose `time` is more than 10 minutes from its own clock, so a recorded message cannot be sent again later.
- **Limits:** a received message may be at most 256 KB of text and nested at most 32 levels deep, and an object may not repeat a field name (different languages' parsers disagree about repeats, which would let one message mean two things). Messages breaking these limits are dropped.
- **Manifests** are envelopes of kind `manifest`, addressed to `null` and signed by the realm's key. The body has `name` (at most 200 characters), `description` (at most 2,000), `tags`, `files` (file name to hash, at most 256 files) and `needs`, plus three optional fields: `main` (the rules file, left out when the rules are private, known only to the referee), `renderer` (the default browser renderer, left out when the realm cannot be played in a browser) and `app` (`{ name, url }`, the realm's own app and the https address where players get it). `needs` names the permissions the realm asks the player's app for (storage, network, camera, and so on). Version 0 defines none, so the list is empty; an app must refuse to run a realm that needs something it does not know.
- **Server:** a helper server answers these HTTP routes. `POST /announce` keeps a signed announcement, replacing an older one from the same address; an announcement may expire at most a week (plus a day) ahead. `POST /announce` with a bare manifest body that names public rules keeps a release with no key (see "Releases without a key"), answering `{ ok, release }`. `PUT /blob/<hash>` stores a file of at most 2 MB if its bytes match the hash and a live announcement or release lists it, so a realm is announced first and its files uploaded after; `GET /blob/<hash>` returns it. A file is deleted once nothing live lists it. `GET /announce/<address>` returns `{ announcement, online }`, where `online` says whether a connection has proved that address on the relay. `GET /announce?tag=<tag>` lists unexpired realms, online ones first, as `{ realms: [{ address, name, tags, online, time }] }` (all realms without `tag`). A release with no key is listed with its hash as `address` and counts as online, unless an announced realm already names it. The relay is a WebSocket at `/ws` (see "Relay"). HTTP API routes allow cross-origin access without credentials so a trusted app can use a separate helper server. Operators set local resource quotas; these do not interpret realm rules.
- **Releases without a key:** a manifest body is itself a file: its canonical JSON, named by its hash, which is the release hash. Posted bare to a server, it is kept for a week and renewed by posting it again, by anyone, so a release stays while people use it. Because it names its rules, anyone can fetch it by hash and run their own copy with no referee and no key. Its link is `emind:<release hash>?via=...`.
- **Realm keys:** a player's app holds one 32-byte secret and uses a separate key in each realm, so realms cannot link a player by address. The key for a realm is the Ed25519 key whose 32-byte seed is HKDF-SHA-256 of the secret (as key material) with salt `emind-realm-key` and info the realm's address, both as UTF-8. Every app that follows this gives the same player the same address in the same realm.
- **Test vectors:** [test-vectors.json](test-vectors.json) gives fixed inputs and the exact outputs (base32, canonical JSON, hashes, an address, a signature, an envelope, a release hash, a realm key) that every implementation must reproduce.
- **Message kinds:** core kinds have no dot (`manifest`, `announce`). Extension kinds are dotted, following rule 3; the extensions written alongside these documents use the prefix `emind.` (for example `emind.enter`, listed in [RUNTIME.md](RUNTIME.md)).

## Shared habits: optional extensions

These are not rules. They are optional extensions, and they matter only as long as people find them useful. The reference app uses them by default; anyone may ignore or replace them.

- Sessions bound to a running instance and release, ordered actions and views, and character descriptions (see [RUNTIME.md](RUNTIME.md))
- The reference JavaScript runtime, optional realm-local storage, hosting UI, and local backups
- A separate key in each realm, made from the player's one secret (see "Realm keys" above)
- Signed announcements with tags, and tag search on a server

## Versions

HTTP has gone through versions (1.0, 1.1, 2, 3) as technology matured: each sent the same requests and pages in a better way, and old and new software kept working together. The Endless Mind protocol is expected to grow the same way.

- **Meaning is separate from encoding.** The meaning of the core (keys, addresses, signed statements, files named by hash) changes rarely. How messages are encoded and carried can change much more freely, as HTTP/2 and HTTP/3 changed how requests travel without changing what a request is.
- **Every envelope names its version** (`v`), and a server's first message on a relay connection lists the versions it speaks. Only version 0 exists, so nothing is negotiated yet; these two places are where agreeing on a version will happen.
- **Old versions fade, they are not shut off.** An old version stays usable as long as people run software that speaks it. No one can switch it off for everyone, only stop using it.
- **Algorithms carry labels.** Every key, hash and signature says which method made it (for example `ed25519-` or `sha256-`), so a stronger method can be added later, such as one that resists future quantum computers, without changing the meaning of anything else.
- **Addresses and signatures survive every version.** A key made under an early version is still the same address later, a file's hash still names the same file, and an old signature still checks. How an address moves to a new algorithm is not defined yet.
- **Extensions have versions of their own,** chosen and changed by their authors, independent of the core.

## How the protocol changes

- **Numbered proposals, in the open,** like the internet's RFCs (its numbered public design documents). Anyone can write one, for the core or for an extension. None has been written yet.
- **A proposal counts when independent apps implement it,** not when someone approves it. "Rough consensus and running code," as the people who built the internet put it.
- **The core changes only by new versions,** following "Rules for the rules". Extensions change whenever their authors and users like.
- **This repository holds the reference documents and the reference app,** but it is a convenience, not an authority. Anyone may copy the documents and carry on.
