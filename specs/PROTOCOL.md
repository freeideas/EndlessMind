# Endless Mind protocol

The exact formats: keys, signed JSON, signing in, records, finding realms, game servers, relays, hosts, releases, and burning an identity. Why things are this way is in [DESIGN.md](DESIGN.md).

## Keys and IDs

A key pair is an Ed25519 key pair (Ed25519 is a widely used signature method, built into browsers). Players and realms use the same kind.

- **ID:** the 32-byte public key in base32 (RFC 4648 alphabet, lowercase, no padding): 52 characters of `a-z` and `2-7`.
- **Secret phrase:** 24 words from the BIP39 English word list, encoding 256 random bits plus an 8-bit checksum, as BIP39 says.
- **From phrase to key:** the BIP39 seed with an empty passphrase (PBKDF2 with HMAC-SHA512, 2048 rounds, salt `mnemonic`), then the SLIP-0010 Ed25519 master key: HMAC-SHA512 with key `ed25519 seed` over the seed, keeping the first 32 bytes as the Ed25519 private key.
- **Example:** the phrase of 23 times `abandon` then `art` (all-zero entropy; never use it) gives the ID `pl5hdegz6xnovjc5szio2phhycltxmhdl5zwdp4fqoe2rty4h46a`.

[tests/keys_test.js](../tests/keys_test.js) checks the recipe against the published BIP39 and SLIP-0010 test vectors.

## Signed JSON

Sign-in notes, records, realm cards, release notes and host cards are JSON objects with a `sigs` field: an object mapping each signer's ID to its signature.

- **What is signed:** the object without `sigs` and without `notes` (a player's own words on a record, see "Records"), as canonical JSON (object keys sorted by their UTF-16 code units at every level, no spaces, strings as `JSON.stringify` writes them, numbers only as integers), encoded as UTF-8.
- **A signature:** the 64-byte Ed25519 signature of those bytes, in base64url without padding.
- **Every signer signs the same bytes,** so signatures can be added in any order.
- **Every object carries `v` (the version, `1`) and `type`.** Unknown fields are allowed and are signed like any other.
- **Times** are whole milliseconds since 1970-01-01 UTC. **Size:** at most 16 KB of canonical JSON.

## Signing in

**1. The realm shows a sign-in screen** with a one-time join address, such as `https://game-server.com/sword-of-swankery/join/K7Q2`, in three forms:

- a QR code of an EntryPortal link (below);
- a "sign in on this computer" link: the same EntryPortal link;
- the join address as short text to type, for when scanning fails.

Next to them it warns the player to scan the code only because they just asked to sign in, since a code someone else sends or shows them would sign that person in as them.

**2. The EntryPortal link** is the EntryPortal's address with the join address after `#url=`, URL-encoded, so it never reaches the EntryPortal's server:

```
https://portal.endlessmind.com/#url=<join address>
```

To let a signed-in player change their name, a realm may add `&rename` to the link (and name the EntryPortal from the player's sign-in note): the EntryPortal then shows the name with a box to change it and a "Save and sign in again" button, so the new name arrives in a fresh sign-in note at once.

A realm usually names an address that forwards to the newest version of an EntryPortal, such as `https://portal.endlessmind.com/`, which keeps the part after `#` and lands the player on a versioned address such as `https://portal.endlessmind.com/v0.65/`. A realm that wants to vouch for one exact version names that version instead. Browsers keep storage per site, so every version on one site shares the player's key and records.

**3. The EntryPortal asks once and signs.** For an address from a link, it asks "Sign in the screen in front of you at **game-server.com**?" and one tap confirms. An address the player typed or pasted needs no confirmation. Then it makes the sign-in note:

```json
{
  "v": 1,
  "type": "enter",
  "player": "pl5hdegz6xnovjc5szio2phhycltxmhdl5zwdp4fqoe2rty4h46a",
  "address": "https://game-server.com/sword-of-swankery/join/K7Q2",
  "time": 1790000000000,
  "nonce": "0123456789abcdef",
  "portal": "https://portal.endlessmind.com/v0.65/",
  "sigs": {
    "pl5hdegz6xnovjc5szio2phhycltxmhdl5zwdp4fqoe2rty4h46a": "tz355fzMN3jvQwUMz8VpUhg0ZPfqsubhxWdUo1w_C4wkoQxlwYzn0qCx0acYPWZk9SVkWmtxcwCbl5R5F1jVAg"
  }
}
```

| Field     | Meaning                                                                     |
| --------- | --------------------------------------------------------------------------- |
| `player`  | The player's ID; `sigs` must hold a valid signature by it                   |
| `address` | The join address, exactly as given                                          |
| `time`    | When the note was made                                                      |
| `nonce`   | 16 to 64 random characters                                                  |
| `portal`  | Optional: the EntryPortal's address, so the realm can send records there    |
| `name`    | Optional: the name the player chose, at most 40 characters; not unique      |

**4. Delivery.** The EntryPortal sends the browser to `address` with an HTML form POST (`application/x-www-form-urlencoded`) holding one field, `enter`, whose value is the note as JSON. The realm answers with a page such as "You're in. You can close this page and go back to the game on your screen." It may also sign in the browser that sent the note, which belongs to the same player, and offer a link to play there instead. A realm may also answer a plain visit to a join address by sending the browser on to its EntryPortal link, so the short address works when opened in a phone's browser too.

**5. The realm checks** that the signature by `player` is valid, that `address` is one of its own join addresses, not yet used and less than two minutes old, that `time` is within two minutes of its clock, and that it has not seen `nonce` before. Then it lets in the screen waiting on that join address. What happens next, such as a session cookie, is up to the realm.

The realm's own ID is not in the note: the address already ties the note to the realm, and the player learns the realm's ID from the records it signs.

## Records

```json
{
  "v": 1,
  "type": "record",
  "signers": [
    "4cdgtlj7kdgdl56z7iv2nchdhl44ggz5kdxpdaxemlrr6lrnkrdq",
    "pl5hdegz6xnovjc5szio2phhycltxmhdl5zwdp4fqoe2rty4h46a"
  ],
  "time": 1790000000000,
  "text": "The player finished the Glass Maze in 4 minutes 12 seconds.",
  "sigs": {
    "4cdgtlj7kdgdl56z7iv2nchdhl44ggz5kdxpdaxemlrr6lrnkrdq": "8JiKN06tRM4QO5ZrIV5PhR98aFbVRdThWRDJiSBbusPy5hFW_oldJRI1w0N1zg45aeCI7bcktDyG9Aa662uPCg",
    "pl5hdegz6xnovjc5szio2phhycltxmhdl5zwdp4fqoe2rty4h46a": "xbdxxNPpgcz33ZnI_YLsSwZYWqgjc_bPGbVnFs3j5qkQAM-odPm3wr1WWr5J8wGdSXD8W_0IVB3qJOYPul0FDg"
  }
}
```

| Field     | Meaning                                                    |
| --------- | ---------------------------------------------------------- |
| `signers` | The IDs that must all sign: a realm, its players, anyone   |
| `time`    | When the first signer proposed it                          |
| `text`    | What was agreed, in plain words, at most 1000 characters   |
| `data`    | Optional: the same facts for programs, as a JSON object    |
| `public`  | Optional: `true` if every signer agrees it may be published |
| `notes`   | Optional: signers' own words, outside what is signed       |

- **A record is complete** when every ID in `signers` has a valid signature in `sigs`. An incomplete record proves nothing.
- **Anyone holding a complete record may show it to anyone.** The reader checks the signatures; nobody needs to be contacted.
- **A realm's own statement** has the realm as its only signer. An agreement lists every party.

**A signer's own words.** A signer may add a note to a record: a review, a boast, anything. `notes` maps the writer's ID to their note. On the record above:

```json
"notes": {
  "pl5hdegz6xnovjc5szio2phhycltxmhdl5zwdp4fqoe2rty4h46a": {
    "text": "Harder than it looks.",
    "sig": "lsUkxYlnIY-dR6FSzG1RMMRtLnHrTIjoJn_gEyXJuj4gx2cBhthPX9pOvutiClF01k_1QMUlXFlns_r9_58VAQ"
  }
}
```

- **`text`** is 1 to 500 characters.
- **`sig`** is the writer's signature (as in "Signed JSON") of the canonical JSON of `{ "v": 1, "type": "note", "record": "<hex>", "text": "<the text>" }`, where `record` is the SHA-256, in hex, of the record's signed bytes. So a note belongs to one exact record, its `public` mark included, and cannot be moved to another or changed.
- **Only the writer's signature covers a note.** `notes` is not part of what the record's signers sign, so adding, changing or removing a note leaves every signature on the record valid.
- **A note counts only if** its writer is one of the record's `signers` and `sig` checks out. Any other note is dropped or ignored; it is never a reason to refuse the record.
- **A note travels with its record:** it is published where the record is, and stays private where the record does.

**Claiming: asking a player to sign, or giving them records.** The realm shows a QR code, a "claim on this computer" link and a short address, all leading to a one-time claim address of its own, such as `https://game-server.com/sword-of-swankery/claim/X9P4`. That address forwards the browser to the EntryPortal named in the player's sign-in note:

```
https://portal.endlessmind.com/v0.65/#sign=<URL-encoded JSON>
```

The JSON is `{ "return": "<address>", "records": [ ... ] }`. The EntryPortal:

1. checks that `return` has the same origin (scheme, host and port) as an address the player signed in to through this EntryPortal, and refuses otherwise;
2. shows every record's full text and signers, a public switch, on by default, and a box for the player's own words;
3. lets the player choose which records to sign; records the player is not a signer of are offered for keeping only;
4. sets `public` on each chosen record as the player chose, adds the player's signature, then the player's note if they wrote one, and keeps a copy;
5. sends the browser to `return` with an HTML form POST holding one field, `records`: the chosen records as a JSON array.

Because `public` is set by the player and is part of the signed text, the realm proposes records without its own signature and signs them after they come back, once it has checked that only `public`, `sigs` and `notes` changed. It keeps the notes that count and drops the rest.

**Handing back complete records.** Once it has signed, the realm answers the POST by sending the browser back to the EntryPortal with `#sign=` holding the complete records and no `return`. It may add `back`, the address of the game, and the EntryPortal then offers a link there, but only if `back` has the origin of a site the player signed in to through it.

**Getting records back.** A realm may keep every record it has signed, public and private, while listing only the public ones. A signed-in player who has lost theirs, for example after setting up a new device, can ask for them, and the realm hands them over the same way: the browser goes to the EntryPortal with `#sign=` holding the records and no `return`, and the EntryPortal keeps the ones carrying the player's proof. Without `return`, the EntryPortal signs nothing and sends nothing: records that already carry the player's own proof are kept without asking (completing the copy it kept at step 4), and the player may choose to keep any others.

**Records file.** An EntryPortal saves a player's records as a JSON file, `{ "v": 1, "type": "records", "records": [ ... ] }`, and loads such files from any other EntryPortal, keeping only records whose signatures check out, with the notes that count.

## Finding realms

**Realm card.** A realm describes itself with a card, signed by the realm alone. The newest card from a realm replaces older ones.

```json
{
  "v": 1,
  "type": "card",
  "signers": ["4cdgtlj7kdgdl56z7iv2nchdhl44ggz5kdxpdaxemlrr6lrnkrdq"],
  "time": 1790000000000,
  "name": "Sword of Swankery",
  "description": "Duels with very fancy swords.",
  "picture": "data:image/svg+xml;base64,...",
  "tags": ["duels", "multiplayer"],
  "play": ["https://game-server.com/sword-of-swankery/"],
  "list": "https://game-server.com/sword-of-swankery/endlessmind-list.json",
  "sigs": { "4cdgtlj7kdgdl56z7iv2nchdhl44ggz5kdxpdaxemlrr6lrnkrdq": "..." }
}
```

| Field         | Meaning                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| `name`        | At most 80 characters                                                   |
| `description` | At most 500 characters                                                  |
| `picture`     | Optional: a `data:` image, at most 32 KB                                |
| `tags`        | Optional: up to 10 short words                                          |
| `play`        | The addresses where players start, now                                  |
| `list`        | Optional: the address of the realm's public list                        |
| `release`     | Optional: the ID of the release served under each address in `play`     |

A realm serves its newest card at `endlessmind-card.json` under each address in `play` (for example `https://game-server.com/sword-of-swankery/endlessmind-card.json`), with the header `Access-Control-Allow-Origin: *` so any web page may read it.

**Public list.** The address in `list` serves, with the same header:

```json
{ "v": 1, "type": "list", "realm": "<realm ID>", "records": [ ... ] }
```

It holds the realm's complete records marked `public`, signed by the realm and by every player they name, each with its notes. Nothing else is required of it; a realm may split a long list with an optional `next` field giving the address of the rest.

**Boards** read cards and lists and rank realms however they choose. They should count only complete records that are marked `public` and signed by the players they concern, and may distrust records that first appear long after their `time`. Every host serves one (see "Hosts").

**Wishes.** A wish is a record by which a player asks hosts to run a release. It is signed by the player and by the realm where they wished, and is claimed like any other record:

```json
{
  "v": 1,
  "type": "record",
  "signers": ["<the realm's ID>", "<the player's ID>"],
  "time": 1790000000000,
  "text": "I want to play Sword of Swankery (release <release ID>).",
  "data": { "wish": "<release ID>" },
  "public": true,
  "sigs": { "<the realm's ID>": "...", "<the player's ID>": "..." }
}
```

- **A record is a wish** when `data.wish` is a release's ID. A wish is never counted as play.
- **It is read from the public list** of the realm that signed it, so a wish the player marked private asks nothing of anyone.
- **Only a player's newest wish counts,** by `time`, and for a week from that time. A wish dated more than ten minutes ahead of the reader's clock is ignored.

## Game servers

A game is a folder: `game.js` or `game.wasm` (the game server, one of them), `card.json` (the realm card's `name`, `description` and optional `tags` and `picture`) and the display's files, starting at `index.html`. A file or folder whose name starts with a dot is never served to players and never loaded.

**The calls.** `game.js` is a JavaScript module whose default export is an object with any of these functions. The host calls them one at a time, in order, and waits for each to finish:

| Function                      | When                                                        |
| ----------------------------- | ----------------------------------------------------------- |
| `start(game)`                 | The game server has started                                 |
| `join(game, player)`          | A display connected                                         |
| `leave(game, player)`         | That display's connection ended                             |
| `message(game, player, data)` | That display sent `data`                                    |
| `timer(game)`                 | The time set with `game.timer` has passed                   |

`game` is what the game server may ask of its host:

| Function                      | What it does                                                           |
| ----------------------------- | ---------------------------------------------------------------------- |
| `game.send(player, data)`     | Sends `data` to that display                                           |
| `game.save(key, value)`       | Keeps `value` under `key`; `undefined` removes it                      |
| `game.load(key)`              | What was last saved under `key`, or `undefined`                        |
| `game.timer(ms)`              | Sets the one timer, replacing any earlier time; `null` clears it       |
| `game.offer(player, records)` | Offers a signed-in player records to claim, each `{ text, data? }`     |
| `game.players()`              | Everyone connected now                                                 |

`player` describes one connection; a person with two pages open is two of them:

| Field     | Meaning                                                                               |
| --------- | ------------------------------------------------------------------------------------- |
| `conn`    | A number for this connection                                                          |
| `who`     | Who is playing: `player:<ID>` once signed in, otherwise the same as `guest`           |
| `id`      | The player's ID, or `null` for a guest                                                |
| `name`    | The name to show; `Guest` for a guest                                                 |
| `guest`   | `guest:<32 hex characters>`: this browser's name before anyone signed in              |
| `records` | The realm's records with the player: `{ text, data?, time, note? }`, the note theirs  |

Everything passed in either direction is JSON. A game that keeps progress under `who` can carry a guest's progress over at sign-in, since `guest` stays the same.

**WebAssembly.** `game.wasm` is a WebAssembly module, so a game server can be written in any language that compiles to one. It gets the same calls, the same player objects and the same seal, through a surface of three exports and one import:

- Export `memory`: the module's memory.
- Export `alloc(length)`: returns a pointer to `length` bytes of room, which the host fills.
- Export `call(pointer, length)`: one call from the host, given UTF-8 JSON in the room `alloc` returned. The module owns that room from then on and may free it.
- Import `host.ask(pointer, length)`: one request to the host, given UTF-8 JSON in the module's memory.

The host's calls to `call`, one at a time and in order, each waiting for the last to return:

| Message                                             | When                                              |
| --------------------------------------------------- | ------------------------------------------------- |
| `{ "t": "start", "data": { ...saved keys... } }`    | The game server has started, with all it saved    |
| `{ "t": "join", "player": {...} }`                  | A display connected                               |
| `{ "t": "leave", "player": {...} }`                 | That display's connection ended                   |
| `{ "t": "message", "player": {...}, "data": ... }`  | That display sent `data`                          |
| `{ "t": "timer" }`                                  | The time set with a `timer` request has passed    |

The module's requests to `host.ask`, which it may make during any call:

| Message                                             | What it does                                            |
| --------------------------------------------------- | ------------------------------------------------------- |
| `{ "t": "send", "conn": n, "data": ... }`           | Sends `data` to the display with that `conn`            |
| `{ "t": "save", "key": "...", "value": ... }`       | Keeps `value` under `key`; without `value`, removes it  |
| `{ "t": "timer", "ms": n }`                         | Sets the one timer; `null` clears it                    |
| `{ "t": "offer", "id": "<ID>", "records": [...] }`  | Offers that player records to claim                     |
| `{ "t": "log", "text": "..." }`                     | Writes a line to the host's log                         |

There is no call to load a value and none to list players: what was saved arrives with `start`, and a module that wants the players keeps them from `join` and `leave`. A module that imports anything else, lacks an export, or does not have exactly one memory with a declared maximum within the memory limit below, or has a table without a declared maximum of at most 100000 entries, is refused, and the host does not start it. The host sends the module's bytes to the sealed process, which has no files to read.

**The seal.** A game server runs where it cannot open files, use the network, start other programs or learn anything about the computer it is on. It may import other files from its own folder, all named in the code so the host can check them before it starts; nothing from the web, and no built-in modules. A host stops a game server that needs more memory than the host allows, that stops answering, or that uses more than its share of the processor, and starts it again when the next display connects. A host also lets a game server rest while nobody is playing. The timer is kept by the host: it rings even after a rest, with the game server started again for it, but a game server stopped for any other reason starts with no timer set. A game server may therefore start at any moment knowing only what it saved.

| Limit in the reference host                  | Value                                    |
| -------------------------------------------- | ---------------------------------------- |
| Memory (a module's declared maximum)         | 64 MB                                    |
| Going without answering                      | 6 seconds                                |
| Share of one processor                       | Half, measured over 30 seconds           |
| Wait after being stopped for that            | 5 seconds, doubling to at most 5 minutes |
| Rest with nobody playing                     | After one minute                         |
| What it saved, as JSON                       | 4 MB                                     |
| One message, as JSON                         | 64 KB                                    |

**The display's line.** The display opens a WebSocket to `endlessmind/play?guest=<32 random hex characters>` under the game's address and sends and receives JSON text messages. The host learns who is playing from the session the browser sends with that connection, so the display connects again after its player signs in or out. Hosts accept the connection only from the game's own pages, and serve a helper for all of this at `endlessmind/play.js`.

## Relays

A relay lets players reach a game that runs on a computer they cannot connect to, such as its maker's computer at home. A relay has an HTTPS address that is a site's root, such as `https://relay.example/`, and gives each game a site of its own under that name: `https://<ID>.relay.example/`, where the ID is the one the game's host signs under. That is the realm's ID for a game run by its maker, and the host's own ID for a release (see "Releases"). The game uses that address as it would any other, in its sign-in codes and its card.

**Asking to be relayed.** The game's host opens a WebSocket to `endlessmind/relay` under the relay's address. Every message on it is JSON text with a `t` field.

1. The relay sends `{ "t": "hello", "nonce": "<32 hex characters>" }`.
2. The host answers `{ "t": "note", "note": <signed JSON> }`. The note is signed by that ID and names the relay and the nonce:

   ```json
   { "v": 1, "type": "relay", "signers": ["<ID>"], "time": 1790000000000, "relay": "https://relay.example/", "nonce": "<the nonce>" }
   ```

3. The relay checks the signature, that `relay` is its own address and that `nonce` is the one it just sent. It answers `{ "t": "ready", "base": "<the game's address>" }`, or `{ "t": "full" }` if it has no room, and then closes. A host that is offered any address but the one above stops using that relay.

An ID that asks again takes the place of its earlier connection. A relay that is also a host refuses an ID whose name it already uses for a release. The game is at its address for as long as the connection stays open.

**Finding a relay.** A host that relays says so in its host card (see "Hosts"), so a game that is told of no relay reads the cards of the hosts it knows and asks each one that relays, in turn, until one says `ready`.

**Passing players through.** The relay gives each request and each display's line a number, `n`.

| From   | Message                                           | Meaning                                              |
| ------ | ------------------------------------------------- | ---------------------------------------------------- |
| Relay  | `request`: `n`, `method`, `path`, `headers`, `body` | A player's request; `body` only if there is one    |
| Host   | `response`: `n`, `status`, `headers`              | The answer begins                                    |
| Host   | `body`: `n`, `data`                               | The next piece of the answer's body                  |
| Host   | `end`: `n`                                        | The answer is complete                               |
| Relay  | `open`: `n`, `path`, `headers`                    | A display asks for a line                            |
| Host   | `response`: `n`, `status`                         | That line is refused                                 |
| Either | `text`: `n`, `data`                               | One message on a line                                |
| Either | `close`: `n`, `code`, `reason`                    | The line ended, or the player stopped waiting        |

`path` starts with `/` and includes any query. `headers` is a list of `[name, value]` pairs. Bodies are base64, an answer's in pieces of any size. Headers that belong to one connection are not passed: `connection`, `keep-alive`, `transfer-encoding`, `upgrade`, `host`, `content-length`, `te`, `trailer`, and any starting with `sec-websocket-` or `proxy-`. A line needs no message to accept it: the host simply starts sending `text`.

The reference relay passes a body of at most 1 MB from a player, a message of at most 64 KB on a line, at most 200 requests and lines at once for one game, and waits 60 seconds for an answer to begin.

**What a relay can do.** Everything passes through it, so it can read and change what a game and its players say to each other. It cannot learn a secret phrase or make a record, because the realm's secret stays with the game's host and a player's proofs come from their EntryPortal.

## Hosts

A host has a main address that is a site's root, such as `https://host.example/`, and answers at every name under it:

| Name                       | What is there                                                        |
| -------------------------- | -------------------------------------------------------------------- |
| `host.example`             | The host's resident game, and `endlessmind/relay` for games to dial  |
| `eportal.host.example`     | An EntryPortal: published versions only, and nothing else            |
| `<realm ID>.host.example`  | Each release the host runs, named by its realm                       |
| `<ID>.host.example`        | Each relayed game, named by the ID its own host signs under          |

No two games share a name, and no game is ever at a path under another's name or at the EntryPortal's. A host with no resident game has a realm of its own at its main address, signed by the host's ID, where players sign in to wish for games. A realm whose address is an HTTPS site's root names its session cookie `__Host-endlessmind`, which browsers accept only from that exact name; any other realm names it `endlessmind`.

**Host card.** A host has an ID of its own, and describes itself with a card: signed JSON, signed by the host alone. It signs a new one whenever what it runs changes, and at least every hour.

```json
{
  "v": 1,
  "type": "host",
  "signers": ["<host ID>"],
  "time": 1790000000000,
  "address": "https://host.example/",
  "relay": true,
  "portal": "https://eportal.host.example/",
  "runs": [{ "realm": "<realm ID>", "release": "<release ID>", "name": "Sword of Swankery", "play": "https://host.example/" }],
  "relays": [{ "id": "<ID>", "play": "https://<ID>.host.example/" }],
  "sigs": { "<host ID>": "..." }
}
```

| Field     | Meaning                                                                                  |
| --------- | ---------------------------------------------------------------------------------------- |
| `address` | The host's main address, exactly as `new URL(address).href` writes it                    |
| `relay`   | `true` if the host relays; left out if it does not                                       |
| `portal`  | The address of the EntryPortal it serves; left out if it serves none                     |
| `runs`    | Each release it runs and hands on, its resident game's first: `play` is where it is played |
| `relays`  | Each game it relays now, by the ID in the game's name; left out if there is none         |

A card is at most 16 KB of canonical JSON. A host serves its newest card at `endlessmind/host.json` under its main address.

**Known hosts.** A host serves the cards it holds at `endlessmind/hosts.json` under its main address, its own first:

```json
{ "v": 1, "type": "hosts", "hosts": [ <its own host card>, <host card>, ... ] }
```

Both files carry the header `Access-Control-Allow-Origin: *`, so any web page may read them: a player's browser asks any host it knows of.

**Announcing.** A host sends its card, as the JSON body of a `POST`, to `endlessmind/hosts` under the main address of each host it knows, once an hour. The answer is `200` if the card is now held there and `400` if it was refused.

**Checking a card.** A card is held only after all of this is true, whether it was sent or read from another host's list:

1. It is a host card as above, completely signed, and its `time` is no more than a day in the past and no more than ten minutes ahead.
2. Its `address` is a site's root over `https`, at a name rather than a number, with no user name, query or fragment. A program that is itself at a name under `localhost`, or was started from one, also accepts names under `localhost`, over `http` too.
3. `endlessmind/host.json` under that address answers `200` with a card signed by the same ID that names the same address. This is what shows that the signer is at the address, so nobody can list an address that is not theirs. A redirect is never followed.

A newer card from an ID replaces its older one, and a card at an address replaces a card by any other ID at that address. A card is forgotten a day after its `time`. The reference host holds at most 1000 cards, reads a list of at most 4 MB, waits five seconds for any one host, and keeps what it holds across a restart. It also asks again, for 30 days, every address where a host last answered with its card, even after that card is forgotten.

**Finding hosts.** A host program starts from a few addresses it is given. It reads `endlessmind/hosts.json` from each, then from each address those lists name, until it has asked every host it has heard of; it does this again every hour. A program with no address of its own, such as a game on a computer at home, publishes no card and only reads.

**The board.** A host serves a page at `endlessmind/board` under its main address, and that page's data at `endlessmind/board.json`, with the header `Access-Control-Allow-Origin: *`:

```json
{
  "v": 1,
  "type": "board",
  "host": "<host ID>",
  "address": "https://host.example/",
  "time": 1790000000000,
  "games": [{
    "realm": "<realm ID>",
    "release": "<release ID>",
    "name": "Sword of Swankery",
    "description": "Duels with very fancy swords.",
    "hosts": [{ "id": "<host ID>", "address": "https://host.example/", "play": "https://host.example/" }],
    "relayed": ["https://<ID>.host.example/"],
    "players": 12,
    "records": 40,
    "wishes": 3,
    "notes": [{ "player": "<player ID>", "text": "Harder than it looks.", "time": 1790000000000 }]
  }]
}
```

| Field     | Meaning                                                                              |
| --------- | ------------------------------------------------------------------------------------ |
| `games`   | One entry per release, the one with the most players first                           |
| `hosts`   | The hosts whose cards say they run it, and where each one plays it                   |
| `relayed` | Where it is played through a relay, on a computer that is no host                    |
| `players` | How many players have play on record with it, in every place added together          |
| `records` | How many records of play those are                                                   |
| `wishes`  | How many players' newest wish, less than a week old, names it                        |
| `notes`   | The three newest notes players wrote on those records                                |

A host builds its board from its own host card and the cards it holds:

1. **The games.** Each release in a card's `runs` is a game, run by that host. Each game in a card's `relays` whose realm card names a `release` is a game too, played at that address; if no card runs it, it is run by no host.
2. **The places.** The host reads `endlessmind-card.json` and `endlessmind-list.json` under each host's main address and under each `play` address in its `runs` and `relays`. An address counts only if it is a site's root at the host's own name or a name under it, checked as a host card's address is. A redirect is never followed.
3. **Who may sign there.** A place counts only if its realm card is completely signed by one ID, the list's `realm` is that ID, and that ID is the host's, the `realm` of a run played at that address, or the `id` of a game relayed there.
4. **The records.** A record in the list counts only if it is complete, its `public` is `true`, and its `signers` are that ID and one other, the player. A record that is not a wish is play. It counts toward the release the place's realm card names, unless the record itself names another `release`.
5. **The wishes.** Counted as "Wishes" under "Finding realms" says, from every place.

Games are ordered by `players`, then `records`, then `wishes`. The reference host reads each place at most once in ten minutes, a realm card of at most 128 KB and a list of at most 2 MB, and waits five seconds for any one answer; it reads the lists of the games it runs itself where it keeps them.

**Wishing.** The board's page lets a signed-in player wish for a game it lists. It sends a `POST` to `endlessmind/wish` under the host's main address with the JSON body `{ "release": "<release ID>" }`, and with the player's session at the realm there: the resident game's, or the host's own. The realm then offers that player the wish, to claim as any record is claimed. The answer is `401` for a guest, `404` for a release the board does not list, and `403` for a page at any other site.

**Loading by demand.** A host may load games without being asked. Its admin sets how many, and may name IDs it trusts besides its own. Every ten minutes the reference host reads the lists as for its board, then:

1. **A wish counts** only if its player has play on record (step 4 above) signed by an ID the host trusts: its own host ID, its resident game's realm ID, and those its admin named.
2. **Each release gets its wishes per host:** the wishes that count, divided by the number of hosts whose cards run it, counting this host as one of them whether it runs the release yet or not.
3. **The host runs the best** of the releases with a wish that counts, as many as its admin set, not counting its resident game and the releases its admin named. Between equals, one it already runs stays. A release it cannot fetch is passed over, and so is one whose realm already has a name on this host.
4. **A release that loses its place is stopped** and removed from the host's store. What its players saved stays, and is there if the release is loaded again.

A release loaded this way is fetched, checked and run as any other, and is in the host's card. A host that loaded or dropped one sends its new card to the hosts it knows at once.

## Releases

A release is one exact version of a game, packed so that anyone can fetch it, check it and run it.

**The files.** Every file of the game's folder (see "Game servers"; it holds `game.js` or `game.wasm`, not both), plus a release note named `endlessmind-release.json`. A file's path is made of parts joined by `/`; each part starts with a letter, a digit or `_`, continues with letters, digits, `.`, `_`, `-` or spaces, and is at most 100 characters. A release holds at most 500 files and 50 MB.

**The release note** is signed JSON, signed by the realm alone:

```json
{ "v": 1, "type": "release", "signers": ["<realm ID>"], "time": 1790000000000, "calls": 1,
  "card": { "name": "...", "description": "...", "tags": ["..."] },
  "content": "<64 hex characters>" }
```

| Field     | Meaning                                                                          |
| --------- | -------------------------------------------------------------------------------- |
| `calls`   | The version of the game server's calls the game was written for; `1` is this one |
| `card`    | The realm card's words: `name`, `description`, and optionally `tags`, `picture`  |
| `content` | The fingerprint of every other file in the release                               |

`content` is the SHA-256, in hex, of the canonical JSON of a list with one entry per file except the note, sorted by path: `[path, size in bytes, SHA-256 of the file in hex]`.

**The ID.** A release is described by a BitTorrent (version 1) torrent file, and the release's ID is that torrent's info-hash: 40 hex characters. The torrent lists the files sorted by path, the note among them, with pieces of 262144 bytes, and its `name` is the realm's ID. Any torrent program can fetch and share a release by that ID.

**Checking.** Before running or passing on a release, a host checks that the torrent file hashes to the ID, that every file matches the torrent's pieces and no other file is present, that the note is signed by the realm the torrent names, that `content` matches the files, and that `calls` is a version it speaks. Whoever sent the files need not be trusted.

**Fetching.** A host serves each release in its card's `runs` under its main address: the torrent file at `endlessmind/release/<ID>.torrent`, and each file at `endlessmind/release/<ID>/<path>`. A game that is reached through a relay serves its own release the same way under its own address, and its realm card's `release` field gives that release's ID; a maker's game run from its folder is packed for this when it starts.

**Finding a release.** Given only a release's ID, a host fetches it from a known host whose card lists that ID in `runs`. If none does, it reads the realm card (`endlessmind-card.json`) of each game in the known hosts' `relays`, at an address under the relaying host's name, and fetches from one whose `release` is that ID. Either way the release is checked as above.

**Running a release.** The realm's secret is not on the host, so the host signs under an ID of its own. Its card, and every record it signs with a player, carry two more fields: `realm`, the realm's ID, and `release`, the release's ID. Such a record says that this host ran that release of that realm and that the player earned what the text says; the realm itself has signed only the release.

## Burning an identity

Revealing the secret phrase or the private key burns the identity; either has the same effect. The usual way is a burn notice:

```json
{ "v": 1, "type": "burn", "words": "<the 24 words>" }
{ "v": 1, "type": "burn", "key": "<the 32-byte Ed25519 private key, base64url without padding>" }
```

- **It needs no signature:** anyone can turn `words` or `key` into the ID, which proves the publisher had it. Publishing the key keeps the phrase private, which matters only if the phrase is used for anything else.
- **A burned ID is gone, and any use of it is a ghost.** Everyone should ignore everything signed by it, whenever dated, including records it shares with others.
- **Spreading it:** a burned realm serves the notice in place of its card. Boards keep notices for IDs they already know from records they have read, offer a searchable list of those burned IDs, and pass the notices on. A notice for an unknown ID matters to nobody and is dropped, so making millions of keys and burning them achieves nothing. A player whose ID is known only to some realms, from private records, has their EntryPortal deliver the notice to those realms at the join address it last signed in to there, as an HTML form POST with one field, `burn`. A realm accepts `burn` at any of its join addresses, used or not.
- **Realms refuse burned IDs** by checking such a list, and their own, at sign-in, since a ghost's sign-in note still has a valid signature. Realms likewise keep notices only for IDs they have seen.
- **EntryPortals** offer burning an identity only behind a clear explanation and a typed confirmation, such as "burn this identity". Since an EntryPortal keeps no copy of the phrase and cannot read out its key, the player types their phrase again to burn it.

## Rules for EntryPortals

Anyone may write and host an EntryPortal. Players and their AI helpers should expect these, and an AI asked "is it safe to type my secret phrase into [address]?" should check them:

1. **One self-contained file.** Readable code, no scripts or styles loaded from anywhere else, no minified code.
2. **No contact with any server.** A content security policy in the page forbids every connection (`connect-src 'none'` and nothing loaded from elsewhere). The only data that leaves is a form POST to a join address or a `return` address, as described above. Such an address is HTTPS, or plain `http` only at the computer's own names: `localhost`, any name under it (such as `abc.localhost`), and `127.0.0.1`. The page's policy limits form posts (`form-action`) to the same.
3. **The phrase is used once.** At setup the page makes or accepts the phrase, turns it into a non-extractable browser key, and keeps no copy of the phrase. A new phrase is shown once, and the page does not continue until the player has typed back some of its words. The page asks the browser to keep its storage permanently. The new phrase may also be shown as a QR code holding a link to the EntryPortal's own site, `#phrase=<the phrase's 256 bits in base32>&name=<the player's name>` (or `#words=<the 24 words>`, which is longer and makes a denser code), so the player can keep a screenshot or photo and set up another device by scanning it or by giving the page the picture, which the page reads itself. An EntryPortal accepts such a link only while it holds no identity, and only after the player confirms the name it holds; otherwise it ignores it.
4. **Being asked for the phrase is rare, and setup says so.** The page asks for a phrase only when the player sets up a device or burns an identity. Its setup screen teaches that rule: a page that asks at any other time is a trick.
5. **Ask first.** Every screen that takes a phrase reminds the player to ask their AI helper about the page first, with its own address: "Someone asked me to type my secret phrase into [address]. Is it safe?" It says that a page cannot vouch for itself, since a thief's page can say the same words.
6. **Links need one confirmation.** An address from the page's own link is used only after the player confirms it, seeing its site name.
7. **Show before signing.** The page shows the full text of every record, with its public switch, and asks before signing it. A note is signed only with words the player typed.
8. **Other EntryPortals are welcome.** The page tells the player how to continue in a different EntryPortal instead.
9. **Improved in new versions, never edited in place.** Anyone may improve an EntryPortal, and improvements are welcome. Each version is published at its own address with its SHA-256 fingerprint and is never changed there afterwards, so a check of that version stays true for as long as it is served; an improvement becomes a new version at a new address. A host may also offer an address that forwards to its newest version, as long as it forwards only to versions it has published with their fingerprints.
10. **Records can leave.** The page saves and loads records files.
11. **A site of its own.** The page is served from a site (scheme, host and port) that serves nothing but EntryPortal versions. A stored key cannot be read out, but any script on the same site can use it to sign, so a single other page there, or one broken into, could sign as every player.

The reference EntryPortal follows these rules. It has a site of its own, `https://portal.endlessmind.com/`, which serves nothing else. Its versions are numbered below v1.0 (the newest is v0.65), each made in [portal/](../portal/), which keeps only the newest, and published at `https://portal.endlessmind.com/<version>/` with its fingerprint in `SHA256SUMS` beside it; the site's root forwards to the newest. It also refuses to run inside another page's frame, so no page can lay its own buttons over it.

## Versions

- **Every object names its version** (`v`). Only version 1 exists.
- **IDs and signatures survive every version.** A future version may add other signature methods, for example ones that resist quantum computers, without changing what an ID or a record means.

## How the protocol changes

- **Numbered proposals, in the open,** like the internet's RFCs (its numbered public design documents). Anyone can write one.
- **A proposal counts when independent programs implement it,** not when someone approves it: "rough consensus and running code," as the people who built the internet put it.
- **This repository holds the reference documents and code,** but it is a convenience, not an authority. Anyone may copy the documents and carry on.
