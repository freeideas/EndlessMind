# Endless Mind protocol

The exact formats: keys, signed JSON, signing in, and records. Why things are this way is in [DESIGN.md](DESIGN.md). This document covers identity only; finding realms and hosting are not decided yet.

## Keys and IDs

A key pair is an Ed25519 key pair (Ed25519 is a widely used signature method, built into browsers). Players and realms use the same kind.

- **ID:** the 32-byte public key in base32 (RFC 4648 alphabet, lowercase, no padding): 52 characters of `a-z` and `2-7`.
- **Secret phrase:** 24 words from the BIP39 English word list, encoding 256 random bits plus an 8-bit checksum, as BIP39 says.
- **From phrase to key:** the BIP39 seed with an empty passphrase (PBKDF2 with HMAC-SHA512, 2048 rounds, salt `mnemonic`), then the SLIP-0010 Ed25519 master key: HMAC-SHA512 with key `ed25519 seed` over the seed, keeping the first 32 bytes as the Ed25519 private key.
- **Example:** the phrase of 23 times `abandon` then `art` (all-zero entropy; never use it) gives the ID `pl5hdegz6xnovjc5szio2phhycltxmhdl5zwdp4fqoe2rty4h46a`.

[tests/keys_test.js](../tests/keys_test.js) checks the recipe against the published BIP39 and SLIP-0010 test vectors.

## Signed JSON

Sign-in notes and records are JSON objects with a `sigs` field: an object mapping each signer's ID to its signature.

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
https://endlessmind.com/EntryPortal#url=<join address>
```

**3. The EntryPortal asks once and signs.** For an address from a link, it asks "Sign in the screen in front of you at **game-server.com**?" and one tap confirms. An address the player typed or pasted needs no confirmation. Then it makes the sign-in note:

```json
{
  "v": 1,
  "type": "enter",
  "player": "pl5hdegz6xnovjc5szio2phhycltxmhdl5zwdp4fqoe2rty4h46a",
  "address": "https://game-server.com/sword-of-swankery/join/K7Q2",
  "time": 1790000000000,
  "nonce": "0123456789abcdef",
  "portal": "https://endlessmind.com/EntryPortal",
  "sigs": {
    "pl5hdegz6xnovjc5szio2phhycltxmhdl5zwdp4fqoe2rty4h46a": "jc9qx24lcYOd9rKWsbaq-SLptrxnrWuidPxQX5oRgQam6gnNI7ZBRsepIdp8ZKeA1H0FoLDdxjtTJcysJRAfBA"
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

**4. Delivery.** The EntryPortal sends the browser to `address` with an HTML form POST (`application/x-www-form-urlencoded`) holding one field, `enter`, whose value is the note as JSON. The realm answers with a page such as "You're in. Go back to your screen."

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

- **A record is complete** when every ID in `signers` has a valid signature in `sigs`. An incomplete record proves nothing.
- **Anyone holding a complete record may show it to anyone.** The reader checks the signatures; nobody needs to be contacted.
- **A realm's own statement** has the realm as its only signer. An agreement lists every party.

**Claiming: asking a player to sign, or giving them records.** The realm shows a QR code, a "claim on this computer" link and a short address, all leading to a one-time claim address of its own, such as `https://game-server.com/sword-of-swankery/claim/X9P4`. That address forwards the browser to the EntryPortal named in the player's sign-in note:

```
https://endlessmind.com/EntryPortal#sign=<URL-encoded JSON>
```

The JSON is `{ "return": "<address>", "records": [ ... ] }`. The EntryPortal:

1. checks that `return` is on the same site as an address the player signed in to through this EntryPortal, and refuses otherwise;
2. shows every record's full text and signers;
3. lets the player choose which records to sign; records the player is not a signer of are offered for keeping only;
4. adds the player's signature to the chosen records and keeps a copy of each;
5. sends the browser to `return` with an HTML form POST holding one field, `records`: the chosen records as a JSON array.

**Records file.** An EntryPortal saves a player's records as a JSON file, `{ "v": 1, "type": "records", "records": [ ... ] }`, and loads such files from any other EntryPortal, keeping only records whose signatures check out.

## Rules for EntryPortals

Anyone may write and host an EntryPortal. Players and their AI helpers should expect these, and an AI asked "is it safe to type my secret phrase into [address]?" should check them:

1. **One self-contained file.** Readable code, no scripts or styles loaded from anywhere else, no minified code.
2. **No contact with any server.** A content security policy in the page forbids every connection (`connect-src 'none'` and nothing loaded from elsewhere). The only data that leaves is a form POST to a join address or a `return` address, as described above.
3. **The phrase is used once.** At setup the page makes or accepts the phrase, turns it into a non-extractable browser key, and keeps no copy of the phrase. A new phrase is shown once, and the page does not continue until the player has typed back some of its words. The page asks the browser to keep its storage permanently.
4. **Links need one confirmation.** An address from the page's own link is used only after the player confirms it, seeing its site name.
5. **Show before signing.** The page shows the full text of every record and asks before signing it.
6. **Other EntryPortals are welcome.** The page tells the player how to continue in a different EntryPortal instead.
7. **Fixed versions.** Each version is published with its SHA-256 fingerprint and never changed afterwards; a new version gets a new address.
8. **Records can leave.** The page saves and loads records files.

The reference EntryPortal, not yet written, will follow these rules.

## Versions

- **Every object names its version** (`v`). Only version 1 exists.
- **IDs and signatures survive every version.** A future version may add other signature methods, for example ones that resist quantum computers, without changing what an ID or a record means.

## How the protocol changes

- **Numbered proposals, in the open,** like the internet's RFCs (its numbered public design documents). Anyone can write one.
- **A proposal counts when independent programs implement it,** not when someone approves it: "rough consensus and running code," as the people who built the internet put it.
- **This repository holds the reference documents and code,** but it is a convenience, not an authority. Anyone may copy the documents and carry on.
