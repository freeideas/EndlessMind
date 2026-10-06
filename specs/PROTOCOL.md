# Endless Mind protocol

The exact formats: keys, signed JSON, signing in, records, finding realms, and burning an identity. Why things are this way is in [DESIGN.md](DESIGN.md). Hosting and making realms are not decided yet.

## Keys and IDs

A key pair is an Ed25519 key pair (Ed25519 is a widely used signature method, built into browsers). Players and realms use the same kind.

- **ID:** the 32-byte public key in base32 (RFC 4648 alphabet, lowercase, no padding): 52 characters of `a-z` and `2-7`.
- **Secret phrase:** 24 words from the BIP39 English word list, encoding 256 random bits plus an 8-bit checksum, as BIP39 says.
- **From phrase to key:** the BIP39 seed with an empty passphrase (PBKDF2 with HMAC-SHA512, 2048 rounds, salt `mnemonic`), then the SLIP-0010 Ed25519 master key: HMAC-SHA512 with key `ed25519 seed` over the seed, keeping the first 32 bytes as the Ed25519 private key.
- **Example:** the phrase of 23 times `abandon` then `art` (all-zero entropy; never use it) gives the ID `pl5hdegz6xnovjc5szio2phhycltxmhdl5zwdp4fqoe2rty4h46a`.

[tests/keys_test.js](../tests/keys_test.js) checks the recipe against the published BIP39 and SLIP-0010 test vectors.

## Signed JSON

Sign-in notes, records and realm cards are JSON objects with a `sigs` field: an object mapping each signer's ID to its signature.

- **What is signed:** the object without `sigs`, as canonical JSON (object keys sorted by their UTF-16 code units at every level, no spaces, strings as `JSON.stringify` writes them, numbers only as integers), encoded as UTF-8.
- **A signature:** the 64-byte Ed25519 signature of those bytes, in base64url without padding.
- **Every signer signs the same bytes,** so signatures can be added in any order.
- **Every object carries `v` (the version, `1`) and `type`.** Unknown fields are allowed and are signed like any other.
- **Times** are whole milliseconds since 1970-01-01 UTC. **Size:** at most 16 KB of canonical JSON.

## Signing in

**1. The realm shows a sign-in screen** with a one-time join address, such as `https://game-server.com/sword-of-swankery/join/K7Q2`, in three forms:

- a QR code of an EntryPortal link (below);
- a "sign in on this computer" link: the same EntryPortal link;
- the join address as short text to type, for when scanning fails.

Next to them it shows the line "Only scan sign-in codes shown on your own screen."

**2. The EntryPortal link** is the EntryPortal's address with the join address after `#url=`, URL-encoded, so it never reaches the EntryPortal's server:

```
https://portal.endlessmind.com/#url=<join address>
```

A realm usually names an address that forwards to the newest version of an EntryPortal, such as `https://portal.endlessmind.com/`, which keeps the part after `#` and lands the player on a versioned address such as `https://portal.endlessmind.com/v0.2/`. A realm that wants to vouch for one exact version names that version instead. Browsers keep storage per site, so every version on one site shares the player's key and records.

**3. The EntryPortal asks once and signs.** For an address from a link, it asks "Sign in the screen in front of you at **game-server.com**?" and one tap confirms. An address the player typed or pasted needs no confirmation. Then it makes the sign-in note:

```json
{
  "v": 1,
  "type": "enter",
  "player": "pl5hdegz6xnovjc5szio2phhycltxmhdl5zwdp4fqoe2rty4h46a",
  "address": "https://game-server.com/sword-of-swankery/join/K7Q2",
  "time": 1790000000000,
  "nonce": "0123456789abcdef",
  "portal": "https://portal.endlessmind.com/v0.2/",
  "sigs": {
    "pl5hdegz6xnovjc5szio2phhycltxmhdl5zwdp4fqoe2rty4h46a": "css8Yurq71c-Zlp9m8pzGMMOpS_PHqQKGAbX2EF1msaUBKvkFC9QMoXQJ13Jy9TR4v749DSkyCsclOgV2QxiCw"
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

**4. Delivery.** The EntryPortal sends the browser to `address` with an HTML form POST (`application/x-www-form-urlencoded`) holding one field, `enter`, whose value is the note as JSON. The realm answers with a page such as "You're in. Go back to your screen." A realm may also answer a plain visit to a join address by sending the browser on to its EntryPortal link, so the short address works when opened in a phone's browser too.

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

- **A record is complete** when every ID in `signers` has a valid signature in `sigs`. An incomplete record proves nothing.
- **Anyone holding a complete record may show it to anyone.** The reader checks the signatures; nobody needs to be contacted.
- **A realm's own statement** has the realm as its only signer. An agreement lists every party.

**Claiming: asking a player to sign, or giving them records.** The realm shows a QR code, a "claim on this computer" link and a short address, all leading to a one-time claim address of its own, such as `https://game-server.com/sword-of-swankery/claim/X9P4`. That address forwards the browser to the EntryPortal named in the player's sign-in note:

```
https://portal.endlessmind.com/v0.2/#sign=<URL-encoded JSON>
```

The JSON is `{ "return": "<address>", "records": [ ... ] }`. The EntryPortal:

1. checks that `return` has the same origin (scheme, host and port) as an address the player signed in to through this EntryPortal, and refuses otherwise;
2. shows every record's full text and signers, and a public switch, on by default;
3. lets the player choose which records to sign; records the player is not a signer of are offered for keeping only;
4. sets `public` on each chosen record as the player chose, adds the player's signature, and keeps a copy;
5. sends the browser to `return` with an HTML form POST holding one field, `records`: the chosen records as a JSON array.

Because `public` is set by the player and is part of the signed text, the realm proposes records without its own signature and signs them after they come back, once it has checked that only `public` and `sigs` changed.

**Handing back complete records.** Once it has signed, the realm answers the POST by sending the browser back to the EntryPortal with `#sign=` holding the complete records and no `return`. Without `return`, the EntryPortal signs nothing and sends nothing: records that already carry the player's own proof are kept without asking (completing the copy it kept at step 4), and the player may choose to keep any others.

**Records file.** An EntryPortal saves a player's records as a JSON file, `{ "v": 1, "type": "records", "records": [ ... ] }`, and loads such files from any other EntryPortal, keeping only records whose signatures check out.

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

A realm serves its newest card at `endlessmind-card.json` under each address in `play` (for example `https://game-server.com/sword-of-swankery/endlessmind-card.json`), with the header `Access-Control-Allow-Origin: *` so any web page may read it.

**Public list.** The address in `list` serves, with the same header:

```json
{ "v": 1, "type": "list", "realm": "<realm ID>", "records": [ ... ] }
```

It holds the realm's complete records marked `public`, signed by the realm and by every player they name. Nothing else is required of it; a realm may split a long list with an optional `next` field giving the address of the rest.

**Boards** are realms that read cards and lists and rank other realms however they choose. They should count only complete records that are marked `public` and signed by the players they concern, and may distrust records that first appear long after their `time`.

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
2. **No contact with any server.** A content security policy in the page forbids every connection (`connect-src 'none'` and nothing loaded from elsewhere). The only data that leaves is a form POST to a join address or a `return` address, as described above.
3. **The phrase is used once.** At setup the page makes or accepts the phrase, turns it into a non-extractable browser key, and keeps no copy of the phrase. A new phrase is shown once, and the page does not continue until the player has typed back some of its words. The page asks the browser to keep its storage permanently. The new phrase may also be shown as a QR code holding a link to the EntryPortal's own site, `#phrase=<the phrase's 256 bits in base32>&name=<the player's name>` (or `#words=<the 24 words>`, which is longer and makes a denser code), so the player can keep a screenshot or photo and set up another device by scanning it or by giving the page the picture, which the page reads itself. An EntryPortal accepts such a link only while it holds no identity, and only after the player confirms the name it holds; otherwise it ignores it.
4. **Links need one confirmation.** An address from the page's own link is used only after the player confirms it, seeing its site name.
5. **Show before signing.** The page shows the full text of every record, with its public switch, and asks before signing it.
6. **Other EntryPortals are welcome.** The page tells the player how to continue in a different EntryPortal instead.
7. **Improved in new versions, never edited in place.** Anyone may improve an EntryPortal, and improvements are welcome. Each version is published at its own address with its SHA-256 fingerprint and is never changed there afterwards, so a check of that version stays true for as long as it is served; an improvement becomes a new version at a new address. A host may also offer an address that forwards to its newest version, as long as it forwards only to versions it has published with their fingerprints.
8. **Records can leave.** The page saves and loads records files.
9. **A site of its own.** The page is served from a site (scheme, host and port) that serves nothing but EntryPortal versions. A stored key cannot be read out, but any script on the same site can use it to sign, so a single other page there, or one broken into, could sign as every player.

The reference EntryPortal follows these rules. It has a site of its own, `https://portal.endlessmind.com/`, which serves nothing else. Its versions are numbered v0.2, v0.3 and so on up to v1.0, each in [portal/](../portal/) and published at `https://portal.endlessmind.com/<version>/` with its fingerprint in `SHA256SUMS` beside it; the site's root forwards to the newest. (v0.1 was published at `https://endlessmind.com/EntryPortal/v0.1/` before EntryPortals had sites of their own, and stays there unchanged; `https://endlessmind.com/EntryPortal/` now forwards to the new site.) It also refuses to run inside another page's frame, so no page can lay its own buttons over it.

## Versions

- **Every object names its version** (`v`). Only version 1 exists.
- **IDs and signatures survive every version.** A future version may add other signature methods, for example ones that resist quantum computers, without changing what an ID or a record means.

## How the protocol changes

- **Numbered proposals, in the open,** like the internet's RFCs (its numbered public design documents). Anyone can write one.
- **A proposal counts when independent programs implement it,** not when someone approves it: "rough consensus and running code," as the people who built the internet put it.
- **This repository holds the reference documents and code,** but it is a convenience, not an authority. Anyone may copy the documents and carry on.
