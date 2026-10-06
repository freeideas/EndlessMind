# Endless Mind protocol

The exact formats: keys, signed JSON, signing in, and records. Why things are this way is in [DESIGN.md](DESIGN.md). This document covers identity only; finding realms and hosting are not decided yet.

## Keys and IDs

A key pair is an Ed25519 key pair (Ed25519 is a widely used signature method, built into browsers). Players and realms use the same kind.

- **ID:** the 32-byte public key in base32 (RFC 4648 alphabet, lowercase, no padding): 52 characters of `a-z` and `2-7`. Short enough to be one label of a web address.
- **Secret phrase:** 24 words from the BIP39 English word list, encoding 256 random bits plus an 8-bit checksum, as BIP39 says.
- **From phrase to key:** the BIP39 seed with an empty passphrase (PBKDF2 with HMAC-SHA512, 2048 rounds, salt `mnemonic`), then the SLIP-0010 Ed25519 master key: HMAC-SHA512 with key `ed25519 seed` over the seed, keeping the first 32 bytes as the Ed25519 private key.
- **Example:** the phrase of 23 times `abandon` then `art` (all-zero entropy; never use it) gives the ID `pl5hdegz6xnovjc5szio2phhycltxmhdl5zwdp4fqoe2rty4h46a`.

Programs that follow this recipe make the same ID from the same phrase, so a player can move between them freely. [tests/keys_test.js](../tests/keys_test.js) checks the recipe against the published BIP39 and SLIP-0010 test vectors.

## Signed JSON

Sign-in notes and records are JSON objects with a `sigs` field: an object mapping each signer's ID to its signature.

- **What is signed:** the object without `sigs`, written as canonical JSON (object keys sorted by their UTF-16 code units at every level, no spaces, strings as `JSON.stringify` writes them, numbers only as integers), encoded as UTF-8.
- **A signature:** the 64-byte Ed25519 signature of those bytes, in base64url without padding.
- **Every signer signs the same bytes,** so signatures can be added in any order without disturbing each other.
- **Every object carries `v` (the version, `1`) and `type`.** Unknown fields are allowed and are signed like any other.
- **Times** are whole milliseconds since 1970-01-01 UTC.
- **Size:** at most 16 KB of canonical JSON.

## Signing in

**The sign-in note**

```json
{
  "v": 1,
  "type": "enter",
  "player": "pl5hdegz6xnovjc5szio2phhycltxmhdl5zwdp4fqoe2rty4h46a",
  "address": "https://example.com/garden/",
  "time": 1790000000000,
  "nonce": "0123456789abcdef",
  "login": "https://login.example/",
  "sigs": {
    "pl5hdegz6xnovjc5szio2phhycltxmhdl5zwdp4fqoe2rty4h46a": "qpHEleQYzgO7CN-r4XiMXRPv0WGDVdSl-9Omz1a73uH7XRlW9VarJ_FxyIIYadnVqC0nvImxw3XeEOieTPP2Aw"
  }
}
```

| Field     | Meaning                                                                               |
| --------- | ------------------------------------------------------------------------------------- |
| `player`  | The player's ID; `sigs` must hold a valid signature by it                             |
| `address` | The `https` address the player pasted, exactly as given                               |
| `time`    | When the note was made                                                                |
| `nonce`   | 16 to 64 random characters                                                            |
| `login`   | Optional: the login page's address, so the realm can send records there to be signed  |

**Delivery.** The login page sends the browser to `address` with an HTML form POST (`application/x-www-form-urlencoded`) holding one field, `enter`, whose value is the note as JSON.

**What the realm checks.** It accepts the note only if all of these hold:

1. the signature by `player` is valid;
2. `address` is one of the realm's own addresses;
3. `time` is within two minutes of the realm's clock;
4. the realm has not seen this `nonce` in the last ten minutes.

What the realm does next, such as giving the browser a session cookie, is up to the realm. The realm's own ID does not appear in the note: the address already ties the note to this realm, and the player learns the realm's ID from the records it signs.

**Native programs.** A program that cannot receive a web page shows a join address with a one-time code, such as `https://example.com/garden/join/K7Q2`, or the same as a QR code. The player pastes it into their login page as usual. The realm receives the note at that address and lets in the program waiting on that code.

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

| Field     | Meaning                                                                         |
| --------- | ------------------------------------------------------------------------------- |
| `signers` | The IDs that must all sign: a realm, its players, anyone                        |
| `time`    | When the first signer proposed it                                               |
| `text`    | What was agreed, in plain words, at most 1000 characters                        |
| `data`    | Optional: the same facts for programs, as a JSON object                         |

- **A record is complete** when every ID in `signers` has a valid signature in `sigs`. An incomplete record proves nothing.
- **Anyone holding a complete record may show it to anyone.** The reader checks the signatures; nobody needs to be contacted.
- **A realm's own statement** has the realm as its only signer. An agreement lists every party.

**Asking a player to sign, or giving them records.** The realm sends the player's browser to the login page named in their sign-in note, with the request after `#sign=` (the part after `#` never reaches the login page's server):

```
https://login.example/#sign=<URL-encoded JSON>
```

The JSON is `{ "return": "<address>", "records": [ ... ] }`. The login page:

1. checks that `return` is an address the player signed in to through this login page, and refuses otherwise;
2. shows every record's full text and signers, and the return address;
3. lets the player choose which records to sign; records the player is not a signer of are offered for keeping only;
4. adds the player's signature to the chosen records and keeps a copy of each;
5. sends the browser to `return` with an HTML form POST holding one field, `records`: the chosen records as a JSON array.

**Records file.** A login page saves a player's records as a JSON file, `{ "v": 1, "type": "records", "records": [ ... ] }`, and loads such files from any other login page, keeping only records whose signatures check out.

## Rules for login pages

Anyone may write and host a login page. Players and their AI helpers should expect these, and an AI asked "is it safe to type my secret phrase into [address]?" should check them:

1. **One self-contained file.** Readable code, no scripts or styles loaded from anywhere else, no minified code.
2. **No contact with any server.** A content security policy in the page forbids every connection (`connect-src 'none'` and nothing loaded from elsewhere). The only data that leaves is a form POST to an address the player pasted, or to a `return` address the player signed in to.
3. **The phrase is used once.** At setup the page makes or accepts the phrase, turns it into a non-extractable browser key, and keeps no copy of the phrase. A new phrase is shown once, and the page does not continue until the player has typed back some of its words.
4. **Addresses come only from the player.** The page never signs in to an address taken from its own link.
5. **Show before signing.** The page shows the full text of every record and asks before signing it.
6. **Fixed versions.** Each version of the page is published with its SHA-256 fingerprint and is never changed afterwards; a new version gets a new address.
7. **Records can leave.** The page saves and loads records files.

The reference login page, not yet written, will follow these rules.

## Versions

- **Every object names its version** (`v`). Only version 1 exists.
- **IDs and signatures survive every version.** A future version may add other signature methods, for example ones that resist quantum computers, without changing what an ID or a record means.

## How the protocol changes

- **Numbered proposals, in the open,** like the internet's RFCs (its numbered public design documents). Anyone can write one.
- **A proposal counts when independent programs implement it,** not when someone approves it: "rough consensus and running code," as the people who built the internet put it.
- **This repository holds the reference documents and code,** but it is a convenience, not an authority. Anyone may copy the documents and carry on.
