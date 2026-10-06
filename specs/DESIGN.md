# Endless Mind: design

What Endless Mind is, the decisions behind it, and why. The exact formats are in [PROTOCOL.md](PROTOCOL.md).

## The idea

AI coding agents let anyone make a game, or any other program, just by describing it. Endless Mind is meant to connect everything people make this way into one free, open network, the way the web connects websites. There is no company in the middle and no central server. The project starts the framework; it should be able to keep growing without us.

What makes it one network rather than many separate games is identity: a player is the same player everywhere, and what they earn in one realm can be shown in another, with proof.

## Words used here

- **Realm:** anything people enter: a game, a place, a shop, a tool, or many games at once. A realm is a key pair, and its ID is its identity. Where it runs (one web address, many, none, a new one every day) does not change who it is.
- **Game:** an everyday word with no technical meaning here. One realm may hold many games, and one game may span several realms.
- **Player:** whoever enters a realm, a person or an AI. A player is a key pair too.
- **ID:** the public half of a key pair, written as 52 letters and digits. Player IDs and realm IDs look alike. Players read it as **player ID**.
- **Secret phrase:** 24 words that make a key pair. The same words make the same key on any device, in any program that follows [PROTOCOL.md](PROTOCOL.md).
- **Proof:** a signature: what a key pair makes to show "the holder of this ID agreed to this exact text." Anyone can check it; nobody can make one without the secret.
- **Login page:** a small web page that holds a player's key inside their browser and makes proofs for them. Anyone can write or host one.
- **Sign-in note:** a proof that a player wants to enter a realm at a particular web address, now.
- **Record:** a short text signed by one or more IDs, such as a realm and its players. Anyone holding it can show it to anyone.

## Decisions

**What it is**

- **Not just games.** Games come first because they show the idea best, but a realm can be anything.
- **The protocol is the network.** Endless Mind is a few rules for keys, proofs and records, not a product. Any program that follows them takes part.
- **Growth over control.** The aim is to spread as widely as possible, even at the cost of the founder's control. Once it is popular, nobody, including the founder, should be able to shut it down.
- **Freedom almost always wins over safety.** Each person decides what to trust; the project adds few protections of its own.

**Identity**

- **A key pair is an identity.** A player is a key pair, and so is a realm. Whoever holds the secret is that player or realm, on any device. There are no accounts, passwords or email addresses.
- **24 words are the secret.** The phrase follows published standards (BIP39 and SLIP-0010), so every login page, app or program makes the same key from the same words. A player can write it on paper or keep it in a file, and can move to any other login page by typing it there.
- **One ID everywhere.** A player enters every realm under the same ID, so what they earn travels with them. The cost is that realms can compare notes about an ID; for reputation, that is the point.
- **A stolen or lost phrase cannot be fixed.** Anyone with the phrase is that player forever, and a lost phrase cannot be recovered by anyone. The only remedy is to start over with a new phrase and no history.
- **The secret never leaves the player's device.** A login page turns the phrase into a key stored inside the browser so that it can sign but can never be read out, not even by the page's own code, and then forgets the phrase. The page cannot show the phrase again, so setup is the player's only chance to write it down.
- **Guests are always possible.** A realm may let anyone play without a player ID. Guests simply build no reputation.

**Login pages**

- **No single trusted login page.** Anyone may write and host one. Players trust a login page because they, or their AI helper, checked its code, not because of who runs it. The project provides one small reference page; others may make better ones.
- **Login pages are built to be checked.** [PROTOCOL.md](PROTOCOL.md) lists rules a login page should follow, chosen so any AI coder can confirm in minutes that "your secret phrase is used only to prove you have it, and it never leaves this device." The recommended question for players: "Someone asked me to type my secret phrase into [address]. Is it safe?"
- **Reviews are records too.** Anyone may sign a record saying "I checked the login page with fingerprint X and found it safe." Such reviews carry the reviewer's own reputation.
- **The login page does the signing, not the login server.** The server only hands out the page. It never has the key, so it cannot pretend to be anyone. If it disappears, the player types their phrase into another login page and carries on.

**Signing in**

- **Paste the realm's address, press Play.** The realm shows its address. The player pastes it into their login page and presses Play. The page signs a sign-in note naming that address and sends the player there with it. Pasting and pressing Play is the confirmation; there is no second question.
- **The address in the note stops replay.** A realm accepts a sign-in note only if it names one of the realm's own addresses, recently, with a random number it has not seen before. HTTPS guarantees that nobody else receives traffic for that address, so a note made for one realm is useless at any other.
- **The address must come from the player.** A login page never takes the address from its own link, or any web page could sign a player in somewhere they never chose.
- **Native programs work the same way.** A program built with a game engine shows a join address with a one-time code (or a QR code). The player's login page delivers the sign-in note there, and the realm lets in the program waiting on that code.

**Records and reputation**

- **Reputation only grows.** A record is signed by everyone it needs, and a realm can never sign for a player. Players keep the records they like and drop the rest, so there is no such thing as a bad reputation: only reputation earned, or none. Realms that need caution give newcomers less until they earn more.
- **A record says only "these IDs agreed to this text, back then."** Whoever holds it can show it to anyone, who checks every signature without contacting anyone. Whether it is still true is for the reader to judge.
- **A realm's own statements need only its signature,** for example "this player is in good standing as of 2026-12-01."
- **Agreements need every party's signature.** A trade is one record ("P gives the helmet to Q, and Q gives 95 diamonds to P") signed by P, Q and the realm. Nothing is final until all have signed, and the realm moves items only after the last signature.
- **The player's login page signs for the player, and always shows the text first.** Realms may ask during play (for trades) or gather proposals until the player leaves (for achievements). The player reads every record before agreeing; an agreement is not always good news.
- **Records travel with the player.** A login page keeps the records its player signed or received and can save them as a file, which any other login page can load. Since every record is signed, nobody can slip a fake into the file.
- **A record is worth what its signers are worth.** A realm that signs false records loses the trust of other realms, which then ignore its records.

**The project**

- **License: MIT or Apache 2.0, the user's choice; the specs in the public domain (CC0).** Anyone may build on any of it. Contributions come in under the same terms, so nobody, including the founder, holds extra rights.
- **Code: plain JavaScript, no build step.** Shared code runs unchanged in browsers and Deno, so anyone can read it, copy it and host it.

## Not decided yet

These are being worked out. The leanings below are not commitments.

- **Finding realms.** Leaning: signed listings that anyone may copy, ranked by recommendations from people you follow rather than raw popularity, with relays acting as curators.
- **Making and hosting.** Leaning: a game is made without knowledge of the network, then wrapped. A browser game with no server is uploaded and served as it is. A multiplayer server written as one sandboxed JavaScript file can be run by volunteer hosts. Anything else is run with a downloadable program (`em`), at home or on a server that takes HTTPS connections from players.
- **Relays.** Leaning: optional, for realms on home computers that cannot accept connections, and as places to list and promote realms. Anyone can run one.
- **Distribution.** Leaning: releases are ordinary torrents with web seeds, so any BitTorrent client can fetch and share them.
- **A realm's key is stolen.** The thief could sign records in the realm's name. A signed "my key was stolen as of this date" needs a place everyone checks, which waits on finding realms.

## Safety and law

- Safety has no central moderator, so it lives with each person: their AI helper can check a login page or a realm's code, and they decide what to trust.
- Like the web, the protocol cannot enforce law centrally. Each person is responsible for what their own realms do, and each host for what they run and list. "No single point of failure, like email", never "built to escape authorities".

## Original work only

Endless Mind is a tool for making original things. The project never suggests, shows or encourages copying anyone else's game, characters, names, art, music or other protected work, in its docs, examples, demos, code or promotion. Examples use invented names. Every place that tells people how to make a realm asks them to be original, and each builder is responsible for holding the rights to what they publish. The project runs no official network; it provides software, and whoever runs it is responsible for operating it.
